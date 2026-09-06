// src/services/chatService.ts
import {
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db } from '@/services/firebase';
import type { ChatSesion, EstadoChat, MensajeChat } from '@/types/chat';
import { requireTenantId } from '@/security/tenantScope';
import {
  normalizarTextoChat,
  resumirMensajeChat,
  CHAT_MENSAJE_MAX,
} from '@/utils/chatValidation';

/** Tope de mensajes que se traen de un hilo. Coincide con el de la bandeja. */
const MAX_MENSAJES = 100;

const chatDoc = (chatId: string) => doc(db, 'chats', chatId);
const mensajesRef = (chatId: string) => collection(db, 'chats', chatId, 'mensajes');

/**
 * Identidad del visitante.
 *
 * No hay servidor propio donde firmar una cookie, así que el hilo se ancla al
 * uid de Firebase: las reglas comparan `chatId == request.auth.uid` y nadie
 * puede leer una conversación ajena. Si la persona ya entró con su cuenta se
 * reutiliza ese uid; si no, se abre una sesión anónima.
 */
export async function asegurarVisitanteChat(): Promise<User> {
  if (!auth) throw new Error('El chat no está disponible en este entorno');
  if (auth.currentUser) return auth.currentUser;

  try {
    const credenciales = await signInAnonymously(auth);
    return credenciales.user;
  } catch (error) {
    const codigo = (error as { code?: string }).code;
    if (codigo === 'auth/operation-not-allowed') {
      throw new Error(
        'El chat requiere habilitar el acceso anónimo en Firebase Authentication'
      );
    }
    throw error;
  }
}

export function onVisitanteChatChange(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, callback);
}

export async function getSesionChat(chatId: string): Promise<ChatSesion | null> {
  const snapshot = await getDoc(chatDoc(chatId));
  if (!snapshot.exists()) return null;
  return { ...snapshot.data(), id: snapshot.id } as ChatSesion;
}

/**
 * Abre la conversación del visitante o actualiza sus datos de contacto si ya
 * existía. El id es el uid, así que reabrir la tienda recupera el mismo hilo.
 */
export async function abrirSesionChat(
  negocioId: string,
  clienteUid: string,
  nombre: string,
  telefono: string
): Promise<void> {
  const tenantId = requireTenantId(negocioId);
  const clienteNombre = normalizarTextoChat(nombre);
  const clienteTelefono = normalizarTextoChat(telefono);
  const existente = await getSesionChat(clienteUid);

  if (existente) {
    await updateDoc(chatDoc(clienteUid), {
      clienteNombre,
      ...(clienteTelefono ? { clienteTelefono } : {}),
      actualizadoEn: serverTimestamp(),
    });
    return;
  }

  await setDoc(chatDoc(clienteUid), {
    negocioId: tenantId,
    clienteUid,
    clienteNombre,
    ...(clienteTelefono ? { clienteTelefono } : {}),
    estado: 'abierto' as EstadoChat,
    ultimoMensaje: '',
    ultimoMensajeEn: serverTimestamp(),
    noLeidosAdmin: 0,
    noLeidosCliente: 0,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
}

/**
 * Escribe el mensaje y actualiza el resumen de la sesión en un solo lote, para
 * que la bandeja nunca muestre un hilo con un último mensaje que no existe.
 */
async function enviarMensaje(
  chatId: string,
  autor: 'cliente' | 'asesor',
  autorNombre: string,
  texto: string,
  cambiosSesion: Record<string, unknown>
): Promise<void> {
  const contenido = texto.trim().slice(0, CHAT_MENSAJE_MAX);
  const lote = writeBatch(db);

  lote.set(doc(mensajesRef(chatId)), {
    autor,
    autorNombre: normalizarTextoChat(autorNombre),
    texto: contenido,
    creadoEn: serverTimestamp(),
  });

  lote.update(chatDoc(chatId), {
    ultimoMensaje: resumirMensajeChat(contenido),
    ultimoMensajeEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
    ...cambiosSesion,
  });

  await lote.commit();
}

export async function enviarMensajeCliente(
  chatId: string,
  clienteNombre: string,
  texto: string,
  estadoActual?: EstadoChat
): Promise<void> {
  await enviarMensaje(chatId, 'cliente', clienteNombre, texto, {
    noLeidosAdmin: increment(1),
    // Escribir reabre un hilo cerrado, pero no borra el "en atención" de un
    // asesor que ya lo está trabajando.
    ...(estadoActual === 'cerrado' ? { estado: 'abierto' as EstadoChat } : {}),
  });
}

export async function enviarMensajeAsesor(
  chatId: string,
  asesorNombre: string,
  texto: string
): Promise<void> {
  await enviarMensaje(chatId, 'asesor', asesorNombre, texto, {
    noLeidosCliente: increment(1),
    noLeidosAdmin: 0,
    estado: 'en_atencion' as EstadoChat,
  });
}

export function onMensajesChatChange(
  chatId: string,
  callback: (mensajes: MensajeChat[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(mensajesRef(chatId), orderBy('creadoEn', 'asc'), limit(MAX_MENSAJES));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((mensaje) => ({
          ...mensaje.data(),
          id: mensaje.id,
        } as MensajeChat))
      );
    },
    (error) => onError?.(error)
  );
}

export function onSesionChatChange(
  chatId: string,
  callback: (sesion: ChatSesion | null) => void
): () => void {
  return onSnapshot(chatDoc(chatId), (snapshot) => {
    callback(snapshot.exists() ? ({ ...snapshot.data(), id: snapshot.id } as ChatSesion) : null);
  });
}

/** Bandeja del negocio: todas las conversaciones del tenant, la más reciente arriba. */
export function onSesionesChatChange(
  negocioId: string,
  callback: (sesiones: ChatSesion[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(
    collection(db, 'chats'),
    where('negocioId', '==', requireTenantId(negocioId)),
    orderBy('ultimoMensajeEn', 'desc'),
    limit(MAX_MENSAJES)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((sesion) => ({
          ...sesion.data(),
          id: sesion.id,
        } as ChatSesion))
      );
    },
    (error) => onError?.(error)
  );
}

export async function marcarChatLeidoPorAdmin(chatId: string): Promise<void> {
  await updateDoc(chatDoc(chatId), {
    noLeidosAdmin: 0,
    actualizadoEn: serverTimestamp(),
  });
}

export async function marcarChatLeidoPorCliente(chatId: string): Promise<void> {
  await updateDoc(chatDoc(chatId), {
    noLeidosCliente: 0,
    actualizadoEn: serverTimestamp(),
  });
}

export async function cambiarEstadoChat(chatId: string, estado: EstadoChat): Promise<void> {
  await updateDoc(chatDoc(chatId), {
    estado,
    actualizadoEn: serverTimestamp(),
  });
}

/** Momento del último mensaje en milisegundos, para el control de intervalo local. */
export function momentoUltimoMensaje(sesion: ChatSesion | null): number | null {
  const valor = sesion?.ultimoMensajeEn;
  if (!valor || !(valor instanceof Timestamp)) return null;
  return valor.toMillis();
}
