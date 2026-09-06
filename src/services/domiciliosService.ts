import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  addDoc,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Domicilio, EstadoDomicilio, MetodoPago, Venta } from '../types';
import { requireTenantId } from '@/security/tenantScope';
import { assertDeliveryTransition, getDeliverySaleId } from '@/utils/deliveryTransitions';

/**
 * Obtener domicilios activos (no entregados)
 */
export async function getDomiciliosActivos(negocioId: string): Promise<Domicilio[]> {
  try {
    const tenantId = requireTenantId(negocioId);
    const domsRef = collection(db, 'domicilios');
    const q = query(
      domsRef,
      where('negocioId', '==', tenantId),
      where('estado', 'in', ['pendiente', 'en_preparacion', 'en_camino']),
      orderBy('creadoEn', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    } as Domicilio));
  } catch (error) {
    console.error('Error fetching domicilios activos:', error);
    throw error;
  }
}

/**
 * Obtener domicilios creados hoy cuyo estado actual ya es entregado.
 * No representa la fecha de entrega porque el modelo no almacena ese dato.
 */
export async function getDomiciliosEntregados(negocioId: string): Promise<Domicilio[]> {
  try {
    const tenantId = requireTenantId(negocioId);
    const domsRef = collection(db, 'domicilios');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const q = query(
      domsRef,
      where('negocioId', '==', tenantId),
      where('estado', '==', 'entregado'),
      where('creadoEn', '>=', Timestamp.fromDate(hoy)),
      orderBy('creadoEn', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    } as Domicilio));
  } catch (error) {
    console.error('Error fetching domicilios entregados:', error);
    throw error;
  }
}

/**
 * Obtener un domicilio por ID
 */
export async function getDomicilioById(id: string, negocioId: string): Promise<Domicilio | null> {
  try {
    const tenantId = requireTenantId(negocioId);
    const docRef = doc(db, 'domicilios', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().negocioId === tenantId) {
      return {
        ...docSnap.data(),
        id: docSnap.id,
      } as Domicilio;
    }
    return null;
  } catch (error) {
    console.error('Error fetching domicilio:', error);
    return null;
  }
}

/**
 * Actualizar estado del domicilio
 * Flujo: pendiente → en_preparacion → en_camino → entregado
 */
export async function updateDomicilioEstado(
  id: string,
  nuevoEstado: EstadoDomicilio,
  negocioId: string
): Promise<void> {
  if (nuevoEstado === 'entregado') {
    await finalizarDomicilio(id, negocioId);
    return;
  }

  try {
    const tenantId = requireTenantId(negocioId);
    const docRef = doc(db, 'domicilios', id);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists() || snapshot.data().negocioId !== tenantId) {
        throw new Error('El domicilio no pertenece al negocio activo');
      }

      const domicilio = { ...snapshot.data(), id: snapshot.id } as Domicilio;
      assertDeliveryTransition(domicilio.estado, nuevoEstado);
      transaction.update(docRef, {
        estado: nuevoEstado,
        actualizadoEn: Timestamp.now(),
      });
    });
  } catch (error) {
    console.error('Error updating domicilio estado:', error);
    throw error;
  }
}

/**
 * Listener en tiempo real para domicilios activos
 * Se ejecuta cuando hay cambios en domicilios no entregados
 */
export function onDomiciliosActivosChange(
  negocioId: string,
  callback: (domicilios: Domicilio[]) => void,
  onError?: (error: Error) => void
): () => void {
  const domsRef = collection(db, 'domicilios');
  const q = query(
    domsRef,
    where('negocioId', '==', requireTenantId(negocioId)),
    where('estado', 'in', ['pendiente', 'en_preparacion', 'en_camino']),
    orderBy('creadoEn', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const domicilios = snapshot.docs.map((doc: any) => ({
        ...doc.data(),
        id: doc.id,
      } as Domicilio));
      callback(domicilios);
    },
    (error) => {
      console.error('Error listening to active domicilios:', error);
      if (onError) onError(error);
      callback([]);
    }
  );
}

