import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Calendar,
  CalendarDays,
  CalendarRange,
  CircleDollarSign,
  Clock,
  Globe2,
  History,
  Image,
  Landmark,
  MapPin,
  MessageCircle,
  Monitor,
  Phone,
  Receipt,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Venta } from '@/types';
import { db } from '@/services/firebase';
import { getFotoTransferenciaObjectUrl } from '@/services/ventasService';
import { useNegocio } from '@/context/NegocioContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { createToast } from '@/components/ui/Toast';
import { StorefrontDialog } from '@/components/storefront/StorefrontDialog';
import { formatCOP } from '@/utils/formatCOP';
import { formatFechaLarga, formatHora } from '@/utils/dateUtils';
import { toValidAdminDate } from '@/utils/adminAnalytics';
import {
  buildAdminReportSummary,
  getAdminSalesPeriodRange,
  type AdminSalesPeriod,
} from '@/utils/adminReports';
import { createScopedRequestGuard } from '@/utils/scopedRequestGuard';

export type VentaPeriodFilter = AdminSalesPeriod;

interface VentasPeriodFilterProps {
  filter: VentaPeriodFilter;
  onChange: (filter: VentaPeriodFilter) => void;
}

interface OperationalPresentation {
  label: string;
  icon: LucideIcon;
}

const ventaPeriodOptions = [
  { value: 'todas', label: '90 días', icon: History },
  { value: 'hoy', label: 'Hoy', icon: Calendar },
  { value: 'semana', label: '7 días', icon: CalendarDays },
  { value: 'mes', label: '30 días', icon: CalendarRange },
] satisfies Array<{ value: VentaPeriodFilter; label: string; icon: LucideIcon }>;

const periodDescriptions: Record<VentaPeriodFilter, string> = {
  todas: 'Últimos 90 días',
  hoy: 'Hoy',
  semana: 'Últimos 7 días',
  mes: 'Últimos 30 días',
};

const paymentPresentations: Record<string, OperationalPresentation> = {
  efectivo: { label: 'Efectivo', icon: Banknote },
  transferencia: { label: 'Transferencia', icon: Landmark },
};

const originPresentations: Record<string, OperationalPresentation> = {
  pos: { label: 'POS', icon: Monitor },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  web: { label: 'Tienda web', icon: Globe2 },
  phone: { label: 'Teléfono', icon: Phone },
  domicilio: { label: 'Domicilio', icon: MapPin },
};

function getPresentation(
  presentations: Record<string, OperationalPresentation>,
  value: string,
  fallbackIcon: LucideIcon
): OperationalPresentation {
  return presentations[value] ?? {
    label: value ? value.replace(/_/g, ' ') : 'Sin dato',
    icon: fallbackIcon,
  };
}

/** Fecha y hora de la venta, tomadas del mismo timestamp con que quedó registrada. */
function getSaleMoment(value: unknown): { fecha: string; hora: string; iso?: string } {
  const date = toValidAdminDate(value);
  if (!date) return { fecha: 'Fecha no disponible', hora: '--:--' };
  return {
    fecha: formatFechaLarga(date),
    hora: formatHora(date),
    iso: date.toISOString(),
  };
}

