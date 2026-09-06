// src/services/storageService.ts
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  type UploadTaskSnapshot,
} from 'firebase/storage';
import { storage } from '@/services/firebase';
import {
  normalizarNombreParaStorage,
  validarNegocioIdParaStorage,
} from '@/utils/storagePaths';
import { v4 as uuidv4 } from 'uuid';

/**
 * Servicio para subir y administrar imágenes en Firebase Storage
 * Con compresión automática para optimizar tamaño y rendimiento
 */

const STORAGE_BUCKET = 'productos';
const MAX_WIDTH = 960; // Coincide con la variante grande de las fotos gourmet locales
const WEBP_QUALITY = 0.8; // WebP pesa ~30 % menos que JPEG a calidad visual equivalente
const JPEG_QUALITY = 0.78; // Fallback para navegadores que no codifican WebP (Safari)
const UPLOAD_TIMEOUT_MS = 20_000;

type ImagenComprimidaMime = 'image/webp' | 'image/jpeg';

export interface ImagenComprimida {
  blob: Blob;
  mimeType: ImagenComprimidaMime;
  extension: 'webp' | 'jpg';
  width: number;
  height: number;
}

/**
 * Carga un Blob como imagen decodificada usando un object URL
 * (evita duplicar la foto en memoria como DataURL base64).
 */
export function cargarImagenDesdeBlob(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo cargar la imagen'));
    };

    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

/**
 * Redibuja una imagen en un canvas limitando su lado mayor a `maxSize`.
 * Devuelve `null` si el canvas no está disponible.
 */
export function dibujarEnCanvasReducido(
  img: HTMLImageElement,
  maxSize: number
): HTMLCanvasElement | null {
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/**
 * Comprime una imagen para las tarjetas de producto: máximo 960px y WebP cuando el
 * navegador sabe codificarlo; si no, JPEG. Resultado típico: 40-120 KB.
 */
export async function comprimirImagen(file: Blob | File, maxWidth = MAX_WIDTH): Promise<ImagenComprimida> {
  const img = await cargarImagenDesdeBlob(file);
  const canvas = dibujarEnCanvasReducido(img, maxWidth);
  if (!canvas) {
    throw new Error('No se pudo obtener contexto de canvas');
  }

  const webp = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY);
  if (webp && webp.type === 'image/webp') {
    return { blob: webp, mimeType: 'image/webp', extension: 'webp', width: canvas.width, height: canvas.height };
  }

  const jpeg = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
  if (!jpeg) {
    throw new Error('No se pudo comprimir la imagen');
  }
  return { blob: jpeg, mimeType: 'image/jpeg', extension: 'jpg', width: canvas.width, height: canvas.height };
}

/**
 * Sube una imagen comprimida a una ruta aislada por negocio.
 * Un fallo de Storage se informa al usuario: no se persisten DataURL en
 * Firestore porque pueden superar el límite de tamaño de un documento.
 */
export async function subirImagenProducto(
  file: Blob | File,
  nombreProducto: string,
  negocioId: string
): Promise<string> {
  const comprimida = await comprimirImagen(file);

  if (!storage) {
    throw new Error('Firebase Storage no está disponible');
  }

  try {
    const fileName = `${uuidv4()}.${comprimida.extension}`;
    const tenant = validarNegocioIdParaStorage(negocioId);
    const cleanName = normalizarNombreParaStorage(nombreProducto);
    const storagePath = `${STORAGE_BUCKET}/${tenant}/${cleanName}/${fileName}`;
    const storageRef = ref(storage, storagePath);

    const uploadTask = uploadBytesResumable(storageRef, comprimida.blob, {
      contentType: comprimida.mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    const snapshot = await new Promise<UploadTaskSnapshot>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        uploadTask.cancel();
        reject(new Error('TIMEOUT_STORAGE'));
      }, UPLOAD_TIMEOUT_MS);

      uploadTask.then(
        (result) => {
          window.clearTimeout(timeoutId);
          resolve(result);
        },
        (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        }
      );
    });

    return await getDownloadURL(snapshot.ref);
  } catch (error: unknown) {
    console.error('No se pudo subir la imagen a Firebase Storage:', error);

    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
    const message = error instanceof Error ? error.message : '';

    if (message === 'TIMEOUT_STORAGE') {
      throw new Error('La subida tardó demasiado. Revisa la conexión e inténtalo de nuevo.');
    }

    if (code === 'storage/unauthorized') {
      throw new Error('Tu usuario no tiene permiso para guardar fotos en este negocio.');
    }

    if (code === 'storage/bucket-not-found') {
      throw new Error('El bucket de Firebase Storage todavía no está creado.');
    }

    throw new Error(
      'No se pudo guardar la foto en Firebase Storage. Verifica que el bucket exista y que las reglas estén publicadas.'
    );
  }
}

/**
 * Elimina una imagen de Firebase Storage basada en su URL
 */
export async function eliminarImagenProducto(imageUrl: string): Promise<void> {
  if (!storage || !imageUrl || imageUrl.startsWith('data:')) return;
  try {
    const urlParams = new URL(imageUrl);
    const pathMatch = urlParams.pathname.match(/o\/(.+)$/);
    if (!pathMatch) return;

    const filePath = decodeURIComponent(pathMatch[1]);
    const fileRef = ref(storage, filePath);
    await deleteObject(fileRef);
  } catch (error) {
    console.warn('Error eliminando imagen:', error);
  }
}
