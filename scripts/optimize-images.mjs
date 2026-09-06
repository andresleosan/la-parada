#!/usr/bin/env node
/**
 * Genera las imágenes optimizadas que se sirven desde `public/` a partir de los
 * originales guardados en `media/source/` (que nunca se despliegan).
 *
 *   pnpm run images:optimize
 *
 * Salidas:
 *   public/images/products/<slug>.jpg        JPEG progresivo 960px (fallback y URLs heredadas en Firestore)
 *   public/images/products/<slug>-480.webp   WebP para móvil / tarjetas pequeñas
 *   public/images/products/<slug>-960.webp   WebP para pantallas densas y tarjetas grandes
 *   public/assets/background-table.jpg       Fondo de mesa usado al componer fotos (1024px)
 *   public/favicon.ico                       PNG 32px envuelto en contenedor ICO
 *   public/favicon.png                       PNG 192px
 *
 * Las anchuras deben coincidir con GOURMET_IMAGE_WIDTHS en src/utils/productImages.ts.
 */
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_DIR = resolve(ROOT, 'media/source');
const PRODUCTS_SOURCE_DIR = resolve(SOURCE_DIR, 'products');
const PRODUCTS_OUTPUT_DIR = resolve(ROOT, 'public/images/products');
const ASSETS_OUTPUT_DIR = resolve(ROOT, 'public/assets');
const PUBLIC_DIR = resolve(ROOT, 'public');

const PRODUCT_WIDTHS = [480, 960];
const PRODUCT_JPEG_WIDTH = 960;
const WEBP_OPTIONS = { quality: 80, effort: 5 };
const JPEG_OPTIONS = { quality: 78, mozjpeg: true, progressive: true };

const report = [];

function kb(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function record(label, sourceBytes, outputPath) {
  const { size } = await stat(outputPath);
  report.push({ label, source: kb(sourceBytes), output: kb(size) });
}

async function optimizeProduct(file) {
  const slug = basename(file, extname(file));
  const sourcePath = resolve(PRODUCTS_SOURCE_DIR, file);
  const { size: sourceBytes } = await stat(sourcePath);
  const image = sharp(sourcePath).rotate();

  const jpegPath = resolve(PRODUCTS_OUTPUT_DIR, `${slug}.jpg`);
  await image
    .clone()
    .resize({ width: PRODUCT_JPEG_WIDTH, withoutEnlargement: true })
    .jpeg(JPEG_OPTIONS)
    .toFile(jpegPath);
  await record(`${slug}.jpg`, sourceBytes, jpegPath);

  for (const width of PRODUCT_WIDTHS) {
    const webpPath = resolve(PRODUCTS_OUTPUT_DIR, `${slug}-${width}.webp`);
    await image
      .clone()
      .resize({ width, withoutEnlargement: true })
      .webp(WEBP_OPTIONS)
      .toFile(webpPath);
    await record(`${slug}-${width}.webp`, sourceBytes, webpPath);
  }
}

async function optimizeBackgroundTable() {
  const sourcePath = resolve(SOURCE_DIR, 'background-table.jpg');
  const { size: sourceBytes } = await stat(sourcePath);
  const outputPath = resolve(ASSETS_OUTPUT_DIR, 'background-table.jpg');
  await sharp(sourcePath)
    .rotate()
    .resize({ width: 1024, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true, progressive: true })
    .toFile(outputPath);
  await record('background-table.jpg', sourceBytes, outputPath);
}

/** Envuelve un PNG en un contenedor ICO de una sola entrada (soportado por todos los navegadores modernos). */
function pngToIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: icono
  header.writeUInt16LE(1, 4); // cantidad de imágenes

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // paleta
  entry.writeUInt8(0, 3); // reservado
  entry.writeUInt16LE(1, 4); // planos
  entry.writeUInt16LE(32, 6); // bits por píxel
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

async function optimizeFavicons() {
  const sourcePath = resolve(SOURCE_DIR, 'Logo.jpg');
  const { size: sourceBytes } = await stat(sourcePath);
  const logo = sharp(sourcePath).rotate();

  const icoPng = await logo.clone().resize(32, 32, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
  const icoPath = resolve(PUBLIC_DIR, 'favicon.ico');
  await writeFile(icoPath, pngToIco(icoPng, 32));
  await record('favicon.ico', sourceBytes, icoPath);

  const pngPath = resolve(PUBLIC_DIR, 'favicon.png');
  await logo.clone().resize(192, 192, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(pngPath);
  await record('favicon.png', sourceBytes, pngPath);
}

async function main() {
  await mkdir(PRODUCTS_OUTPUT_DIR, { recursive: true });
  await mkdir(ASSETS_OUTPUT_DIR, { recursive: true });

  const productFiles = (await readdir(PRODUCTS_SOURCE_DIR))
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    .sort();

  if (productFiles.length === 0) {
    throw new Error(`No hay imágenes fuente en ${PRODUCTS_SOURCE_DIR}`);
  }

  for (const file of productFiles) {
    await optimizeProduct(file);
  }
  await optimizeBackgroundTable();
  await optimizeFavicons();

  console.table(report);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