export function VentasPeriodFilter({ filter, onChange }: VentasPeriodFilterProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar ventas por periodo">
      {ventaPeriodOptions.map((option) => {
        const Icon = option.icon;
        const active = filter === option.value;

        return (
          <Button
            key={option.value}
            variant={active ? 'primary' : 'secondary'}
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            size="sm"
            className="text-xs"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export function VentasPage() {
  const { negocioActual, usuarioNegocio, esSuperAdmin } = useNegocio();
  const tenantId = negocioActual.id;
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<VentaPeriodFilter>('todas');
  const [reloadToken, setReloadToken] = useState(0);
  const [stateScope, setStateScope] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
  const [fotoSeleccionada, setFotoSeleccionada] = useState<{
    url: string;
    alt: string;
  } | null>(null);
  const requestGuardRef = useRef(createScopedRequestGuard());
  const scopeKey = `${tenantId}:${filter}:${reloadToken}`;
  const activeScopeRef = useRef(scopeKey);
  activeScopeRef.current = scopeKey;

  const puedeEliminarVentas = esSuperAdmin || usuarioNegocio?.rol === 'admin';
  const stateIsCurrent = stateScope === scopeKey;
  const ventasActuales = stateIsCurrent ? ventas : [];
  const loadingActual = stateIsCurrent ? loading : true;
  const errorActual = stateIsCurrent ? loadError : null;
  const summary = useMemo(
    () => buildAdminReportSummary(ventasActuales, []),
    [ventasActuales]
  );

  useEffect(() => {
    const request = requestGuardRef.current.begin(scopeKey);
    setStateScope(scopeKey);
    setVentas([]);
    setLoading(true);
    setLoadError(null);

    const cargarVentas = async () => {
      try {
        const { inicio, finExclusivo } = getAdminSalesPeriodRange(filter);
        const ventasRef = collection(db, 'ventas');
        const ventasQuery = query(
          ventasRef,
          where('negocioId', '==', tenantId),
          where('fecha', '>=', Timestamp.fromDate(inicio)),
          where('fecha', '<', Timestamp.fromDate(finExclusivo)),
          orderBy('fecha', 'desc')
        );
        const snapshot = await getDocs(ventasQuery);
        if (!requestGuardRef.current.isCurrent(request, activeScopeRef.current)) return;

        setVentas(snapshot.docs.map((saleDoc) => ({
          ...saleDoc.data(),
          // La identidad canónica siempre es la del documento, nunca un campo almacenado.
          id: saleDoc.id,
        } as Venta)));
      } catch (error) {
        if (!requestGuardRef.current.isCurrent(request, activeScopeRef.current)) return;
        console.error('Error cargando ventas:', error);
        setLoadError('No fue posible consultar las ventas de este periodo.');
      } finally {
        if (requestGuardRef.current.isCurrent(request, activeScopeRef.current)) {
          setLoading(false);
        }
      }
    };

    void cargarVentas();
    return () => requestGuardRef.current.invalidate();
  }, [filter, reloadToken, scopeKey, tenantId]);

  useEffect(() => () => {
    if (fotoSeleccionada?.url.startsWith('blob:')) {
      URL.revokeObjectURL(fotoSeleccionada.url);
    }
  }, [fotoSeleccionada]);

  const handleEliminarVenta = async (venta: Venta) => {
    if (!puedeEliminarVentas) {
      createToast('Solo un administrador puede eliminar ventas', 'error');
      return;
    }
    if (venta.negocioId !== tenantId) {
      createToast('La venta no pertenece al negocio activo', 'error');
      return;
    }
    if (!window.confirm(`¿Eliminar la venta de ${formatCOP(venta.total)}?`)) return;

    setDeletingId(venta.id);
    try {
      await deleteDoc(doc(db, 'ventas', venta.id));
      createToast('Venta eliminada', 'success');
      setVentas((current) => current.filter((item) => item.id !== venta.id));
    } catch (error) {
      console.error('Error eliminando venta:', error);
      createToast('No se pudo eliminar la venta', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleVerFotoTransferencia = async (venta: Venta) => {
    if (!venta.fotoTransferenciaPath) {
      createToast('Este comprobante legado requiere migración segura', 'error');
      return;
    }

    setLoadingReceiptId(venta.id);
    try {
      const objectUrl = await getFotoTransferenciaObjectUrl(
        venta.fotoTransferenciaPath,
        tenantId
      );
      setFotoSeleccionada({
        url: objectUrl,
        alt: `Comprobante de transferencia de la venta de ${formatCOP(venta.total)}`,
      });
    } catch (error) {
      console.error('Error cargando comprobante:', error);
      createToast('No se pudo abrir el comprobante', 'error');
    } finally {
      setLoadingReceiptId(null);
    }
  };

  const cerrarComprobante = () => setFotoSeleccionada(null);

  if (loadingActual) {
    return (
      <div className="min-h-screen bg-base-dark px-4 pb-28 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-6 font-display text-2xl font-bold text-white sm:text-3xl">
            Historial de ventas
          </h1>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-dark px-4 pb-28 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 border-b border-neutral-800 pb-4 xl:flex-row xl:items-end">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-gold-400">
              <Receipt className="h-4 w-4" aria-hidden="true" />
              Registro operativo
            </p>
            <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
              Historial de ventas
            </h1>
            <p className="mt-1 text-sm text-neutral-400" aria-live="polite">
              {periodDescriptions[filter]} · {summary.cantidadVentas} venta{summary.cantidadVentas === 1 ? '' : 's'}
            </p>
          </div>
          <VentasPeriodFilter filter={filter} onChange={setFilter} />
        </header>

        {errorActual ? (
          <Card className="border-red-400/30 bg-red-950/20">
            <EmptyState
              icon={AlertTriangle}
              title="No pudimos cargar el historial"
              description={`${errorActual} Tus datos no se muestran como cero.`}
              action={{
                label: 'Reintentar',
                onClick: () => setReloadToken((current) => current + 1),
              }}
            />
          </Card>
        ) : (
          <>
            <section
              aria-label={`Resumen de ventas: ${periodDescriptions[filter]}`}
              className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4"
            >
              <Card className="border-neutral-800 bg-neutral-900/90 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Ingresos del periodo</p>
                    <p className="mt-2 font-display text-2xl font-bold text-gold-400">{formatCOP(summary.totalVentas)}</p>
                  </div>
                  <CircleDollarSign className="h-5 w-5 text-gold-400" aria-hidden="true" />
                </div>
              </Card>
              <Card className="border-neutral-800 bg-neutral-900/90 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Ventas del periodo</p>
                    <p className="mt-2 font-display text-2xl font-bold text-blue-400">{summary.cantidadVentas}</p>
                  </div>
                  <Receipt className="h-5 w-5 text-blue-400" aria-hidden="true" />
                </div>
              </Card>
              <Card className="border-neutral-800 bg-neutral-900/90 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Ticket promedio</p>
                    <p className="mt-2 font-display text-2xl font-bold text-emerald-400">{formatCOP(summary.ventaPromedio)}</p>
                  </div>
                  <BarChart3 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                </div>
              </Card>
            </section>

            {ventasActuales.length === 0 ? (
              <Card>
                <EmptyState
                  icon={History}
                  title="Sin ventas en este periodo"
                  description={`No encontramos ventas para ${periodDescriptions[filter].toLocaleLowerCase('es-CO')}.`}
                />
              </Card>
            ) : (
              <section
                aria-label="Listado de ventas"
                className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3"
              >
                {ventasActuales.map((venta) => {
                  const origin = getPresentation(originPresentations, venta.origen, MapPin);
                  const payment = getPresentation(paymentPresentations, venta.metodoPago, CircleDollarSign);
                  const OriginIcon = origin.icon;
                  const PaymentIcon = payment.icon;
                  const momento = getSaleMoment(venta.fecha);

                  return (
                    <Card
                      key={venta.id}
                      className="flex min-w-0 flex-col justify-between border-neutral-800 bg-neutral-900/90 p-4 transition-colors hover:border-neutral-700"
                    >
                      <div>
                        <div className="flex flex-col gap-2 border-b border-neutral-800 pb-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">{momento.fecha}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-gold-400">
                              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                              <time dateTime={momento.iso}>{momento.hora}</time>
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="gap-1 px-2 py-1 text-[10px]">
                              <OriginIcon className="h-3 w-3" aria-hidden="true" />
                              {origin.label}
                            </Badge>
                            <Badge variant="outline" className="gap-1 px-2 py-1 text-[10px]">
                              <PaymentIcon className="h-3 w-3" aria-hidden="true" />
                              {payment.label}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {venta.items?.slice(0, 3).map((item, index) => (
                            <div
                              key={`${item.referenciaId}-${index}`}
                              className="flex min-w-0 justify-between gap-3 text-xs text-neutral-300"
                            >
                              <span className="min-w-0 truncate">{item.nombre} × {item.cantidad}</span>
                              <span className="shrink-0 font-medium text-gold-400">
                                {formatCOP(Number.isFinite(item.subtotal) ? item.subtotal : 0)}
                              </span>
                            </div>
                          ))}
                          {venta.items && venta.items.length > 3 && (
                            <p className="text-[11px] text-neutral-500">
                              +{venta.items.length - 3} artículo{venta.items.length - 3 === 1 ? '' : 's'} más
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-neutral-800 pt-3">
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider text-neutral-500">Total</span>
                          <p className="font-display text-lg font-bold text-gold-400">
                            {formatCOP(Number.isFinite(venta.total) ? venta.total : 0)}
                          </p>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                          {venta.metodoPago === 'transferencia' &&
                            (venta.fotoTransferenciaPath || venta.fotoTransferenciaUrl) && (
                              <Button
                                variant="secondary"
                                size="sm"
                                loading={loadingReceiptId === venta.id}
                                onClick={() => void handleVerFotoTransferencia(venta)}
                                aria-label={`Ver comprobante de la venta de ${formatCOP(venta.total)}`}
                                className="min-h-11 text-xs"
                              >
                                <Image className="h-4 w-4" aria-hidden="true" />
                                Comprobante
                              </Button>
                            )}
                          {puedeEliminarVentas && (
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={deletingId === venta.id}
                              disabled={deletingId !== null}
                              onClick={() => void handleEliminarVenta(venta)}
                              aria-label={`Eliminar venta de ${formatCOP(venta.total)}`}
                              className="min-h-11 min-w-11 px-3 text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </section>
            )}
          </>
        )}

        {fotoSeleccionada && (
          <StorefrontDialog
            labelledBy="transfer-receipt-title"
            onClose={cerrarComprobante}
            onBackdropClick={cerrarComprobante}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
          >
            <div
              data-admin-media="true"
              className="relative max-h-[90dvh] w-full max-w-2xl overflow-hidden rounded-2xl bg-neutral-950 shadow-2xl"
            >
              <h2 id="transfer-receipt-title" className="sr-only">Comprobante de transferencia</h2>
              <button
                type="button"
                onClick={cerrarComprobante}
                className="absolute right-3 top-3 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-neutral-800 text-white transition-colors hover:bg-neutral-700"
                aria-label="Cerrar comprobante"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <img
                src={fotoSeleccionada.url}
                alt={fotoSeleccionada.alt}
                className="max-h-[90dvh] w-full object-contain"
              />
            </div>
          </StorefrontDialog>
        )}
      </div>
    </div>
  );
}
