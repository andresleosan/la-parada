// src/pages/DashboardPage.tsx

import { useState } from 'react';
import { 
  TrendingUp, 
  ShoppingBag, 
  Bike, 
  RefreshCw, 
  Wallet, 
  Plus, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  Package,
  Clock,
  Sparkles,
  AlertCircle,
  Banknote,
  Landmark,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ValoresRapidos } from '@/components/ui/ValoresRapidos';
import { Badge } from '@/components/ui/Badge';
import { useJornada } from '@/context/JornadaContext';
import { useReportes } from '@/hooks/useReportes';
import { useDomicilios } from '@/hooks/useDomicilios';
import { useCaja } from '@/hooks/useCaja';
import { sumarIngresosCaja } from '@/services/cajaService';
import { formatCOP } from '@/utils/formatCOP';
import { createToast } from '@/components/ui/Toast';
import { useNegocio } from '@/context/NegocioContext';
import { parseFiniteNumber, validateNonNegativeAmount, validatePositiveAmount } from '@/utils/adminInputValidation';
import { countSalesOnDate, toValidAdminDate } from '@/utils/adminAnalytics';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';

const ordenCategorias = ['gas', 'insumos', 'mantenimiento', 'otros', 'domiciliario', 'servicios', 'varios', 'salarios'];

