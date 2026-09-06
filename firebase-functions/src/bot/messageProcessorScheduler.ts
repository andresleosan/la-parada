import * as functions from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {
  BotQueueMessage,
  obtenerMensajesPendientes,
  reclamarMensajeQueue,
  enviarRespuestaQueue,
  enviarMensajeBotPersistido,
  guardarResultadoQueue,
  marcarMensajeProcesado,
  reintenrarMensajeEnQueue,
  renderAutoRespuesta,
} from './whatsappBotService';
import {
  procesarMensajePorBot,
  generarResumenOrden,
  obtenerOrdenPendiente,
} from './orderProcessingService';
import { obtenerMenuDelCache, actualizarCacheMenu } from './menuGenerationService';
import {
  requireConfiguredValue,
  whatsappAccessToken,
  whatsappNegocioId,
} from '../config/integrationParams';
import { assertOfflineOnlyContent } from './manualMessage';

const getDb = () => admin.firestore();

function getConfiguredTenantId(): string {
  return requireConfiguredValue(whatsappNegocioId.value(), 'WHATSAPP_NEGOCIO_ID');
}

interface BotRuntimeConfig {
  activo: boolean;
  mensajeBienvenida: string;
  mensajeCierre: string;
}

function configuredMessage(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return fallback;
  try {
    assertOfflineOnlyContent(normalized);
    return normalized;
  } catch {
    return fallback;
  }
}

async function getBotRuntimeConfig(negocioId: string): Promise<BotRuntimeConfig> {
  const snapshot = await getDb().collection('configuracion').doc(negocioId).get();
  const data = snapshot.data();
  return {
    activo: data?.negocioId === negocioId && data?.activo === true,
    mensajeBienvenida: configuredMessage(
      data?.mensajeBienvenida,
      renderAutoRespuesta('BIENVENIDA'),
      4096
    ),
    mensajeCierre: configuredMessage(
      data?.mensajeCierre,
      'Gracias por tu pedido. ¡Hasta pronto!',
      1000
    ),
  };
}

/**
 * Scheduled Cloud Function que procesa mensajes en queue
 * Se ejecuta cada 2 minutos
 */
export const procesarMensajesBot = functions.onSchedule(
  {
    schedule: 'every 2 minutes',
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
    maxInstances: 1,
    secrets: [whatsappAccessToken],
  },
  async (context) => {
    try {
      console.log('Starting message processing job...');

      const negocioId = getConfiguredTenantId();
      const config = await getBotRuntimeConfig(negocioId);
      if (!config.activo) {
        console.log('WhatsApp bot is disabled for the configured tenant');
        return;
      }

      // Actualizar cache de menú si es necesario
      await actualizarCacheMenu();

      // Obtener mensajes pendientes
      const mensajesPendientes = await obtenerMensajesPendientes(20);

      console.log(`Processing ${mensajesPendientes.length} messages...`);

      for (const candidato of mensajesPendientes) {
        const mensaje = await reclamarMensajeQueue(candidato.id);
        if (!mensaje) continue;
        try {
          await procesarUnMensaje(mensaje, config);
        } catch (error) {
          console.error(`Error processing message ${mensaje.id}:`, error);
          // Reintentar después
          await reintenrarMensajeEnQueue(mensaje.id, `Error: ${error}`);
        }
      }

      console.log('Message processing job completed');
    } catch (error) {
      console.error('Error in message processing job:', error);
      throw error;
    }
  }
);

/**
 * Procesa un mensaje individual
 */
