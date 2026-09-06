import { useState, useEffect, useRef } from 'react';
import { Caja, Venta } from '../types';
import { getCajaHoy, crearCaja, reiniciarCaja } from '../services/cajaService';
import { getTodosGastos } from '../services/gastosService';
import { useNegocio } from '../context/NegocioContext';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { toValidAdminDate } from '@/utils/adminAnalytics';

export interface UseCajaResult {
  cajaActual: Caja | null;
  loading: boolean;
  error: string | null;
  ventasEfectivo: number;
  crearCajaHoy: (montoInicial: number) => Promise<void>;
  refresh: () => Promise<void>;
  reiniciarCajaHoy: () => Promise<void>;
}

/**
 * Hook para manejar la caja del día
 */
export function useCaja(): UseCajaResult {
  const { negocioActual } = useNegocio();
  const tenantId = negocioActual.id;
  const [cajaActual, setCajaActual] = useState<Caja | null>(null);
  const [ventasEfectivo, setVentasEfectivo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);

  /**
   * Obtener ventas en efectivo del día
   */
  const obtenerVentasEfectivo = async (): Promise<number> => {
    try {
      const hoy = new Date();
      const fechaInicio = new Date(hoy);
      fechaInicio.setHours(0, 0, 0, 0);
      const fechaFin = new Date(hoy);
      fechaFin.setHours(23, 59, 59, 999);

      const ventasRef = collection(db, 'ventas');
      const q = query(
        ventasRef,
        where('negocioId', '==', tenantId),
        where('metodoPago', '==', 'efectivo'),
        where('fecha', '>=', Timestamp.fromDate(fechaInicio)),
        where('fecha', '<=', Timestamp.fromDate(fechaFin))
      );

      const snapshot = await getDocs(q);
      const total = snapshot.docs.reduce((sum, doc) => {
        const venta = doc.data() as Venta;
        return sum + (venta.total || 0);
      }, 0);

      return total;
    } catch (err) {
      console.error('Error getting ventas efectivo:', err);
      return 0;
    }
  };

  /**
   * Cargar caja actual con ventas integradas y gastos del día
   */
  const cargarCaja = async () => {
    const generation = ++requestGenerationRef.current;
    setLoading(true);
    try {
      const [caja, ventas, todosGastos] = await Promise.all([
        getCajaHoy(tenantId),
        obtenerVentasEfectivo(),
        getTodosGastos(tenantId),
      ]);
      if (generation !== requestGenerationRef.current) return;

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const gastosDelDia = todosGastos
        .filter((gasto) => {
          const fechaGasto = toValidAdminDate(gasto.fecha);
          if (!fechaGasto) return false;
          const fechaNormalizada = new Date(fechaGasto);
          fechaNormalizada.setHours(0, 0, 0, 0);
          return fechaNormalizada.getTime() === hoy.getTime();
        })
        .reduce((sum, gasto) => sum + (gasto.monto || 0), 0);

      setVentasEfectivo(ventas);
      
      if (caja) {
        // Calcular saldo: inicial + ingresos + ventas - gastos del día
        const egresosTotales = caja.egresos + gastosDelDia;
        const saldoActualizado = caja.montoInicial + caja.ingresos + ventas - egresosTotales;
        
        setCajaActual({
          ...caja,
          ingresos: caja.ingresos + ventas,
          egresos: egresosTotales,
          saldoActual: saldoActualizado,
        });
      } else {
        setCajaActual(null);
      }
      
      setError(null);
    } catch (err) {
      if (generation !== requestGenerationRef.current) return;
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error cargando caja: ${errMsg}`);
      console.error('Error loading caja:', err);
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false);
    }
  };

  /**
   * Crear caja para hoy
   */
  const crearCajaHoy = async (montoInicial: number) => {
    try {
      await crearCaja(tenantId, montoInicial);
      await cargarCaja();
      setError(null);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error creando caja: ${errMsg}`);
      console.error('Error creating caja:', err);
      throw err;
    }
  };

  /**
   * Refrescar caja
   */
  const refresh = async () => {
    await cargarCaja();
  };

  /**
   * Reiniciar caja
   */
  const reiniciarCajaHoy = async () => {
    try {
      if (!cajaActual?.id) {
        throw new Error('No hay caja activa para reiniciar');
      }
      await reiniciarCaja(cajaActual.id, tenantId);
      await cargarCaja();
      setError(null);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error reiniciando caja: ${errMsg}`);
      console.error('Error reiniciando caja:', err);
      throw err;
    }
  };

  /**
   * Cargar caja al montar el componente
   */
  useEffect(() => {
    cargarCaja();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [tenantId]);

  return {
    cajaActual,
    loading,
    error,
    ventasEfectivo,
    crearCajaHoy,
    refresh,
    reiniciarCajaHoy,
  };
}