export function DashboardPage() {
  const { jornadaActual } = useJornada();
  const { negocioActual } = useNegocio();
  const { resumen, ventas, loading: loadingReportes, error: reportesError, refresh: refreshReportes } = useReportes();
  const {
    activos,
    entregados,
    loading: loadingDomicilios,
    error: domiciliosError,
    refresh: refreshDomicilios,
  } = useDomicilios('ambas');
  const { cajaActual, loading: loadingCaja, error: cajaError, crearCajaHoy, refresh: refreshCaja, reiniciarCajaHoy } = useCaja();
  
  const [refreshing, setRefreshing] = useState(false);
  const [mostrarFormularioCaja, setMostrarFormularioCaja] = useState(false);
  const [montoCajaStr, setMontoCajaStr] = useState('');
  const [creandoCaja, setCreandoCaja] = useState(false);
  
  const [cargandoReiniciar, setCargandoReiniciar] = useState(false);
  
  const [mostrarFormularioAgregar, setMostrarFormularioAgregar] = useState(false);
  const [montoAgregar, setMontoAgregar] = useState('');
  const [cargandoAgregar, setCargandoAgregar] = useState(false);
  const pendientes = activos.filter(d => d.estado === 'en_camino').length;
  const totalDomicilios = activos.length + entregados.length;
  const pedidosHoy = countSalesOnDate(ventas, new Date());
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const pedidosAyer = countSalesOnDate(ventas, ayer);
  const jornadaDashboardLabel = jornadaActual === 'mañana'
    ? 'Mañana/Tarde'
    : jornadaActual === 'noche'
      ? 'Noche'
      : 'Todo el día';

  // Calcular transferencias de hoy
  const ventasTransferencia = ventas
    .filter(v => {
      const fechaVentaDate = toValidAdminDate(v.fecha);
      if (!fechaVentaDate) return false;
      const normalizedSaleDate = new Date(fechaVentaDate);
      normalizedSaleDate.setHours(0, 0, 0, 0);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      return normalizedSaleDate.getTime() === hoy.getTime() && v.metodoPago === 'transferencia';
    })
    .reduce((sum, v) => sum + (v.total || 0), 0);

  // Total general: solo medios offline vigentes.
  const totalGeneral = (cajaActual?.saldoActual || 0) + ventasTransferencia;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshReportes(), refreshCaja(), refreshDomicilios()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCrearCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    const montoError = validateNonNegativeAmount(montoCajaStr);
    if (montoError) {
      createToast(montoError, 'error');
      return;
    }

    try {
      setCreandoCaja(true);
      const monto = parseFiniteNumber(montoCajaStr) as number;
      await crearCajaHoy(monto);
      createToast('Caja iniciada', 'success');
      setMontoCajaStr('');
      setMostrarFormularioCaja(false);
    } catch (err) {
      createToast('Error creando caja', 'error');
      console.error('Error:', err);
    } finally {
      setCreandoCaja(false);
    }
  };

  const handleReiniciarCaja = async () => {
    if (!cajaActual) return;
    if (!window.confirm('¿Reiniciar los ajustes manuales? La base, los ingresos y egresos manuales volverán a $0. Las ventas y gastos registrados hoy seguirán reflejados.')) return;

    setCargandoReiniciar(true);
    try {
      await reiniciarCajaHoy();
      createToast('Ajustes manuales reiniciados; se conservaron las ventas y gastos del día', 'success');
      await refreshCaja();
    } catch (err) {
      createToast('Error reiniciando caja', 'error');
      console.error('Error:', err);
    } finally {
      setCargandoReiniciar(false);
    }
  };

  const handleAgregarSaldo = async (e: React.FormEvent) => {
    e.preventDefault();
    const montoError = validatePositiveAmount(montoAgregar);
    if (montoError) {
      createToast(montoError, 'error');
      return;
    }

    if (!cajaActual) {
      createToast('No hay caja abierta', 'error');
      return;
    }

    try {
      setCargandoAgregar(true);
      const monto = parseFiniteNumber(montoAgregar) as number;
      await sumarIngresosCaja(cajaActual.id, monto, negocioActual.id);
      await refreshCaja();
      createToast('Saldo agregado correctamente', 'success');
      setMontoAgregar('');
      setMostrarFormularioAgregar(false);
    } catch (err) {
      createToast('Error agregando saldo', 'error');
      console.error('Error:', err);
    } finally {
      setCargandoAgregar(false);
    }
  };

  // Porcentajes de métodos de pago
  const pctEfectivo = totalGeneral > 0 ? Math.round(((cajaActual?.saldoActual || 0) / totalGeneral) * 100) : 0;
  const pctTransferencia = totalGeneral > 0 ? Math.round((ventasTransferencia / totalGeneral) * 100) : 0;
  const dashboardError = reportesError || cajaError || domiciliosError;

  if (dashboardError && !loadingReportes && !loadingCaja && !loadingDomicilios) {
    return (
      <div className="min-h-screen bg-base-dark px-4 pb-28 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-900">
          <EmptyState
            icon={AlertCircle}
            title="No pudimos cargar el pulso operativo"
            description="No mostramos cifras parciales como si fueran completas. Reintenta la consulta."
            action={{ label: 'Reintentar', onClick: handleRefresh }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-dark pb-24 pt-4 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header con Jornada y Acciones */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                Dashboard
              </h1>
              <Badge variant="outline" className="border-gold-400/40 bg-gold-400/10 text-gold-400 text-xs px-2.5 py-0.5">
                <Clock className="w-3 h-3 mr-1 inline" />
                {jornadaDashboardLabel}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              Visión general operativa, financiera y pedidos en tiempo real
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {!cajaActual && !loadingCaja && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setMostrarFormularioCaja(true)}
                className="flex items-center gap-1.5 text-xs shadow-lg shadow-gold-500/10"
              >
                <Plus className="h-4 w-4" />
                Iniciar Caja
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-gold-400' : ''}`} />
              {refreshing ? 'Actualizando...' : 'Actualizar'}
            </Button>
          </div>
        </div>

        {/* 🌟 4 KPI Cards Principales (Grid responsive 2x2 en móvil / 4 cols en desktop) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          {/* Card 1: Ventas registradas */}
          <Card className="p-4 sm:p-5 bg-neutral-900/90 border-neutral-800 hover:border-neutral-700 transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Ventas · 30 días</span>
              <div className="p-2 rounded-lg bg-gold-400/10 text-gold-400">
                <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xl sm:text-2xl font-bold text-white font-display">
                {loadingReportes ? <Skeleton className="h-8 w-28" /> : formatCOP(resumen.totalVentas)}
              </div>
              <div className="flex items-center gap-1 text-[11px] sm:text-xs text-green-400 font-medium mt-1">
                <TrendingUp className="h-3 w-3 inline" />
                <span>{resumen.cantidadVentas} órdenes completadas</span>
              </div>
            </div>
          </Card>

          {/* Card 2: Resultado acumulado */}
          <Card className="p-4 sm:p-5 bg-neutral-900/90 border-neutral-800 hover:border-neutral-700 transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Resultado · 30 días</span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-display">
                {loadingReportes ? <Skeleton className="h-8 w-28" /> : formatCOP(resumen.gananciaNeta)}
              </div>
              <p className="text-[11px] sm:text-xs text-neutral-400 mt-1">
                Ingresos menos gastos
              </p>
            </div>
          </Card>

          {/* Card 3: Saldo en Caja */}
          <Card className="p-4 sm:p-5 bg-neutral-900/90 border-neutral-800 hover:border-neutral-700 transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Caja en Efectivo</span>
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xl sm:text-2xl font-bold text-purple-400 font-display">
                {loadingCaja ? (
                  <Skeleton className="h-8 w-28" />
                ) : cajaActual ? (
                  formatCOP(cajaActual.saldoActual)
                ) : (
                  <span className="text-neutral-500 text-lg">No iniciada</span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-neutral-400 mt-1">
                {cajaActual ? `Base: ${formatCOP(cajaActual.montoInicial)}` : 'Requiere apertura'}
              </p>
            </div>
          </Card>

          {/* Card 4: Domicilios */}
          <Card className="p-4 sm:p-5 bg-neutral-900/90 border-neutral-800 hover:border-neutral-700 transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Domicilios</span>
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Bike className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xl sm:text-2xl font-bold text-cyan-400 font-display flex items-baseline gap-2">
                {loadingDomicilios ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <span>{totalDomicilios} <span className="text-xs font-normal text-neutral-400">totales</span></span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] sm:text-xs mt-1">
                <span className="text-orange-400 font-semibold">{pendientes} en camino</span>
                <span className="text-neutral-600">•</span>
                <span className="text-green-400">{entregados.length} creados hoy y entregados</span>
              </div>
            </div>
          </Card>

        </div>

        {/* 🏢 Sección Central en 2 Columnas (Desktop: 7fr / 5fr) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* COLUMNA IZQUIERDA (7 columnas): Control de Caja + Desglose de Fondos */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Tarjeta de Control de Caja */}
            <Card className="p-5 bg-neutral-900/90 border-neutral-800">
              <div className="flex flex-col items-start justify-between gap-3 border-b border-neutral-800 pb-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-gold-400" />
                  <h2 className="text-base font-bold text-white">Estado de Caja</h2>
                  {cajaActual ? (
                    <Badge variant="outline" className="border-green-500/40 text-green-400 bg-green-500/10 text-[10px]">
                      ● Activa
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]">
                      ● Pendiente
                    </Badge>
                  )}
                </div>

                {cajaActual && !loadingCaja && (
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setMostrarFormularioAgregar(true)}
                      className="text-xs py-1 px-2.5 text-green-400 hover:text-green-300"
                      title="Agregar saldo a la caja"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Agregar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleReiniciarCaja}
                      loading={cargandoReiniciar}
                      disabled={cargandoReiniciar}
                      className="text-xs py-1 px-2.5 text-orange-400 hover:text-orange-300"
                      title="Reiniciar caja"
                    >
                      Reiniciar ajustes
                    </Button>
                  </div>
                )}
              </div>

              {loadingCaja ? (
                <div className="py-6 space-y-3">
                  <Skeleton className="h-10 w-48" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : cajaActual ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <span className="text-xs text-neutral-400 font-medium">Saldo Total en Efectivo</span>
                    <div className="text-3xl font-display font-bold text-white mt-0.5">
                      {formatCOP(cajaActual.saldoActual)}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 pt-2">
                    <div className="p-3 rounded-lg bg-neutral-800/60 border border-neutral-700/50">
                      <p className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Base Inicial</p>
                      <p className="text-sm font-bold text-neutral-200 mt-1">{formatCOP(cajaActual.montoInicial)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <p className="text-[10px] uppercase font-bold text-green-400 tracking-wider flex items-center gap-1">
                        <ArrowUpRight className="h-3 w-3" /> Ingresos
                      </p>
                      <p className="text-sm font-bold text-green-400 mt-1">+{formatCOP(cajaActual.ingresos)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <p className="text-[10px] uppercase font-bold text-red-400 tracking-wider flex items-center gap-1">
                        <ArrowDownRight className="h-3 w-3" /> Egresos
                      </p>
                      <p className="text-sm font-bold text-red-400 mt-1">-{formatCOP(cajaActual.egresos)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-neutral-300 font-medium">No se ha iniciado la caja para el turno de hoy.</p>
                  <p className="text-xs text-neutral-500 mt-1 mb-4">Ingresa la base inicial en efectivo para comenzar a registrar ventas.</p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setMostrarFormularioCaja(true)}
                    className="inline-flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Iniciar Caja Ahora
                  </Button>
                </div>
              )}
            </Card>

            {/* Tarjeta de Desglose de Fondos por Método de Pago */}
            <Card className="p-5 bg-neutral-900/90 border-neutral-800">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-gold-400" />
                  <h2 className="text-base font-bold text-white">Disponibilidad por medio</h2>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">Fondos registrados</span>
                  <span className="text-base font-bold text-gold-400 font-display">
                    {loadingCaja ? <Skeleton className="h-5 w-20" /> : formatCOP(totalGeneral)}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-3.5">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-neutral-300 font-semibold flex items-center gap-1.5">
                      <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
                      Efectivo en caja
                    </span>
                    <span className="text-white font-bold">
                      {formatCOP(cajaActual?.saldoActual || 0)}{' '}
                      <span className="text-[10px] font-normal text-neutral-400">({pctEfectivo}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${pctEfectivo}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-neutral-300 font-semibold flex items-center gap-1.5">
                      <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
                      Transferencias registradas
                    </span>
                    <span className="text-white font-bold">
                      {formatCOP(ventasTransferencia)}{' '}
                      <span className="text-[10px] font-normal text-neutral-400">({pctTransferencia}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pctTransferencia}%` }} />
                  </div>
                </div>

              </div>
            </Card>

          </div>

          {/* COLUMNA DERECHA (5 columnas): Rendimiento + Gastos */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Tarjeta de Métricas Operativas */}
            <Card className="p-5 bg-neutral-900/90 border-neutral-800">
              <div className="flex items-center gap-2 pb-3 border-b border-neutral-800">
                <Sparkles className="h-5 w-5 text-gold-400" />
                <h2 className="text-base font-bold text-white">Rendimiento · 30 días</h2>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {/* Venta Promedio */}
                <div className="p-3 rounded-lg bg-neutral-800/40 border border-neutral-800">
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Ticket Promedio</p>
                  <div className="text-base font-bold text-white mt-1">
                    {loadingReportes ? <Skeleton className="h-6 w-20" /> : formatCOP(resumen.ventaPromedio)}
                  </div>
                </div>

                {/* Pedidos vs Ayer */}
                <div className="p-3 rounded-lg bg-neutral-800/40 border border-neutral-800">
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Pedidos Hoy / Ayer</p>
                  <div className="text-base font-bold text-white mt-1">
                    {loadingReportes ? <Skeleton className="h-6 w-16" /> : `${pedidosHoy} / ${pedidosAyer}`}
                  </div>
                </div>

                {/* Top Producto */}
                <div className="col-span-2 p-3 rounded-lg bg-neutral-800/40 border border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-gold-400/10 text-gold-400">
                      <Package className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Producto Más Vendido</p>
                      <div className="text-sm font-semibold text-white mt-0.5">
                        {loadingReportes ? (
                          <Skeleton className="h-4 w-28" />
                        ) : resumen.productoMasVendido ? (
                          resumen.productoMasVendido.nombre
                        ) : (
                          'Sin datos aún'
                        )}
                      </div>
                    </div>
                  </div>
                  {resumen.productoMasVendido && (
                    <Badge variant="outline" className="border-gold-400/40 text-gold-400 bg-gold-400/10 font-bold">
                      {resumen.productoMasVendido.cantidad} un.
                    </Badge>
                  )}
                </div>
              </div>
            </Card>

            {/* Tarjeta de Gastos del Día */}
            <Card className="p-5 bg-neutral-900/90 border-neutral-800">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-red-400" />
                  <h2 className="text-base font-bold text-white">Gastos · 30 días</h2>
                </div>
                <span className="text-sm font-bold text-red-400 font-display">
                  {loadingReportes ? <Skeleton className="h-5 w-20" /> : formatCOP(resumen.totalGastos)}
                </span>
              </div>

              <div className="mt-4 space-y-2 max-h-48 overflow-y-auto pr-1">
                {loadingReportes ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : Object.entries(resumen.gastosPorCategoria).length > 0 ? (
                  ordenCategorias
                    .filter(cat => cat in resumen.gastosPorCategoria)
                    .map(categoria => (
                      <div
                        key={categoria}
                        className="flex justify-between items-center text-xs p-2 rounded-lg bg-neutral-800/40 hover:bg-neutral-800 transition-colors"
                      >
                        <span className="text-neutral-300 font-medium capitalize">
                          {categoria}
                        </span>
                        <span className="text-red-400 font-semibold font-mono">
                          {formatCOP(resumen.gastosPorCategoria[categoria])}
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="text-xs text-neutral-500 py-3 text-center">No hay gastos registrados en los últimos 30 días</p>
                )}
              </div>
            </Card>

          </div>

        </div>

        {/* Modal para Iniciar Caja */}
        <Modal
          isOpen={mostrarFormularioCaja}
          onClose={() => {
            if (!creandoCaja) setMostrarFormularioCaja(false);
          }}
          title="Apertura de caja"
        >
          <p className="mb-4 text-xs text-neutral-400">
            Ingresa el monto de base en efectivo con el que inicias este turno.
          </p>

          <form onSubmit={handleCrearCaja} className="space-y-4">
            <Input
              label="Monto inicial en pesos (COP)"
              type="number"
              placeholder="Ej: 100000"
              value={montoCajaStr}
              onChange={(e) => setMontoCajaStr(e.target.value)}
              min="0"
              step="1000"
              autoFocus
              required
            />

            <ValoresRapidos
              value={montoCajaStr}
              onChange={setMontoCajaStr}
              disabled={creandoCaja}
              etiqueta="Bases frecuentes (haz clic para fijar el monto):"
            />

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMostrarFormularioCaja(false)}
                disabled={creandoCaja}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={creandoCaja}
                disabled={creandoCaja || !montoCajaStr.trim()}
                className="flex-1"
              >
                Iniciar caja
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal para agregar saldo */}
        <Modal
          isOpen={mostrarFormularioAgregar && Boolean(cajaActual)}
          onClose={() => {
            if (cargandoAgregar) return;
            setMostrarFormularioAgregar(false);
            setMontoAgregar('');
          }}
          title="Agregar saldo a caja"
        >
          {cajaActual && (
            <form onSubmit={handleAgregarSaldo} className="space-y-4">
              <p className="text-xs text-neutral-400">Ingresa el efectivo que se suma manualmente a la caja.</p>
              <Input
                label="Monto en pesos (COP)"
                type="number"
                placeholder="Ej: 50000"
                value={montoAgregar}
                onChange={(e) => setMontoAgregar(e.target.value)}
                min="1"
                step="1000"
                disabled={cargandoAgregar}
                autoFocus
                required
              />

              <ValoresRapidos
                value={montoAgregar}
                onChange={setMontoAgregar}
                disabled={cargandoAgregar}
              />

              <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-xs">
                <p className="text-neutral-300">
                  Saldo actual: <span className="font-bold text-white">{formatCOP(cajaActual.saldoActual)}</span>
                </p>
                {montoAgregar && !isNaN(Number(montoAgregar)) && (
                  <p className="mt-1 font-semibold text-green-400">
                    Nuevo saldo estimado: {formatCOP(cajaActual.saldoActual + Number(montoAgregar))}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setMostrarFormularioAgregar(false);
                    setMontoAgregar('');
                  }}
                  disabled={cargandoAgregar}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={cargandoAgregar}
                  disabled={cargandoAgregar || !montoAgregar.trim()}
                  className="flex-1"
                >
                  Agregar saldo
                </Button>
              </div>
            </form>
          )}
        </Modal>

      </div>
    </div>
  );
}
