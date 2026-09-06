// src/services/ventasService.ts
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getBlob } from 'firebase/storage';
import { db } from '@/services/firebase';
import type { Venta, MetodoPago, TipoEntrega } from '@/types';
import { requireTenantId } from '@/security/tenantScope';

/**
 * Registra una nueva venta en Firestore
 */
export async function uploadFotoTransferencia(file: File, negocioId: string): Promise<string> {
  try {
    const tenantId = requireTenantId(negocioId);
    const extensionByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const extension = extensionByType[file.type];
    if (!extension || file.size >= 5 * 1024 * 1024) {
      throw new Error('El comprobante debe ser una imagen menor de 5 MiB');
    }
    const storage = getStorage();
    const timestamp = Date.now();
    const filename = `transferencias/${tenantId}/${timestamp}_${crypto.randomUUID()}.${extension}`;
    const storageRef = ref(storage, filename);
    
    const snapshot = await uploadBytes(storageRef, file);
    return snapshot.ref.fullPath;
  } catch (error) {
    console.error('Error uploading transfer photo:', error);
    throw error;
  }
}

export async function registrarVenta(
  negocioId: string,
  items: any[],
  total: number,
  metodoPago: MetodoPago,
  direccion?: string,
  clienteTelefono?: string,
  fotoTransferenciaPath?: string,
  tipoEntrega: TipoEntrega = 'mostrador'
): Promise<string> {
  const tenantId = requireTenantId(negocioId);
  const venta: Omit<Venta, 'id'> = {
    negocioId: tenantId,
    items,
    total,
    metodoPago,
    tipoEntrega,
    origen: 'pos',
    // Timestamp.now() guarda fecha y hora exacta del cobro: es lo que lee el historial y la analítica.
    fecha: Timestamp.now(),
    ...(direccion && { direccion }),
    ...(clienteTelefono && { clienteTelefono }),
    ...(fotoTransferenciaPath && { fotoTransferenciaPath }),
  };

  const docRef = await addDoc(collection(db, 'ventas'), venta);
  return docRef.id;
}

export async function getFotoTransferenciaObjectUrl(
  storagePath: string,
  negocioId: string
): Promise<string> {
  const tenantId = requireTenantId(negocioId);
  const expectedPrefix = `transferencias/${tenantId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new Error('El comprobante no pertenece al negocio activo');
  }
  const blob = await getBlob(ref(getStorage(), storagePath), 5 * 1024 * 1024);
  return URL.createObjectURL(blob);
}
