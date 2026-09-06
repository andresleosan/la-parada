import { useState, useEffect, useRef } from 'react';
import { Domicilio, EstadoDomicilio } from '../types';
import {
  getDomiciliosActivos,
  getDomiciliosEntregados,
  onDomiciliosActivosChange,
  updateDomicilioEstado,
  finalizarDomicilio,
} from '../services/domiciliosService';
import { useNegocio } from '@/context/NegocioContext';
import { createScopedRequestGuard } from '@/utils/scopedRequestGuard';

export interface UseDomiciliosResult {
  activos: Domicilio[];
  entregados: Domicilio[];
  loading: boolean;
  error: string | null;
  updateEstado: (id: string, nuevoEstado: EstadoDomicilio) => Promise<void>;
  marcarEntregado: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useDomicilios(): UseDomiciliosResult {
  const { negocioActual } = useNegocio();
  const tenantId = negocioActual.id;
  const [activos, setActivos] = useState<Domicilio[]>([]);
  const [entregados, setEntregados] = useState<Domicilio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scopeKey = tenantId;
  const activeScopeRef = useRef(scopeKey);
  const refreshGuardRef = useRef(createScopedRequestGuard());
  activeScopeRef.current = scopeKey;

  useEffect(() => {
    setLoading(true);
    setError(null);
    setActivos([]);
    setEntregados([]);
    let cancelled = false;
    let activosSettled = false;
    let entregadosSettled = false;
    let initialLoadComplete = false;
    const isActiveScope = () => !cancelled && activeScopeRef.current === scopeKey;
    const finishInitialLoad = () => {
      if (
        initialLoadComplete
        || !isActiveScope()
        || !activosSettled
        || !entregadosSettled
      ) return;
      initialLoadComplete = true;
      setLoading(false);
    };

    // Timeout de 10 segundos para evitar carga infinita
    const timeoutId = setTimeout(() => {
      if (!isActiveScope()) return;
      initialLoadComplete = true;
      setLoading(false);
      setError('Tiempo de carga agotado. Intenta nuevamente.');
    }, 10000);

    // Suscribirse a domicilios activos con listener
    const unsubscribeActivos = onDomiciliosActivosChange(
      tenantId,
      (datos) => {
        if (!isActiveScope()) return;
        activosSettled = true;
        setActivos(datos);
        finishInitialLoad();
        if (initialLoadComplete) clearTimeout(timeoutId);
      },
      (listenerError) => {
        if (!isActiveScope()) return;
        activosSettled = true;
        initialLoadComplete = true;
        console.error('Error in domicilios listener:', listenerError);
        setError(`Error: ${listenerError.message}`);
        setLoading(false);
        clearTimeout(timeoutId);
      }
    );

    // Cargar historial de entregados (fetch inicial, sin listener)
    const cargarEntregados = async () => {
      try {
        const datos = await getDomiciliosEntregados(tenantId);
        if (!isActiveScope()) return;
        entregadosSettled = true;
        setEntregados(datos);
        finishInitialLoad();
        if (initialLoadComplete) clearTimeout(timeoutId);
      } catch (err) {
        if (!isActiveScope()) return;
        entregadosSettled = true;
        initialLoadComplete = true;
        console.error('Error loading entregados:', err);
        setError('Error cargando historial');
        setLoading(false);
        clearTimeout(timeoutId);
      }
    };

    cargarEntregados();

    // Cleanup: desuscribirse del listener y limpiar timeout
    return () => {
      cancelled = true;
      refreshGuardRef.current.invalidate();
      unsubscribeActivos();
      clearTimeout(timeoutId);
    };
  }, [tenantId]);

  const updateEstado = async (id: string, nuevoEstado: EstadoDomicilio) => {
    try {
      await updateDomicilioEstado(id, nuevoEstado, tenantId);
      // El listener se actualizará automáticamente
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Error actualizando estado: ${errMsg}`);
      throw err;
    }
  };

  const marcarEntregado = async (id: string) => {
    try {
      await finalizarDomicilio(id, tenantId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Error marcando entregado: ${errMsg}`);
      throw err;
    }
  };

  const refresh = async () => {
    const request = refreshGuardRef.current.begin(scopeKey);
    setLoading(true);
    try {
      const [activosActuales, entregadosActuales] = await Promise.all([
        getDomiciliosActivos(tenantId),
        getDomiciliosEntregados(tenantId),
      ]);
      if (!refreshGuardRef.current.isCurrent(request, activeScopeRef.current)) return;
      setActivos(activosActuales);
      setEntregados(entregadosActuales);
      setError(null);
    } catch (err) {
      if (!refreshGuardRef.current.isCurrent(request, activeScopeRef.current)) return;
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Error refrescando: ${errMsg}`);
    } finally {
      if (refreshGuardRef.current.isCurrent(request, activeScopeRef.current)) {
        setLoading(false);
      }
    }
  };

  return {
    activos,
    entregados,
    loading,
    error,
    updateEstado,
    marcarEntregado,
    refresh,
  };
}