/**
 * Listener para detectar NUEVOS domicilios (Fase 3: alerta sonora)
 * Útil para reproducir sonido cuando llega pedido nuevo
 */
export function onNuevoDomicilio(
  negocioId: string,
  callback: (domicilio: Domicilio) => void
): () => void {
  const domsRef = collection(db, 'domicilios');
  const ahora = new Date();
  ahora.setSeconds(ahora.getSeconds() - 10); // últimos 10 segundos

  const q = query(
    domsRef,
    where('negocioId', '==', requireTenantId(negocioId)),
    where('estado', '==', 'pendiente'),
    where('creadoEn', '>=', Timestamp.fromDate(ahora))
  );

  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change: any) => {
      if (change.type === 'added') {
        const domicilio = {
          id: change.doc.id,
          ...change.doc.data(),
        } as Domicilio;
        callback(domicilio);
      }
    });
  });
}

/**
 * Finaliza un domicilio y crea su venta exactly-once en una sola transacción.
 * El id determinista evita duplicados ante doble clic, reintento o concurrencia.
 */
export async function finalizarDomicilio(
  id: string,
  negocioId: string
): Promise<string> {
  try {
    const tenantId = requireTenantId(negocioId);
    const domicilioRef = doc(db, 'domicilios', id);

    return await runTransaction(db, async (transaction) => {
      const domicilioSnapshot = await transaction.get(domicilioRef);
      if (!domicilioSnapshot.exists() || domicilioSnapshot.data().negocioId !== tenantId) {
        throw new Error('El domicilio no pertenece al negocio activo');
      }

      const domicilio = {
        ...domicilioSnapshot.data(),
        id: domicilioSnapshot.id,
      } as Domicilio;
      assertDeliveryTransition(domicilio.estado, 'entregado');

      const ventaId = domicilio.ventaId || getDeliverySaleId(domicilio.id);
      const ventaRef = doc(db, 'ventas', ventaId);
      if (!domicilio.ventaId) {
        const venta: Omit<Venta, 'id'> = {
          negocioId: tenantId,
          items: domicilio.items,
          total: domicilio.total,
          metodoPago: domicilio.metodoPago,
          tipoEntrega: 'domicilio',
          origen: domicilio.origen,
          // Hora real en que se cerró la entrega.
          fecha: Timestamp.now(),
          domicilioId: domicilio.id,
          direccion: domicilio.direccion,
          clienteTelefono: domicilio.clienteTelefono,
        };
        transaction.set(ventaRef, venta);
      }

      transaction.update(domicilioRef, {
        estado: 'entregado',
        ventaId,
        actualizadoEn: Timestamp.now(),
      });

      return ventaId;
    });
  } catch (error) {
    console.error('Error finalizando domicilio:', error);
    throw error;
  }
}

/**
 * Crear un domicilio desde POS con los items del carrito y datos del cliente
 */
export async function crearDomicilioDesdePos(
  negocioId: string,
  items: any[],
  total: number,
  metodoPago: MetodoPago,
  clienteNombre: string,
  clienteApellido: string,
  clienteTelefono: string,
  direccion: string,
  barrio: string
): Promise<string> {
  try {
    const tenantId = requireTenantId(negocioId);
    const domiciliosRef = collection(db, 'domicilios');
    const domicilio: Omit<Domicilio, 'id'> = {
      negocioId: tenantId,
      clienteNombre: `${clienteNombre} ${clienteApellido}`,
      clienteTelefono,
      direccion,
      barrio,
      items,
      total,
      metodoPago,
      origen: 'pos',
      estado: 'pendiente',
      creadoEn: Timestamp.now(),
      actualizadoEn: Timestamp.now(),
    };

    const docRef = await addDoc(domiciliosRef, domicilio);
    return docRef.id;
  } catch (error) {
    console.error('Error creating domicilio from POS:', error);
    throw error;
  }
}