export async function procesarUnMensaje(
  mensaje: BotQueueMessage,
  runtimeConfig?: BotRuntimeConfig
): Promise<void> {
  const { numeroOrigen, contenido, id: queueId, negocioId, tipoContenido } = mensaje;
  if (negocioId !== getConfiguredTenantId()) {
    throw new Error('Queue message does not belong to the configured tenant');
  }

  if (mensaje.accionPendiente && mensaje.respuestaPendiente) {
    await enviarRespuestaQueue(mensaje, mensaje.respuestaPendiente);
    await marcarMensajeProcesado(queueId, mensaje.accionPendiente);
    return;
  }

  const config = runtimeConfig || await getBotRuntimeConfig(negocioId);

  // Determinar intención del usuario
  const contenidoLower = contenido.toLowerCase();
  let accion: string;
  let respuesta: string;

  if (tipoContenido !== 'text') {
    accion = 'contenido_no_soportado';
    respuesta = 'Por ahora puedo procesar mensajes de texto. Escribe “menú” para comenzar.';
  }

  // SALUDO O INICIO
  else if (
    ['hola', 'hi', 'hey', 'ola', 'buenos'].some((s) => contenidoLower.includes(s)) &&
    contenidoLower.length < 20
  ) {
    accion = 'saludo_enviado';
    respuesta = config.mensajeBienvenida;
  }

  // MENÚ
  else if (
    contenidoLower.includes('menú') ||
    contenidoLower.includes('menu') ||
    contenidoLower === '1'
  ) {
    const menuCache = await obtenerMenuDelCache();
    accion = 'menu_solicitado';
    respuesta = menuCache
      ? `${menuCache.menuProductos}\n\n${menuCache.menuCombos}`.trim()
      : 'El menú no está disponible en este momento. Intenta de nuevo más tarde.';
  }

  // RASTREAR ORDEN
  else if (
    contenidoLower.includes('rastrear') ||
    contenidoLower.includes('dónde') ||
    contenidoLower.includes('donde')
  ) {
    const domicilio = await obtenerUltimoDomicilio(numeroOrigen, negocioId);
    accion = domicilio ? 'rastreo_enviado' : 'rastreo_sin_pedido';
    respuesta = domicilio
      ? `Tu pedido ${domicilio.codigoPublico || domicilio.id} está ${formatearEstado(domicilio.estado)}.`
      : 'No encontré un pedido activo asociado a este número.';
  }

  // SOPORTE
  else if (
    contenidoLower.includes('soporte') ||
    contenidoLower.includes('ayuda') ||
    contenidoLower.includes('problema')
  ) {
    accion = 'soporte_solicitado';
    respuesta = renderAutoRespuesta('SOPORTE');
  }

  // VER ORDEN ACTUAL
  else if (
    contenidoLower.includes('mi orden') ||
    contenidoLower.includes('resumen') ||
    contenidoLower === 'ver'
  ) {
    const orden = await obtenerOrdenPendiente(numeroOrigen);

    if (!orden) {
      accion = 'sin_orden';
      respuesta = 'No tienes una orden pendiente. Escribe “menú” para comenzar.';
    } else {
      const ordenFull = orden as { items?: unknown[] };
      if (!ordenFull.items) {
        throw new Error('Pending order has no items');
      }
      const resumen = await generarResumenOrden(ordenFull.items);
      accion = 'resumen_enviado';
      respuesta = resumen.resumen;
    }
  }

  else {
    const result = await procesarMensajePorBot(numeroOrigen, contenido, {
      queueId,
      mensajeCierre: config.mensajeCierre,
    });
    accion = result.accion;
    respuesta = result.respuesta;
  }

  await guardarResultadoQueue(queueId, accion, respuesta);
  await enviarRespuestaQueue(mensaje, respuesta);
  await marcarMensajeProcesado(queueId, accion);
  console.log(`Queue message processed: ${queueId} - action: ${accion}`);
}

