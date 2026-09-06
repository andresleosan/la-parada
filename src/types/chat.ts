// src/types/chat.ts
import { Timestamp } from 'firebase/firestore';

/**
 * Estado de una conversación en la bandeja del negocio.
 *
 * `abierto`: nadie la ha tomado todavía.
 * `en_atencion`: un asesor ya respondió.
 * `cerrado`: se dio por terminada; el cliente puede reabrirla escribiendo.
 */
export type EstadoChat = 'abierto' | 'en_atencion' | 'cerrado';

export type AutorMensajeChat = 'cliente' | 'asesor';

/**
 * Conversación entre un visitante de la tienda y el negocio.
 *
 * El id del documento es siempre el uid de Firebase del visitante, así cada
 * persona tiene exactamente un hilo y las reglas pueden verificar la propiedad
 * comparando `chatId == request.auth.uid` sin leer el documento.
 */
export interface ChatSesion {
  id: string;
  negocioId: string;
  clienteUid: string;
  clienteNombre: string;
  clienteTelefono?: string;
  estado: EstadoChat;
  /** Copia del último mensaje para pintar la bandeja sin abrir cada hilo. */
  ultimoMensaje: string;
  ultimoMensajeEn: Timestamp;
  noLeidosAdmin: number;
  noLeidosCliente: number;
  creadoEn: Timestamp;
  actualizadoEn: Timestamp;
}

export interface MensajeChat {
  id: string;
  autor: AutorMensajeChat;
  autorNombre: string;
  texto: string;
  creadoEn: Timestamp;
}
