// src/utils/chatValidation.ts

/**
 * Límites del chat en vivo. Se replican tal cual en firestore.rules: aquí sirven
 * para dar un mensaje de error útil, allá para que el límite sea real.
 */
export const CHAT_NOMBRE_MIN = 2;
export const CHAT_NOMBRE_MAX = 80;
export const CHAT_TELEFONO_MAX = 24;
export const CHAT_MENSAJE_MAX = 1200;

/** Segundos que deben pasar entre dos mensajes del mismo visitante. */
export const CHAT_INTERVALO_MINIMO_SEGUNDOS = 2;

const TELEFONO_PATRON = /^\+?[0-9()\-\s]{7,24}$/;

export interface DatosVisitanteChat {
  nombre: string;
  telefono: string;
}

/**
 * Recorta y colapsa espacios. Un nombre pegado desde otra parte no debería
 * entrar con saltos de línea ni con veinte espacios seguidos.
 */
export function normalizarTextoChat(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim();
}

export function validarNombreChat(valor: string): string | null {
  const nombre = normalizarTextoChat(valor);
  if (nombre.length < CHAT_NOMBRE_MIN) {
    return `El nombre debe tener al menos ${CHAT_NOMBRE_MIN} caracteres`;
  }
  if (nombre.length > CHAT_NOMBRE_MAX) {
    return `El nombre no puede pasar de ${CHAT_NOMBRE_MAX} caracteres`;
  }
  return null;
}

/** El teléfono es opcional: vacío es válido. */
export function validarTelefonoChat(valor: string): string | null {
  const telefono = normalizarTextoChat(valor);
  if (!telefono) return null;
  if (telefono.length > CHAT_TELEFONO_MAX) {
    return `El teléfono no puede pasar de ${CHAT_TELEFONO_MAX} caracteres`;
  }
  if (!TELEFONO_PATRON.test(telefono)) {
    return 'El teléfono no tiene un formato válido';
  }
  return null;
}

export function validarMensajeChat(valor: string): string | null {
  const texto = valor.trim();
  if (!texto) return 'Escribe un mensaje antes de enviarlo';
  if (texto.length > CHAT_MENSAJE_MAX) {
    return `El mensaje no puede pasar de ${CHAT_MENSAJE_MAX} caracteres`;
  }
  return null;
}

/**
 * Resumen del mensaje que se guarda en la sesión para la bandeja.
 * Se corta a 120 caracteres porque la lista solo muestra una línea.
 */
export function resumirMensajeChat(texto: string): string {
  const normalizado = normalizarTextoChat(texto);
  return normalizado.length <= 120 ? normalizado : `${normalizado.slice(0, 119)}…`;
}

/**
 * Milisegundos que faltan para poder enviar otro mensaje, o 0 si ya se puede.
 * Espeja el intervalo mínimo que exigen las reglas de Firestore, para avisar
 * antes de gastar una escritura que el servidor va a rechazar.
 */
export function esperaRestanteChat(ultimoEnvioMs: number | null, ahoraMs: number): number {
  if (ultimoEnvioMs === null) return 0;
  const transcurrido = ahoraMs - ultimoEnvioMs;
  const minimo = CHAT_INTERVALO_MINIMO_SEGUNDOS * 1000;
  return transcurrido >= minimo ? 0 : minimo - transcurrido;
}