async function obtenerUltimoDomicilio(numeroCliente: string, negocioId: string) {
  const snapshot = await getDb()
    .collection('domicilios')
    .where('negocioId', '==', negocioId)
    .where('clienteTelefono', '==', numeroCliente)
    .limit(20)
    .get();
  const activos = snapshot.docs
    .map((document) => ({
      ...document.data(),
      id: document.id,
    } as {
      id: string;
      estado?: string;
      codigoPublico?: string;
      creadoEn?: admin.firestore.Timestamp;
    }))
    .filter((domicilio) => domicilio.estado !== 'entregado')
    .sort((a, b) => {
      const aMs = typeof a.creadoEn?.toMillis === 'function' ? a.creadoEn.toMillis() : 0;
      const bMs = typeof b.creadoEn?.toMillis === 'function' ? b.creadoEn.toMillis() : 0;
      return bMs - aMs;
    });
  return activos[0] || null;
}

function formatearEstado(estado: unknown): string {
  const labels: Record<string, string> = {
    pendiente: 'pendiente de preparación',
    en_preparacion: 'en preparación',
    en_camino: 'en camino',
    entregado: 'entregado',
  };
  return typeof estado === 'string' ? labels[estado] || 'en gestión' : 'en gestión';
}

/**
 * Limpia órdenes expiradas
 * Se ejecuta cada hora
 */
export const limpiarOrdenesExpiradas = functions.onSchedule(
  {
    schedule: 'every 1 hours',
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    maxInstances: 1,
    secrets: [whatsappAccessToken],
  },
  async (context) => {
    try {
      console.log('Starting cleanup of expired orders...');

      const ahora = admin.firestore.Timestamp.now();
      const negocioId = getConfiguredTenantId();

      const ordenesExpiradas = await getDb()
        .collection('ordenes_pendientes')
        .where('negocioId', '==', negocioId)
        .where('estado', '==', 'pendiente')
        .where('expiraEn', '<', ahora)
        .get();

      console.log(`Found ${ordenesExpiradas.size} expired orders`);

      for (const doc of ordenesExpiradas.docs) {
        await getDb().collection('ordenes_pendientes').doc(doc.id).update({
          estado: 'expirada',
        });

        // Notificar al cliente
        const orden = doc.data();
        try {
          await enviarMensajeBotPersistido({
            outboundId: `orden_expirada_${doc.id}`,
            telefono: orden.numeroCliente,
            contenido: 'Tu selección expiró. Escribe “menú” para iniciar un pedido nuevo.',
          });
        } catch (error) {
          console.error(`Error notifying expired order ${doc.id}:`, error);
        }
      }

      console.log('Cleanup completed');
    } catch (error) {
      console.error('Error in cleanup job:', error);
      throw error;
    }
  }
);

/**
 * Reintenta mensajes en error
 * Se ejecuta cada 5 minutos
 */
export const reintenrarMensajesEnError = functions.onSchedule({
  schedule: 'every 5 minutes',
  region: 'us-central1',
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 1,
}, async (context) => {
  try {
    console.log('Starting retry of failed messages...');

    const proximoReintento = admin.firestore.Timestamp.now();
    const negocioId = getConfiguredTenantId();

    const mensajesEnError = await getDb()
      .collection('bot_queue')
      .where('negocioId', '==', negocioId)
      .where('estado', '==', 'error')
      .where('proximoReintento', '<=', proximoReintento)
      .where('intentos', '<', 3)
      .get();

    console.log(`Retrying ${mensajesEnError.size} failed messages`);

    for (const doc of mensajesEnError.docs) {
      // Cambiar estado a pendiente para reprocesar
      await getDb().collection('bot_queue').doc(doc.id).update({
        estado: 'pendiente',
      });
    }

    const leaseExpirado = await getDb()
      .collection('bot_queue')
      .where('negocioId', '==', negocioId)
      .where('estado', '==', 'procesando')
      .where('leaseHasta', '<=', proximoReintento)
      .get();
    for (const doc of leaseExpirado.docs) {
      await getDb().collection('bot_queue').doc(doc.id).update({
        estado: 'pendiente',
        leaseHasta: admin.firestore.FieldValue.delete(),
      });
    }

    console.log('Retry started');
  } catch (error) {
    console.error('Error in retry job:', error);
    throw error;
  }
});
