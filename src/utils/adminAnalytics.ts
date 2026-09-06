interface AnalyticsItem {
  referenciaId?: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

export interface AnalyticsSale {
  total: number;
  origen: string;
  /** Fecha y hora exacta de la venta: de aquí sale la hora, no de un campo aparte. */
  fecha?: unknown;
  items?: AnalyticsItem[];
}

export function toValidAdminDate(value: unknown): Date | null {
  const candidate = value instanceof Date
    ? value
    : value && typeof value === 'object' && 'toDate' in value
      && typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : null;

  return candidate && Number.isFinite(candidate.getTime()) ? candidate : null;
}

/**
 * Franja horaria del día, en horas locales 0–23 y con ambos extremos incluidos.
 * Si `desde` es mayor que `hasta` la franja cruza la medianoche (ej. 18 → 2).
 */
export interface HourRange {
  desde: number;
  hasta: number;
}

export const FULL_DAY_RANGE: HourRange = { desde: 0, hasta: 23 };

export function clampHour(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(23, Math.max(0, Math.trunc(value)));
}

export function formatHourLabel(hour: number): string {
  return `${String(clampHour(hour)).padStart(2, '0')}:00`;
}

/** Etiqueta legible de la franja, con el minuto final real (23 → 23:59). */
export function describeHourRange(range: HourRange): string {
  const desde = clampHour(range.desde);
  const hasta = clampHour(range.hasta);
  return `${formatHourLabel(desde)} – ${String(hasta).padStart(2, '0')}:59`;
}

export function isFullDayRange(range: HourRange): boolean {
  return clampHour(range.desde) === 0 && clampHour(range.hasta) === 23;
}

export function isHourInRange(hour: number, range: HourRange): boolean {
  const desde = clampHour(range.desde);
  const hasta = clampHour(range.hasta);
  // Franja que cruza la medianoche: se cumple en cualquiera de los dos tramos.
  if (desde > hasta) return hour >= desde || hour <= hasta;
  return hour >= desde && hour <= hasta;
}

/** Hora local (0–23) en que quedó registrada la venta, o null si no tiene fecha válida. */
export function getSaleHour(sale: AnalyticsSale): number | null {
  const date = toValidAdminDate(sale.fecha);
  return date ? date.getHours() : null;
}

export function filterSalesByHourRange(
  sales: AnalyticsSale[],
  range: HourRange
): AnalyticsSale[] {
  if (isFullDayRange(range)) return sales;
  return sales.filter((sale) => {
    const hour = getSaleHour(sale);
    return hour !== null && isHourInRange(hour, range);
  });
}

export function countSalesOnDate(sales: AnalyticsSale[], targetDate: Date): number {
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  return sales.filter((sale) => {
    const saleDate = toValidAdminDate(sale.fecha);
    if (!saleDate) return false;
    const normalizedSaleDate = new Date(saleDate);
    normalizedSaleDate.setHours(0, 0, 0, 0);
    return normalizedSaleDate.getTime() === target.getTime();
  }).length;
}

export function buildHourlySales(
  sales: AnalyticsSale[],
  range: HourRange = FULL_DAY_RANGE
): Array<{ hora: string; ordenes: number; ingresos: number }> {
  const hourly = new Map<number, { ordenes: number; ingresos: number }>();

  sales.forEach((sale) => {
    const hour = getSaleHour(sale);
    if (hour === null || !isHourInRange(hour, range)) return;

    const current = hourly.get(hour) || { ordenes: 0, ingresos: 0 };
    current.ordenes += 1;
    current.ingresos += Number.isFinite(sale.total) ? sale.total : 0;
    hourly.set(hour, current);
  });

  return Array.from(hourly.entries())
    .sort(([left], [right]) => left - right)
    .map(([hour, values]) => ({
      hora: formatHourLabel(hour),
      ...values,
    }));
}

export function buildProductPerformance(
  sales: AnalyticsSale[]
): Array<{ referenciaId?: string; producto: string; unidades: number; ingresos: number }> {
  const products = new Map<string, {
    referenciaId?: string;
    producto: string;
    unidades: number;
    ingresos: number;
  }>();

  sales.forEach((sale) => {
    sale.items?.forEach((item) => {
      const name = item.nombre.trim();
      if (!name || !Number.isFinite(item.cantidad) || item.cantidad <= 0) return;
      const referenceId = item.referenciaId?.trim() || undefined;
      const key = referenceId ? `ref:${referenceId}` : `name:${name.toLocaleLowerCase('es-CO')}`;
      const current = products.get(key) || {
        ...(referenceId ? { referenciaId: referenceId } : {}),
        producto: name,
        unidades: 0,
        ingresos: 0,
      };
      current.unidades += item.cantidad;
      current.ingresos += Number.isFinite(item.precioUnitario)
        ? item.precioUnitario * item.cantidad
        : 0;
      products.set(key, current);
    });
  });

  return Array.from(products.values())
    .sort((left, right) => right.unidades - left.unidades || left.producto.localeCompare(right.producto));
}

const channelLabels: Record<string, string> = {
  pos: 'POS',
  web: 'Tienda web',
  whatsapp: 'WhatsApp',
};

export function buildChannelMix(
  sales: AnalyticsSale[]
): Array<{ canal: string; ordenes: number; porcentaje: number }> {
  if (sales.length === 0) return [];
  const counts = new Map<string, number>();
  sales.forEach((sale) => counts.set(sale.origen, (counts.get(sale.origen) || 0) + 1));

  return Array.from(counts.entries()).map(([channel, count]) => ({
    canal: channelLabels[channel] || channel,
    ordenes: count,
    porcentaje: Math.round((count / sales.length) * 100),
  }));
}
