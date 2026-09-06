// src/pages/GastosPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Gasto, CategoriaGasto } from '@/types';
import {
  crearGasto,
  getTodosGastos,
  eliminarGasto,
} from '@/services/gastosService';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { createToast } from '@/components/ui/Toast';
import { formatCOP } from '@/utils/formatCOP';
import { parseFiniteNumber, validatePositiveAmount } from '@/utils/adminInputValidation';
import { formatHora } from '@/utils/dateUtils';
import { toValidAdminDate } from '@/utils/adminAnalytics';
import { AlertCircle, Clock, DollarSign, Plus, Trash2 } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useNegocio } from '@/context/NegocioContext';

const categorias: CategoriaGasto[] = ['gas', 'insumos', 'mantenimiento', 'otros', 'domiciliario', 'servicios', 'varios', 'salarios'];

function formatFechaGasto(fecha: unknown): string {
  const date = toValidAdminDate(fecha);
  return date ? date.toLocaleDateString('es-CO') : 'Sin fecha';
}

function formatHoraGasto(fecha: unknown): string {
  const date = toValidAdminDate(fecha);
  return date ? formatHora(date) : '--:--';
}

export function GastosPage() {
  const { negocioActual, esSuperAdmin, usuarioNegocio } = useNegocio();
  const puedeEliminar = esSuperAdmin || usuarioNegocio?.rol === 'admin';
  // Estado de Gastos
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loadingGastos, setLoadingGastos] = useState(true);
  const [creandoGasto, setCreandoGasto] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [concepto, setConcepto] = useState('');
  const [montoStr, setMontoStr] = useState('');
  const [categoria, setCategoria] = useState<CategoriaGasto>('gas');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const requestGenerationRef = useRef(0);

  const cargarGastos = async () => {
    const tenantId = negocioActual.id;
    const generation = ++requestGenerationRef.current;
    setLoadingGastos(true);
    setLoadError(null);
    try {
      const datos = await getTodosGastos(tenantId);
      if (generation !== requestGenerationRef.current) return;
      setGastos(datos);
    } catch (err) {
      if (generation !== requestGenerationRef.current) return;
      console.error('Error cargando gastos:', err);
      setLoadError('No fue posible consultar los gastos.');
    } finally {
      if (generation === requestGenerationRef.current) setLoadingGastos(false);
    }
  };

  useEffect(() => {
    cargarGastos();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [negocioActual.id]);

  const handleCrearGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!concepto.trim()) newErrors.concepto = 'Concepto requerido';
    const montoError = validatePositiveAmount(montoStr);
    if (montoError) newErrors.monto = montoError;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const monto = parseFiniteNumber(montoStr) as number;
      const data: Omit<Gasto, 'id'> = {
        negocioId: negocioActual.id,
        concepto: concepto.trim(),
        monto,
        categoria,
        // Timestamp.now() conserva la hora exacta del gasto.
        fecha: Timestamp.now(),
      };

      await crearGasto(data);
      createToast('Gasto registrado', 'success');

      // Limpiar formulario y refrescar
      setConcepto('');
      setMontoStr('');
      setCategoria('gas');
      setCreandoGasto(false);
      await cargarGastos();
    } catch (err) {
      console.error('Error creando gasto:', err);
      createToast('Error al registrar el gasto', 'error');
    }
  };

  const handleEliminarGasto = async (gasto: Gasto) => {
    if (!window.confirm(`¿Eliminar el gasto "${gasto.concepto}"?`)) return;
    try {
      await eliminarGasto(gasto.id, negocioActual.id);
      createToast('Gasto eliminado', 'success');
      await cargarGastos();
    } catch (err) {
      console.error('Error eliminando gasto:', err);
      createToast('Error al eliminar el gasto', 'error');
    }
  };

  const totalGastos = gastos.reduce((sum, g) => sum + (g.monto || 0), 0);

  if (loadError && !loadingGastos) {
    return (
      <div className="min-h-screen bg-base-dark px-4 pb-28 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-900">
          <EmptyState
            icon={AlertCircle}
            title="No pudimos cargar los gastos"
            description="No mostramos un total de $0 porque la consulta falló. Reintenta para ver los datos reales."
            action={{ label: 'Reintentar', onClick: cargarGastos }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-dark pb-28 pt-6 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Gastos operativos</h1>
            <p className="mt-1 text-xs sm:text-sm text-neutral-400">
              Control de egresos del negocio
            </p>
          </div>

          <Button
            onClick={() => setCreandoGasto(!creandoGasto)}
            variant="primary"
            className="flex items-center gap-2 text-xs"
          >
            <Plus size={15} />
            {creandoGasto ? 'Cancelar' : 'Registrar Gasto'}
          </Button>
        </div>

        <div className="space-y-6">
            {/* KPI Resumen de Gastos */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <Card className="p-4 bg-neutral-900/90 border-neutral-800">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Total Acumulado en Egresos</p>
                <p className="mt-2 text-2xl font-bold text-red-400 font-display">{formatCOP(totalGastos)}</p>
              </Card>
              <Card className="p-4 bg-neutral-900/90 border-neutral-800">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Registros de Gastos</p>
                <p className="mt-2 text-2xl font-bold text-white font-display">{gastos.length}</p>
              </Card>
              <Card className="p-4 bg-neutral-900/90 border-neutral-800">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Gasto Promedio</p>
                <p className="mt-2 text-2xl font-bold text-gold-400 font-display">
                  {gastos.length > 0 ? formatCOP(totalGastos / gastos.length) : formatCOP(0)}
                </p>
              </Card>
            </div>

            {/* Formulario de Registro de Gasto */}
            {creandoGasto && (
              <Card className="p-5 bg-neutral-900/90 border-neutral-800 max-w-2xl mx-auto shadow-xl">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <DollarSign size={16} className="text-gold-400" />
                  Nuevo Registro de Gasto
                </h3>
                <form onSubmit={handleCrearGasto} className="space-y-4">
                  <Input
                    label="Concepto"
                    value={concepto}
                    onChange={(e) => {
                      setConcepto(e.target.value);
                      if (errors.concepto) setErrors({ ...errors, concepto: '' });
                    }}
                    placeholder="Ej: Pago de gas, compra de desechables, salario turno"
                    error={errors.concepto}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      label="Monto en pesos (COP)"
                      type="number"
                      min="1"
                      step="500"
                      value={montoStr}
                      onChange={(e) => {
                        setMontoStr(e.target.value);
                        if (errors.monto) setErrors({ ...errors, monto: '' });
                      }}
                      placeholder="Ej: 50000"
                      error={errors.monto}
                    />

                    <Select
                      label="Categoría"
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}
                      options={categorias.map((cat) => ({
                        value: cat,
                        label: cat.charAt(0).toUpperCase() + cat.slice(1),
                      }))}
                    >
                      {categorias.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <Button type="submit" variant="primary" className="w-full text-xs">
                    Guardar Gasto
                  </Button>
                </form>
              </Card>
            )}

            {/* Listado de Gastos */}
            {loadingGastos ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-xl" />
                ))}
              </div>
            ) : gastos.length === 0 ? (
              <EmptyState icon={DollarSign} title="Sin gastos" description="No hay egresos registrados en este periodo" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {gastos.map((gasto) => {
                  const categoriaColors: Record<CategoriaGasto, { bg: string; text: string }> = {
                    salarios: { bg: 'bg-blue-950/20 border-blue-900/40', text: 'text-blue-400' },
                    servicios: { bg: 'bg-yellow-950/20 border-yellow-900/40', text: 'text-yellow-400' },
                    insumos: { bg: 'bg-emerald-950/20 border-emerald-900/40', text: 'text-emerald-400' },
                    mantenimiento: { bg: 'bg-purple-950/20 border-purple-900/40', text: 'text-purple-400' },
                    otros: { bg: 'bg-neutral-900 border-neutral-800', text: 'text-neutral-300' },
                    gas: { bg: 'bg-orange-950/20 border-orange-900/40', text: 'text-orange-400' },
                    domiciliario: { bg: 'bg-indigo-950/20 border-indigo-900/40', text: 'text-indigo-400' },
                    varios: { bg: 'bg-slate-900 border-slate-800', text: 'text-slate-300' },
                  };
                  const colors = categoriaColors[gasto.categoria] || categoriaColors.otros;
                  return (
                    <Card key={gasto.id} className={`p-4 transition-all ${colors.bg} hover:border-neutral-700 flex flex-col justify-between`}>
                      <div>
                        <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
                          <span className="font-semibold text-white text-xs sm:text-sm truncate max-w-[200px]">{gasto.concepto}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 capitalize">
                            {gasto.categoria}
                          </Badge>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
                          <span>{formatFechaGasto(gasto.fecha)}</span>
                          <span className="flex items-center gap-1 rounded bg-neutral-800/60 px-1.5 py-0.5 text-[10px]">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {formatHoraGasto(gasto.fecha)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 pt-2 border-t border-neutral-800/80 flex items-center justify-between">
                        <p className={`text-xl font-bold ${colors.text} font-display`}>{formatCOP(gasto.monto)}</p>
                        {puedeEliminar && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleEliminarGasto(gasto)}
                            title="Eliminar gasto"
                            aria-label={`Eliminar gasto ${gasto.concepto}`}
                            className="p-1.5 h-8 w-8"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
        </div>
      </div>

    </div>
  );
}
