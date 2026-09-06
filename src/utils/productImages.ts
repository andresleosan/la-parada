// src/utils/productImages.ts

/**
 * Resuelve las fotos gourmet locales de La Parada para platos y combos.
 *
 * Los archivos se generan con `pnpm run images:optimize` a partir de `media/source/`:
 *   /images/products/<slug>-480.webp   móvil y tarjetas pequeñas
 *   /images/products/<slug>-960.webp   pantallas densas y tarjetas grandes
 *   /images/products/<slug>.jpg        fallback y URLs heredadas guardadas en Firestore
 */

export const GOURMET_IMAGE_WIDTHS = [480, 960] as const;
export type GourmetImageWidth = (typeof GOURMET_IMAGE_WIDTHS)[number];

/** `sizes` para tarjetas del menú: una columna en móvil, dos en tablet y ~360px en escritorio. */
export const GOURMET_CARD_SIZES = '(min-width: 1024px) 360px, (min-width: 640px) 45vw, calc(100vw - 2rem)';

const GOURMET_IMAGE_BASE = '/images/products';

const GOURMET_SLUGS = [
  'tequenos',
  'panceroti',
  'hamburguesa',
  'perro-caliente',
  'salchipapa',
  'arepa',
] as const;
type GourmetSlug = (typeof GOURMET_SLUGS)[number];

function normalizar(nombre: string): string {
  return (nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getGourmetSlug(nombre: string): GourmetSlug | undefined {
  const n = normalizar(nombre);
  if (n.includes('tequeno')) return 'tequenos';
  if (n.includes('panceroti') || n.includes('panzerotti')) return 'panceroti';
  if (n.includes('hamburguesa') || n.includes('burger')) return 'hamburguesa';
  if (n.includes('perro') || n.includes('hot dog')) return 'perro-caliente';
  if (n.includes('salchipapa')) return 'salchipapa';
  if (n.includes('arepa')) return 'arepa';
  return undefined;
}

function gourmetUrl(slug: GourmetSlug, width: GourmetImageWidth): string {
  return `${GOURMET_IMAGE_BASE}/${slug}-${width}.webp`;
}

/**
 * Devuelve la foto gourmet local si el nombre coincide con un plato conocido; si no, `fallbackUrl`.
 * `width` elige la variante: 480 para tarjetas pequeñas (POS), 960 para el storefront.
 */
export function getGourmetImage(
  nombre: string,
  fallbackUrl?: string,
  width: GourmetImageWidth = 960
): string | undefined {
  const slug = getGourmetSlug(nombre);
  return slug ? gourmetUrl(slug, width) : fallbackUrl;
}

const GOURMET_URL_PATTERN = new RegExp(
  `^${GOURMET_IMAGE_BASE}/(${GOURMET_SLUGS.join('|')})(?:-(?:${GOURMET_IMAGE_WIDTHS.join('|')}))?\\.(?:webp|jpg)$`
);

/**
 * `srcSet` con todas las variantes de una foto gourmet local.
 * Para fotos subidas a Firebase Storage u otras URLs externas devuelve `undefined`.
 */
export function getGourmetImageSrcSet(url?: string): string | undefined {
  if (!url) return undefined;
  const match = GOURMET_URL_PATTERN.exec(url);
  if (!match) return undefined;
  const slug = match[1] as GourmetSlug;
  return GOURMET_IMAGE_WIDTHS.map((width) => `${gourmetUrl(slug, width)} ${width}w`).join(', ');
}
