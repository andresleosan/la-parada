// src/services/productosService.ts
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { Producto, Combo } from '@/types';
import { requireTenantId } from '@/security/tenantScope';

/**
 * Query base del catálogo: un solo menú por negocio, ordenado por nombre.
 */
function buildCatalogQuery(collectionName: 'productos' | 'combos', negocioId: string) {
  const constraints: QueryConstraint[] = [
    where('negocioId', '==', requireTenantId(negocioId)),
    orderBy('nombre', 'asc'),
  ];
  return query(collection(db, collectionName), ...constraints);
}

async function assertDocumentTenant(
  collectionName: 'productos' | 'combos',
  id: string,
  negocioId: string
): Promise<string> {
  const tenantId = requireTenantId(negocioId);
  const snapshot = await getDoc(doc(db, collectionName, id));
  if (!snapshot.exists() || snapshot.data().negocioId !== tenantId) {
    throw new Error(`El registro de ${collectionName} no pertenece al negocio activo`);
  }
  return tenantId;
}

/**
 * Obtiene el catálogo completo de productos del negocio
 */
export async function getProductos(negocioId: string): Promise<Producto[]> {
  const snapshot = await getDocs(buildCatalogQuery('productos', negocioId));

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  } as Producto));
}

/**
 * Obtiene un producto por ID
 */
export async function getProductoById(id: string, negocioId: string): Promise<Producto | null> {
  const tenantId = requireTenantId(negocioId);
  const snapshot = await getDoc(doc(db, 'productos', id));
  if (!snapshot.exists() || snapshot.data().negocioId !== tenantId) return null;
  return {
    ...snapshot.data(),
    id: snapshot.id,
  } as Producto;
}

/**
 * Obtiene el catálogo completo de combos del negocio
 */
export async function getCombos(negocioId: string): Promise<Combo[]> {
  const snapshot = await getDocs(buildCatalogQuery('combos', negocioId));

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  } as Combo));
}

/**
 * Obtiene un combo por ID
 */
export async function getComboById(id: string, negocioId: string): Promise<Combo | null> {
  const tenantId = requireTenantId(negocioId);
  const snapshot = await getDoc(doc(db, 'combos', id));
  if (!snapshot.exists() || snapshot.data().negocioId !== tenantId) return null;
  return {
    ...snapshot.data(),
    id: snapshot.id,
  } as Combo;
}

/**
 * Listener en tiempo real para cambios de disponibilidad en productos
 */
export function onProductosChange(
  negocioId: string,
  callback: (productos: Producto[]) => void
): () => void {
  return onSnapshot(buildCatalogQuery('productos', negocioId), (snapshot) => {
    const productos = snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    } as Producto));
    callback(productos);
  });
}

/**
 * Listener en tiempo real para cambios de disponibilidad en combos
 */
export function onCombosChange(
  negocioId: string,
  callback: (combos: Combo[]) => void
): () => void {
  return onSnapshot(buildCatalogQuery('combos', negocioId), (snapshot) => {
    const combos = snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    } as Combo));
    callback(combos);
  });
}

/**
 * ===================== CRUD FUNCIONES (Fase 4) =====================
 */

/**
 * Crear nuevo producto
 */
export async function crearProducto(
  data: Omit<Producto, 'id'>
): Promise<string> {
  try {
    const tenantId = requireTenantId(data.negocioId);
    const productosRef = collection(db, 'productos');
    const docRef = await addDoc(productosRef, {
      ...data,
      negocioId: tenantId,
      creadoEn: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating producto:', error);
    throw error;
  }
}

/**
 * Actualizar producto
 */
export async function actualizarProducto(
  id: string,
  updates: Partial<Omit<Producto, 'id' | 'negocioId'>>,
  negocioId: string
): Promise<void> {
  try {
    const tenantId = await assertDocumentTenant('productos', id, negocioId);
    const docRef = doc(db, 'productos', id);
    await updateDoc(docRef, {
      ...updates,
      negocioId: tenantId,
      actualizadoEn: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating producto:', error);
    throw error;
  }
}

/**
 * Eliminar producto
 */
export async function eliminarProducto(id: string, negocioId: string): Promise<void> {
  try {
    await assertDocumentTenant('productos', id, negocioId);
    const docRef = doc(db, 'productos', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting producto:', error);
    throw error;
  }
}

/**
 * Toggle disponibilidad de producto
 */
export async function toggleProductoDisponibilidad(
  id: string,
  disponible: boolean,
  negocioId: string
): Promise<void> {
  try {
    await assertDocumentTenant('productos', id, negocioId);
    const docRef = doc(db, 'productos', id);
    await updateDoc(docRef, { disponible });
  } catch (error) {
    console.error('Error toggling producto disponibilidad:', error);
    throw error;
  }
}

/**
 * Toggle destacado de producto (favorito / destacado en tienda)
 */
export async function toggleProductoDestacado(
  id: string,
  destacado: boolean,
  negocioId: string
): Promise<void> {
  try {
    await assertDocumentTenant('productos', id, negocioId);
    const docRef = doc(db, 'productos', id);
    await updateDoc(docRef, { 
      destacado,
      actualizadoEn: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error toggling producto destacado:', error);
    throw error;
  }
}

/**
 * Crear nuevo combo
 */
export async function crearCombo(
  data: Omit<Combo, 'id'>
): Promise<string> {
  try {
    const tenantId = requireTenantId(data.negocioId);
    const combosRef = collection(db, 'combos');
    const docRef = await addDoc(combosRef, {
      ...data,
      negocioId: tenantId,
      creadoEn: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating combo:', error);
    throw error;
  }
}

/**
 * Actualizar combo
 */
export async function actualizarCombo(
  id: string,
  updates: Partial<Omit<Combo, 'id' | 'negocioId'>>,
  negocioId: string
): Promise<void> {
  try {
    const tenantId = await assertDocumentTenant('combos', id, negocioId);
    const docRef = doc(db, 'combos', id);
    await updateDoc(docRef, {
      ...updates,
      negocioId: tenantId,
      actualizadoEn: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating combo:', error);
    throw error;
  }
}

/**
 * Eliminar combo
 */
export async function eliminarCombo(id: string, negocioId: string): Promise<void> {
  try {
    await assertDocumentTenant('combos', id, negocioId);
    const docRef = doc(db, 'combos', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting combo:', error);
    throw error;
  }
}

/**
 * Toggle disponibilidad de combo
 */
export async function toggleComboDisponibilidad(
  id: string,
  disponible: boolean,
  negocioId: string
): Promise<void> {
  try {
    await assertDocumentTenant('combos', id, negocioId);
    const docRef = doc(db, 'combos', id);
    await updateDoc(docRef, { disponible });
  } catch (error) {
    console.error('Error toggling combo disponibilidad:', error);
    throw error;
  }
}

/**
 * Toggle destacado de combo (favorito / destacado en tienda)
 */
export async function toggleComboDestacado(
  id: string,
  destacado: boolean,
  negocioId: string
): Promise<void> {
  try {
    await assertDocumentTenant('combos', id, negocioId);
    const docRef = doc(db, 'combos', id);
    await updateDoc(docRef, { 
      destacado,
      actualizadoEn: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error toggling combo destacado:', error);
    throw error;
  }
}
