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
} from 'firebase/firestore';
import { db } from './firebase';
import { Gasto, CategoriaGasto } from '../types';
import { requireTenantId } from '@/security/tenantScope';

async function assertGastoTenant(id: string, negocioId: string): Promise<string> {
  const tenantId = requireTenantId(negocioId);
  const snapshot = await getDoc(doc(db, 'gastos', id));
  if (!snapshot.exists() || snapshot.data().negocioId !== tenantId) {
    throw new Error('El gasto no pertenece al negocio activo');
  }
  return tenantId;
}

/**
 * Crear nuevo gasto
 */
export async function crearGasto(data: Omit<Gasto, 'id'>): Promise<string> {
  try {
    const tenantId = requireTenantId(data.negocioId);
    const gastosRef = collection(db, 'gastos');
    const docRef = await addDoc(gastosRef, {
      ...data,
      negocioId: tenantId,
      creadoEn: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating gasto:', error);
    throw error;
  }
}

/**
 * Actualizar gasto
 */
export async function actualizarGasto(
  id: string,
  updates: Partial<Gasto>,
  negocioId: string
): Promise<void> {
  try {
    const tenantId = await assertGastoTenant(id, negocioId);
    const docRef = doc(db, 'gastos', id);
    await updateDoc(docRef, {
      ...updates,
      negocioId: tenantId,
      actualizadoEn: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating gasto:', error);
    throw error;
  }
}

/**
 * Eliminar gasto
 */
export async function eliminarGasto(id: string, negocioId: string): Promise<void> {
  try {
    await assertGastoTenant(id, negocioId);
    const docRef = doc(db, 'gastos', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting gasto:', error);
    throw error;
  }
}

/**
 * Obtener gastos de una categoría
 */
export async function getGastosPorCategoria(
  negocioId: string,
  categoria: CategoriaGasto
): Promise<Gasto[]> {
  try {
    const gastosRef = collection(db, 'gastos');
    const q = query(
      gastosRef,
      where('negocioId', '==', requireTenantId(negocioId)),
      where('categoria', '==', categoria),
      orderBy('fecha', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    } as Gasto));
  } catch (error) {
    console.error('Error fetching gastos por categoria:', error);
    return [];
  }
}

/**
 * Obtener todos los gastos (sin filtro)
 */
export async function getTodosGastos(negocioId: string): Promise<Gasto[]> {
  try {
    const gastosRef = collection(db, 'gastos');
    const q = query(
      gastosRef,
      where('negocioId', '==', requireTenantId(negocioId)),
      orderBy('fecha', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    } as Gasto));
  } catch (error) {
    console.error('Error fetching todos gastos:', error);
    throw error;
  }
}

/**
 * Obtener gastos de hoy
 */
export async function getGastosHoy(negocioId: string): Promise<Gasto[]> {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    const gastosRef = collection(db, 'gastos');
    const q = query(
      gastosRef,
      where('negocioId', '==', requireTenantId(negocioId)),
      where('fecha', '>=', Timestamp.fromDate(hoy)),
      where('fecha', '<', Timestamp.fromDate(mañana)),
      orderBy('fecha', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    } as Gasto));
  } catch (error) {
    console.error('Error fetching gastos hoy:', error);
    return [];
  }
}

/**
 * Listener en tiempo real para todos los gastos
 */
export function onTodosGastosChange(
  negocioId: string,
  callback: (gastos: Gasto[]) => void
): () => void {
  const gastosRef = collection(db, 'gastos');
  const q = query(
    gastosRef,
    where('negocioId', '==', requireTenantId(negocioId)),
    orderBy('fecha', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const gastos = snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    } as Gasto));
    callback(gastos);
  });
}

/**
 * Calcular total de gastos para un período
 */
export async function calcularTotalGastos(
  negocioId: string,
  fechaInicio: Date,
  fechaFin: Date
): Promise<number> {
  try {
    const gastosRef = collection(db, 'gastos');
    const q = query(
      gastosRef,
      where('negocioId', '==', requireTenantId(negocioId)),
      where('fecha', '>=', Timestamp.fromDate(fechaInicio)),
      where('fecha', '<=', Timestamp.fromDate(fechaFin))
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.reduce((total, doc) => {
      const gasto = doc.data() as Gasto;
      return total + (gasto.monto || 0);
    }, 0);
  } catch (error) {
    console.error('Error calculating total gastos:', error);
    return 0;
  }
}

/**
 * Obtener gastos agrupados por categoría
 */
export async function getGastosPorCategoriaAgrupados(negocioId: string): Promise<
  Record<CategoriaGasto, number>
> {
  try {
    const gastos = await getTodosGastos(negocioId);
    const agrupados: Record<CategoriaGasto, number> = {
      salarios: 0,
      servicios: 0,
      insumos: 0,
      mantenimiento: 0,
      otros: 0,
      gas: 0,
      domiciliario: 0,
      varios: 0,
    };

    gastos.forEach((gasto) => {
      agrupados[gasto.categoria] = (agrupados[gasto.categoria] || 0) + (gasto.monto || 0);
    });

    return agrupados;
  } catch (error) {
    console.error('Error grouping gastos por categoria:', error);
    return {
      salarios: 0,
      servicios: 0,
      insumos: 0,
      mantenimiento: 0,
      otros: 0,
      gas: 0,
      domiciliario: 0,
      varios: 0,
    };
  }
}
