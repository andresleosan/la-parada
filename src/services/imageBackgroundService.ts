import { httpsCallable } from 'firebase/functions';
import { appCheckConfigured, functions } from '@/services/firebase';
import { dibujarEnCanvasReducido } from '@/services/storageService';

const DEFAULT_TABLE_BACKGROUND_URL = '/assets/background-table.jpg';
const MAX_COMPOSITION_SIZE = 1600;
const PRODUCT_TARGET_HEIGHT_RATIO = 0.78;
/** La foto final mide 960px: mandar más de 1600px a remove.bg solo alarga la subida en móvil. */
const MAX_EDIT_INPUT_SIZE = 1600;
const MAX_EDIT_INPUT_BYTES = 1_200_000;
const EDIT_INPUT_JPEG_QUALITY = 0.9;

interface RemoveBackgroundRequest {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

interface RemoveBackgroundResponse {
  imageBase64: string;
  mimeType: 'image/png';
}

function cargarImagen(source: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source);

    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo cargar una imagen para aplicar el fondo'));
    };

    if (typeof source === 'string') {
      if (!/^(https?:\/\/|data:image\/|\/)/i.test(source)) {
        reject(new Error('La fuente de imagen no es válida'));
        return;
      }
      if (/^https?:\/\//i.test(source)) image.crossOrigin = 'anonymous';
      image.src = source;
    } else {
      image.src = objectUrl!;
    }
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      const separatorIndex = value.indexOf(',');
      if (separatorIndex < 0) {
        reject(new Error('No se pudo preparar la imagen para editarla'));
        return;
      }
      resolve(value.slice(separatorIndex + 1));
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada'));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function friendlyProcessingError(error: unknown): Error {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
  const serverMessage = error instanceof Error ? error.message : '';

  if (code.includes('unauthenticated')) return new Error('Debes iniciar sesión para editar fotos');
  if (code.includes('permission-denied')) return new Error('Tu perfil no puede editar fotos de productos');
  if (code.includes('resource-exhausted')) {
    if (serverMessage.includes('remove.bg')) return new Error(serverMessage);
    return new Error('Alcanzaste el límite temporal de ediciones. Intenta más tarde.');
  }
  if (code.includes('failed-precondition')) {
    if (serverMessage.includes('remove.bg')) return new Error(serverMessage);
    return new Error('La edición de fotos no está configurada o la imagen no pudo procesarse');
  }
  if (code.includes('unavailable')) return new Error('El servicio de edición no está disponible. Conservamos tu foto original.');
  return error instanceof Error ? error : new Error('No se pudo editar la foto');
}

/**
 * Reduce la foto original antes de enviarla a remove.bg: una foto de móvil de 4-6 MB
 * pasa a ~300 KB, así la edición tarda segundos en vez de minutos con datos móviles.
 * Si ya es pequeña se envía tal cual. Los PNG con transparencia se conservan.
 */
export async function prepararImagenParaEdicion(source: Blob): Promise<Blob> {
  const image = await cargarImagen(source);
  const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
  if (largestSide <= MAX_EDIT_INPUT_SIZE && source.size <= MAX_EDIT_INPUT_BYTES) {
    return source;
  }

  const canvas = dibujarEnCanvasReducido(image, MAX_EDIT_INPUT_SIZE);
  if (!canvas) return source;

  const keepAlpha = source.type === 'image/png';
  const reduced = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      keepAlpha ? 'image/png' : 'image/jpeg',
      EDIT_INPUT_JPEG_QUALITY
    );
  });

  return reduced && reduced.size < source.size ? reduced : source;
}

/**
 * Envía una imagen al backend protegido. La API key de remove.bg nunca se entrega al navegador.
 */
export async function removerFondoProducto(source: Blob): Promise<Blob> {
  if (!functions || !appCheckConfigured) {
    throw new Error('La edición de fotos requiere una sesión y App Check configurado');
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(source.type)) {
    throw new Error('El formato de imagen no está permitido');
  }

  const prepared = await prepararImagenParaEdicion(source);
  const mimeType = prepared.type as RemoveBackgroundRequest['mimeType'];

  try {
    const callable = httpsCallable<RemoveBackgroundRequest, RemoveBackgroundResponse>(
      functions,
      'removerFondoProducto',
      { limitedUseAppCheckTokens: true }
    );
    const result = await callable({
      imageBase64: await blobToBase64(prepared),
      mimeType,
    });
    if (
      !result.data
      || result.data.mimeType !== 'image/png'
      || typeof result.data.imageBase64 !== 'string'
      || !result.data.imageBase64
    ) {
      throw new Error('El proveedor devolvió una imagen inválida');
    }
    return base64ToBlob(result.data.imageBase64, result.data.mimeType);
  } catch (error) {
    throw friendlyProcessingError(error);
  }
}

function findAlphaBounds(image: HTMLImageElement): { x: number; y: number; width: number; height: number; canvas: HTMLCanvasElement } {
  const scale = Math.min(1, MAX_COMPOSITION_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No se pudo analizar el recorte del producto');

  context.drawImage(image, 0, 0, width, height);
  let data: Uint8ClampedArray;
  try {
    data = context.getImageData(0, 0, width, height).data;
  } catch {
    throw new Error('No se pudo leer el recorte del producto');
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) throw new Error('No se encontró un producto en la imagen recortada');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, canvas };
}

/**
 * Compone el recorte transparente sobre la mesa y lo centra sin deformarlo.
 * El producto ocupa aproximadamente 78 % del alto, con un límite horizontal para fotos anchas.
 */
export async function componerImagenSobreMesa(
  productoRecortado: Blob,
  backgroundUrl = DEFAULT_TABLE_BACKGROUND_URL
): Promise<File> {
  const [productImage, backgroundImage] = await Promise.all([
    cargarImagen(productoRecortado),
    cargarImagen(backgroundUrl),
  ]);
  const productBounds = findAlphaBounds(productImage);
  const backgroundScale = Math.min(
    1,
    MAX_COMPOSITION_SIZE / Math.max(backgroundImage.naturalWidth, backgroundImage.naturalHeight)
  );
  const backgroundWidth = Math.max(1, Math.round(backgroundImage.naturalWidth * backgroundScale));
  const backgroundHeight = Math.max(1, Math.round(backgroundImage.naturalHeight * backgroundScale));
  const canvas = document.createElement('canvas');
  canvas.width = backgroundWidth;
  canvas.height = backgroundHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar el fondo de mesa');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(backgroundImage, 0, 0, backgroundWidth, backgroundHeight);

  const targetHeight = backgroundHeight * PRODUCT_TARGET_HEIGHT_RATIO;
  const maxWidth = backgroundWidth * 0.88;
  const productScale = Math.min(targetHeight / productBounds.height, maxWidth / productBounds.width);
  const productWidth = productBounds.width * productScale;
  const productHeight = productBounds.height * productScale;
  const productX = (backgroundWidth - productWidth) / 2;
  const productY = (backgroundHeight - productHeight) / 2;
  context.drawImage(
    productBounds.canvas,
    productBounds.x,
    productBounds.y,
    productBounds.width,
    productBounds.height,
    productX,
    productY,
    productWidth,
    productHeight
  );

  const outputBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la foto final'))),
      'image/jpeg',
      0.92
    );
  });
  return new File([outputBlob], 'producto-fondo-mesa.jpg', { type: 'image/jpeg' });
}
