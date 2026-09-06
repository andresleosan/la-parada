"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsearComandoOrden = parsearComandoOrden;
exports.crearOrdenPendiente = crearOrdenPendiente;
exports.obtenerOrdenPendiente = obtenerOrdenPendiente;
exports.generarResumenOrden = generarResumenOrden;
exports.confirmarOrden = confirmarOrden;
exports.procesarMensajePorBot = procesarMensajePorBot;
exports.obtenerEstadisticasOrdenes = obtenerEstadisticasOrdenes;
const admin = __importStar(require("firebase-admin"));
const node_crypto_1 = require("node:crypto");
const menuGenerationService_1 = require("./menuGenerationService");
const whatsappBotService_1 = require("./whatsappBotService");
const integrationParams_1 = require("../config/integrationParams");
const getDb = () => admin.firestore();
function getConfiguredTenantId() {
    return (0, integrationParams_1.requireConfiguredValue)(integrationParams_1.whatsappNegocioId.value(), 'WHATSAPP_NEGOCIO_ID');
}
function deterministicDocumentId(...parts) {
    return (0, node_crypto_1.createHash)('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 48);
}
function activeOrderRef(negocioId, numeroCliente) {
    return getDb()
        .collection('_ordenes_whatsapp_activas')
        .doc(`wa_${deterministicDocumentId(negocioId, numeroCliente)}`);
}
function validatePhone(numeroCliente) {
    if (!/^\d{6,20}$/.test(numeroCliente)) {
        throw new Error('Número de cliente inválido');
    }
}
function validateOperationContext(context) {
    if (!context)
        return;
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(context.queueId)) {
        throw new Error('Identificador de operación inválido');
    }
    if (context.mensajeCierre !== undefined) {
        const cierre = context.mensajeCierre.trim();
        if (!cierre || cierre.length > 1000) {
            throw new Error('Mensaje de cierre inválido');
        }
    }
}
function readPersistedResult(data) {
    if (typeof data?.accionPendiente === 'string'
        && data.accionPendiente.length > 0
        && data.accionPendiente.length <= 100
        && typeof data?.respuestaPendiente === 'string'
        && data.respuestaPendiente.length > 0
        && data.respuestaPendiente.length <= 4096) {
        return {
            accion: data.accionPendiente,
            respuesta: data.respuestaPendiente,
        };
    }
    return null;
}
async function readQueueOperation(transaction, negocioId, numeroCliente, contenidoMensaje, context) {
    if (!context)
        return null;
    const ref = getDb().collection('bot_queue').doc(context.queueId);
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!snapshot.exists
        || data?.negocioId !== negocioId
        || data?.numeroOrigen !== numeroCliente
        || data?.contenido !== contenidoMensaje) {
        throw new Error('La operación no coincide con el mensaje en cola');
    }
    const result = readPersistedResult(data);
    if (!result && data?.estado !== 'procesando') {
        throw new Error('La operación no tiene un lease activo');
    }
    return { ref, result };
}
async function loadPersistedQueueResult(negocioId, numeroCliente, contenidoMensaje, context) {
    if (!context)
        return null;
    const snapshot = await getDb().collection('bot_queue').doc(context.queueId).get();
    const data = snapshot.data();
    if (!snapshot.exists
        || data?.negocioId !== negocioId
        || data?.numeroOrigen !== numeroCliente
        || data?.contenido !== contenidoMensaje) {
        throw new Error('La operación no coincide con el mensaje en cola');
    }
    return readPersistedResult(data);
}
function persistQueueResult(transaction, operation, result) {
    if (!operation)
        return;
    if (!result.accion || result.accion.length > 100 || !result.respuesta || result.respuesta.length > 4096) {
        throw new Error('Resultado de bot inválido');
    }
    transaction.update(operation.ref, {
        accionPendiente: result.accion,
        respuestaPendiente: result.respuesta,
        logicaProcesadaEn: admin.firestore.FieldValue.serverTimestamp(),
    });
}
function normalizePendingItems(rawItems) {
    if (!Array.isArray(rawItems))
        return [];
    const result = [];
    for (const raw of rawItems) {
        if (!raw || typeof raw !== 'object')
            return [];
        const item = raw;
        if (typeof item.productoId !== 'string'
            || !item.productoId
            || item.productoId.includes('/')
            || (item.catalogoTipo !== 'producto' && item.catalogoTipo !== 'combo')
            || typeof item.nombreSnapshot !== 'string'
            || !item.nombreSnapshot.trim()
            || !Number.isFinite(item.precioSnapshot)
            || Number(item.precioSnapshot) <= 0
            || !Number.isInteger(item.cantidad)
            || Number(item.cantidad) < 1
            || Number(item.cantidad) > 50) {
            return [];
        }
        result.push({
            productoId: item.productoId,
            catalogoTipo: item.catalogoTipo,
            nombreSnapshot: item.nombreSnapshot.trim().slice(0, 120),
            precioSnapshot: Number(item.precioSnapshot),
            cantidad: Number(item.cantidad),
            ...(typeof item.categoria === 'string' && item.categoria
                ? { categoria: item.categoria.slice(0, 100) }
                : {}),
        });
    }
    return result;
}
function buildOrderSummary(items) {
    let total = 0;
    const lines = ['🛒 RESUMEN DE TU ORDEN:', ''];
    for (const item of items) {
        const subtotal = item.precioSnapshot * item.cantidad;
        total += subtotal;
        lines.push(`${item.cantidad}x ${item.nombreSnapshot} - $${subtotal.toLocaleString('es-CO')}`);
    }
    lines.push('', `💰 TOTAL: $${total.toLocaleString('es-CO')}`, '', '¿Deseas confirmar? Responde "confirmar"');
    const resumen = lines.join('\n');
    if (resumen.length > 4096)
        throw new Error('El resumen de la orden supera el límite permitido');
    return { resumen, total };
}
async function readActivePendingOrder(transaction, negocioId, numeroCliente) {
    const pointerRef = activeOrderRef(negocioId, numeroCliente);
    const pointerSnapshot = await transaction.get(pointerRef);
    const pointer = pointerSnapshot.data();
    if (pointerSnapshot.exists) {
        if (pointer?.negocioId !== negocioId || pointer?.numeroCliente !== numeroCliente) {
            throw new Error('El puntero de orden activa no pertenece al cliente');
        }
        if (typeof pointer?.ordenId === 'string' && pointer.ordenId) {
            const orderRef = getDb().collection('ordenes_pendientes').doc(pointer.ordenId);
            const orderSnapshot = await transaction.get(orderRef);
            const orderData = orderSnapshot.data();
            if (orderSnapshot.exists
                && orderData?.negocioId === negocioId
                && orderData?.numeroCliente === numeroCliente
                && orderData?.estado === 'pendiente') {
                return { pointerRef, orderRef, orderData };
            }
        }
    }
    // Compatibilidad temporal con órdenes creadas antes del puntero determinístico.
    const legacyQuery = getDb()
        .collection('ordenes_pendientes')
        .where('negocioId', '==', negocioId)
        .where('numeroCliente', '==', numeroCliente)
        .where('estado', '==', 'pendiente')
        .limit(2);
    const legacySnapshot = await transaction.get(legacyQuery);
    if (legacySnapshot.size > 1) {
        throw new Error('Existen varias órdenes pendientes para el mismo cliente');
    }
    if (!legacySnapshot.empty) {
        return {
            pointerRef,
            orderRef: legacySnapshot.docs[0].ref,
            orderData: legacySnapshot.docs[0].data(),
        };
    }
    return { pointerRef, orderRef: null, orderData: null };
}
function pointerPayload(negocioId, numeroCliente, ordenId, estado) {
    return {
        negocioId,
        numeroCliente,
        ordenId,
        estado,
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    };
}
/**
 * Parsea comando de orden desde mensaje de texto
 * Ej: "1", "1 2 3", "1x2" (cantidad), "búsqueda: arroz"
 */
function parsearComandoOrden(mensaje) {
    const comandoLimpio = mensaje.trim().toLowerCase();
    if (comandoLimpio === 'efectivo' || comandoLimpio === 'transferencia') {
        return {
            tipo: 'metodo_pago',
            items: [],
            metodoPago: comandoLimpio,
        };
    }
    const direccionMatch = mensaje.trim().match(/^direcci[oó]n\s*:\s*(.+)$/i);
    if (direccionMatch) {
        const [direccionRaw, barrioRaw] = direccionMatch[1].split('|', 2);
        return {
            tipo: 'direccion',
            items: [],
            direccion: direccionRaw.trim(),
            barrio: barrioRaw?.trim() || 'Por coordinar',
        };
    }
    // Búsqueda: "búsqueda: arroz"
    if (comandoLimpio.includes('búsqueda:') || comandoLimpio.includes('buscar')) {
        const termino = comandoLimpio.replace(/búsqueda:|buscar/g, '').trim();
        return { tipo: 'busqueda', items: [], busqueda: termino };
    }
    // Confirmación: "confirmar", "ok", "listo", "sí"
    if (['confirmar', 'ok', 'listo', 'sí', 'si', 'yes'].includes(comandoLimpio)) {
        return { tipo: 'confirmacion', items: [] };
    }
    // Cantidad: "1x2" o "1 x 2"
    const regexCantidad = /(\d+)\s*x\s*(\d+)/gi;
    const esListaCantidades = /^\d+\s*x\s*\d+(?:[\s,]+\d+\s*x\s*\d+)*$/i.test(comandoLimpio);
    const cantidadMatch = esListaCantidades ? [...comandoLimpio.matchAll(regexCantidad)] : [];
    if (cantidadMatch.length > 0) {
        const items = cantidadMatch.map((match) => Number(match[1]));
        const cantidades = cantidadMatch.map((match) => Number(match[2]));
        if (items.some((item) => !Number.isInteger(item) || item < 1 || item > 120)
            || cantidades.some((cantidad) => !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20)
            || items.length > 10) {
            return { tipo: 'desconocido', items: [] };
        }
        return { tipo: 'item', items, cantidades };
    }
    // Items simples: "1 2 3" o "1, 2, 3"
    if (!/^\d+(?:[\s,]+\d+)*$/.test(comandoLimpio)) {
        return { tipo: 'desconocido', items: [] };
    }
    const items = comandoLimpio
        .split(/[\s,]+/)
        .map((value) => Number(value));
    if (items.length === 0 || items.length > 10 || items.some((item) => item < 1 || item > 120)) {
        return { tipo: 'desconocido', items: [] };
    }
    return { tipo: 'item', items, cantidades: items.map(() => 1) };
}
/**
 * Crea o actualiza una orden de usuario
 */
async function crearOrdenPendiente(numeroCliente, items, contenidoMensaje, operationContext) {
    validatePhone(numeroCliente);
    validateOperationContext(operationContext);
    if (items.length < 1
        || items.length > 10
        || items.some((item) => (!item.productoId
            || item.productoId.includes('/')
            || (item.catalogoTipo !== 'producto' && item.catalogoTipo !== 'combo')
            || !item.nombreSnapshot
            || !Number.isFinite(item.precioSnapshot)
            || item.precioSnapshot <= 0
            || !Number.isInteger(item.cantidad)
            || item.cantidad < 1
            || item.cantidad > 20))) {
        throw new Error('Items de orden inválidos');
    }
    const negocioId = getConfiguredTenantId();
    return getDb().runTransaction(async (transaction) => {
        const operation = await readQueueOperation(transaction, negocioId, numeroCliente, contenidoMensaje, operationContext);
        if (operation?.result)
            return { ordenId: '', result: operation.result };
        const active = await readActivePendingOrder(transaction, negocioId, numeroCliente);
        const currentItems = active.orderData ? normalizePendingItems(active.orderData.items) : [];
        if (active.orderData && currentItems.length === 0) {
            throw new Error('La orden pendiente usa un formato inválido o heredado');
        }
        const itemsActualizados = currentItems.map((item) => ({ ...item }));
        for (const item of items) {
            const index = itemsActualizados.findIndex((current) => current.productoId === item.productoId
                && current.catalogoTipo === item.catalogoTipo);
            if (index >= 0) {
                itemsActualizados[index].cantidad += item.cantidad;
                itemsActualizados[index].nombreSnapshot = item.nombreSnapshot;
                itemsActualizados[index].precioSnapshot = item.precioSnapshot;
            }
            else {
                itemsActualizados.push({ ...item });
            }
        }
        const cantidadTotal = itemsActualizados.reduce((total, item) => total + item.cantidad, 0);
        if (itemsActualizados.length > 20 || cantidadTotal > 50) {
            throw new Error('La orden supera el límite permitido');
        }
        const result = {
            accion: 'items_agregados',
            respuesta: buildOrderSummary(itemsActualizados).resumen,
        };
        const orderRef = active.orderRef || getDb()
            .collection('ordenes_pendientes')
            .doc(`wa_${deterministicDocumentId(negocioId, numeroCliente, operationContext?.queueId || Date.now().toString())}`);
        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        if (active.orderRef) {
            transaction.update(orderRef, {
                items: itemsActualizados,
                paso: 'seleccionando',
                metodoPago: admin.firestore.FieldValue.delete(),
                direccion: admin.firestore.FieldValue.delete(),
                barrio: admin.firestore.FieldValue.delete(),
                actualizadoEn: timestamp,
                expiraEn: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000)),
            });
        }
        else {
            transaction.create(orderRef, {
                negocioId,
                numeroCliente,
                items: itemsActualizados,
                estado: 'pendiente',
                paso: 'seleccionando',
                creadoEn: timestamp,
                actualizadoEn: timestamp,
                expiraEn: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000)),
            });
        }
        transaction.set(active.pointerRef, pointerPayload(negocioId, numeroCliente, orderRef.id, 'pendiente'), { merge: false });
        persistQueueResult(transaction, operation, result);
        return { ordenId: orderRef.id, result };
    });
}
/**
 * Obtiene orden pendiente del usuario
 */
async function obtenerOrdenPendiente(numeroCliente) {
    validatePhone(numeroCliente);
    const negocioId = getConfiguredTenantId();
    const ordenesSnapshot = await getDb()
        .collection('ordenes_pendientes')
        .where('negocioId', '==', negocioId)
        .where('numeroCliente', '==', numeroCliente)
        .where('estado', '==', 'pendiente')
        .limit(2)
        .get();
    if (ordenesSnapshot.size > 1) {
        throw new Error('Existen varias órdenes pendientes para el mismo cliente');
    }
    if (ordenesSnapshot.empty)
        return null;
    const ordenDoc = ordenesSnapshot.docs[0];
    return {
        ...ordenDoc.data(),
        id: ordenDoc.id,
    };
}
/**
 * Genera resumen de orden para mostrar al usuario
 */
async function generarResumenOrden(items) {
    try {
        const normalized = normalizePendingItems(items);
        if (normalized.length === items.length && normalized.length > 0) {
            return buildOrderSummary(normalized);
        }
        // Compatibilidad temporal: las órdenes previas guardaban posiciones del menú.
        const legacyItems = [];
        for (const raw of items) {
            const numero = Number(raw?.productoId);
            const cantidad = Number(raw?.cantidad);
            if (!Number.isInteger(numero) || !Number.isInteger(cantidad) || cantidad < 1)
                continue;
            const producto = await (0, menuGenerationService_1.obtenerProductoPorNumero)(numero);
            if (!producto || !producto.id || !producto.nombre || !producto.precio)
                continue;
            legacyItems.push({
                productoId: producto.id,
                catalogoTipo: producto.categoria === 'combo' ? 'combo' : 'producto',
                nombreSnapshot: producto.nombre.slice(0, 120),
                precioSnapshot: producto.precio,
                cantidad,
                ...(producto.categoria && { categoria: producto.categoria }),
            });
        }
        if (legacyItems.length === 0)
            throw new Error('La orden no contiene items válidos');
        return buildOrderSummary(legacyItems);
    }
    catch (error) {
        console.error('Error generating order summary:', error);
        throw error;
    }
}
/**
 * Convierte orden pendiente a venta registrada
 */
async function confirmarOrden(ordenPendienteId, numeroCliente, direccion, barrio, contenidoMensaje, operationContext) {
    validatePhone(numeroCliente);
    validateOperationContext(operationContext);
    const negocioId = getConfiguredTenantId();
    const direccionNormalizada = direccion.trim().replace(/\s+/g, ' ');
    const barrioNormalizado = barrio.trim().replace(/\s+/g, ' ');
    if (direccionNormalizada.length < 5 || direccionNormalizada.length > 200) {
        return { accion: 'direccion_invalida', respuesta: 'La dirección debe tener entre 5 y 200 caracteres.' };
    }
    if (barrioNormalizado.length < 2 || barrioNormalizado.length > 100) {
        return { accion: 'direccion_invalida', respuesta: 'El barrio debe tener entre 2 y 100 caracteres.' };
    }
    const pendingRef = getDb().collection('ordenes_pendientes').doc(ordenPendienteId);
    const pointerRef = activeOrderRef(negocioId, numeroCliente);
    const domicilioRef = operationContext
        ? getDb().collection('domicilios').doc(`wa_${deterministicDocumentId(negocioId, operationContext.queueId)}`)
        : getDb().collection('domicilios').doc();
    const codigo = `LP-WA-${domicilioRef.id.slice(-8).toUpperCase()}`;
    return getDb().runTransaction(async (transaction) => {
        const operation = await readQueueOperation(transaction, negocioId, numeroCliente, contenidoMensaje, operationContext);
        if (operation?.result)
            return operation.result;
        const [currentSnapshot, pointerSnapshot] = await Promise.all([
            transaction.get(pendingRef),
            transaction.get(pointerRef),
        ]);
        const current = currentSnapshot.data();
        const pointer = pointerSnapshot.data();
        if (!currentSnapshot.exists
            || current?.negocioId !== negocioId
            || current?.numeroCliente !== numeroCliente
            || current?.estado !== 'pendiente') {
            throw new Error('La orden cambió durante la confirmación');
        }
        if (pointerSnapshot.exists
            && (pointer?.negocioId !== negocioId
                || pointer?.numeroCliente !== numeroCliente
                || pointer?.ordenId !== ordenPendienteId)) {
            throw new Error('La orden activa cambió durante la confirmación');
        }
        if (current?.paso !== 'esperando_direccion') {
            throw new Error('La orden no está esperando dirección');
        }
        if (current?.metodoPago !== 'efectivo' && current?.metodoPago !== 'transferencia') {
            throw new Error('La orden no tiene un medio de pago offline válido');
        }
        const items = normalizePendingItems(current.items);
        if (items.length === 0) {
            throw new Error('La orden pendiente usa un formato inválido o heredado');
        }
        const catalogRefs = items.map((item) => getDb()
            .collection(item.catalogoTipo === 'combo' ? 'combos' : 'productos')
            .doc(item.productoId));
        const catalogSnapshots = await Promise.all(catalogRefs.map((ref) => transaction.get(ref)));
        const itemsVenta = [];
        let totalOrden = 0;
        let catalogoValido = true;
        catalogSnapshots.forEach((snapshot, index) => {
            const selected = items[index];
            const catalog = snapshot.data();
            const precio = selected.catalogoTipo === 'combo'
                ? Number(catalog?.precioCombo)
                : Number(catalog?.precio);
            if (!snapshot.exists
                || catalog?.negocioId !== negocioId
                || catalog?.disponible === false
                || typeof catalog?.nombre !== 'string'
                || !catalog.nombre.trim()
                || !Number.isFinite(precio)
                || precio <= 0) {
                catalogoValido = false;
                return;
            }
            const subtotal = precio * selected.cantidad;
            totalOrden += subtotal;
            itemsVenta.push({
                id: snapshot.id,
                nombre: catalog.nombre.trim().slice(0, 120),
                precio,
                cantidad: selected.cantidad,
                subtotal,
                ...(typeof catalog.categoria === 'string' && catalog.categoria
                    ? { categoria: catalog.categoria.slice(0, 100) }
                    : selected.catalogoTipo === 'combo' ? { categoria: 'combo' } : {}),
            });
        });
        if (!catalogoValido || itemsVenta.length !== items.length || totalOrden <= 0) {
            const result = {
                accion: 'catalogo_actualizado',
                respuesta: 'Uno de los productos ya no está disponible. Escribe “menú” y arma la orden nuevamente.',
            };
            transaction.update(pendingRef, {
                paso: 'seleccionando',
                metodoPago: admin.firestore.FieldValue.delete(),
                actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            persistQueueResult(transaction, operation, result);
            return result;
        }
        const metodoPago = current.metodoPago;
        const baseResponse = `✅ Pedido ${codigo} confirmado por $${totalOrden.toLocaleString('es-CO')}. Pago offline: ${metodoPago}. Tiempo estimado: 30 minutos.`;
        const cierre = operationContext?.mensajeCierre?.trim();
        const result = {
            accion: 'orden_confirmada',
            respuesta: cierre ? `${baseResponse}\n\n${cierre}` : baseResponse,
        };
        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        transaction.create(domicilioRef, {
            negocioId,
            clienteNombre: 'Cliente WhatsApp',
            clienteTelefono: numeroCliente,
            direccion: direccionNormalizada,
            barrio: barrioNormalizado,
            items: itemsVenta,
            subtotal: totalOrden,
            costoDomicilio: 0,
            descuento: 0,
            total: totalOrden,
            metodoPago,
            tipoEntrega: 'domicilio',
            origen: 'whatsapp',
            estado: 'pendiente',
            codigoPublico: codigo,
            ordenWhatsappId: ordenPendienteId,
            creadoEn: timestamp,
            actualizadoEn: timestamp,
        });
        transaction.update(pendingRef, {
            estado: 'confirmada',
            paso: 'completada',
            domicilioId: domicilioRef.id,
            codigoPublico: codigo,
            total: totalOrden,
            direccion: direccionNormalizada,
            barrio: barrioNormalizado,
            confirmadoEn: timestamp,
            actualizadoEn: timestamp,
        });
        transaction.set(pointerRef, pointerPayload(negocioId, numeroCliente, ordenPendienteId, 'confirmada'), { merge: false });
        persistQueueResult(transaction, operation, result);
        return result;
    });
}
async function transitionPendingOrder(numeroCliente, contenidoMensaje, transition, operationContext) {
    validatePhone(numeroCliente);
    validateOperationContext(operationContext);
    const negocioId = getConfiguredTenantId();
    return getDb().runTransaction(async (transaction) => {
        const operation = await readQueueOperation(transaction, negocioId, numeroCliente, contenidoMensaje, operationContext);
        if (operation?.result)
            return operation.result;
        const active = await readActivePendingOrder(transaction, negocioId, numeroCliente);
        if (!active.orderRef || !active.orderData) {
            const result = {
                accion: 'sin_orden',
                respuesta: 'No tienes una orden pendiente. Escribe “menú” para comenzar.',
            };
            persistQueueResult(transaction, operation, result);
            return result;
        }
        const items = normalizePendingItems(active.orderData.items);
        if (items.length === 0) {
            throw new Error('La orden pendiente usa un formato inválido o heredado');
        }
        let result;
        let updates = {
            actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (transition === 'confirmar') {
            if (active.orderData.paso !== 'seleccionando'
                && active.orderData.paso !== 'esperando_metodo_pago') {
                result = {
                    accion: 'paso_invalido',
                    respuesta: 'La orden ya fue confirmada. Continúa con el medio offline o la dirección solicitada.',
                };
                persistQueueResult(transaction, operation, result);
                return result;
            }
            updates = {
                ...updates,
                paso: 'esperando_metodo_pago',
            };
            result = {
                accion: 'esperando_metodo_pago',
                respuesta: '¿Cómo pagarás al recibir el pedido? Responde “efectivo” o “transferencia”. Ambos medios se coordinan de forma offline.',
            };
        }
        else {
            if (active.orderData.paso !== 'esperando_metodo_pago') {
                result = {
                    accion: 'paso_invalido',
                    respuesta: 'Primero revisa tu orden y responde “confirmar”.',
                };
                persistQueueResult(transaction, operation, result);
                return result;
            }
            updates = {
                ...updates,
                metodoPago: transition,
                paso: 'esperando_direccion',
            };
            result = {
                accion: 'esperando_direccion',
                respuesta: 'Escribe tu dirección así: “dirección: Calle 10 # 20-30 | Barrio”. El pago se coordinará al recibir.',
            };
        }
        transaction.update(active.orderRef, updates);
        transaction.set(active.pointerRef, pointerPayload(negocioId, numeroCliente, active.orderRef.id, 'pendiente'), { merge: false });
        persistQueueResult(transaction, operation, result);
        return result;
    });
}
/**
 * Procesa mensaje recibido para generar acción
 */
async function procesarMensajePorBot(numeroCliente, contenidoMensaje, operationContext) {
    validatePhone(numeroCliente);
    validateOperationContext(operationContext);
    const negocioId = getConfiguredTenantId();
    const persisted = await loadPersistedQueueResult(negocioId, numeroCliente, contenidoMensaje, operationContext);
    if (persisted)
        return persisted;
    const comando = parsearComandoOrden(contenidoMensaje);
    // BÚSQUEDA
    if (comando.tipo === 'busqueda' && comando.busqueda) {
        if (comando.busqueda.length > 80) {
            return {
                accion: 'busqueda_invalida',
                respuesta: 'La búsqueda es demasiado larga. Usa máximo 80 caracteres.',
            };
        }
        const resultados = await (0, menuGenerationService_1.buscarProductoPorNombre)(comando.busqueda);
        if (resultados.length === 0) {
            return {
                accion: 'busqueda_no_encontrada',
                respuesta: `❌ No encontré productos con "${comando.busqueda}"`,
            };
        }
        let respuesta = `🔍 Resultados para "${comando.busqueda}":\n\n`;
        resultados.forEach((producto) => {
            const precio = (producto.precio || 0).toLocaleString('es-CO', {
                style: 'currency',
                currency: 'COP',
                minimumFractionDigits: 0,
            });
            respuesta += `• ${producto.nombre.slice(0, 120)} - ${precio}\n`;
        });
        respuesta += '\nEscribe “menú” para ver el número con el que puedes agregarlo.';
        return { accion: 'busqueda', respuesta: respuesta.slice(0, 4096) };
    }
    if (comando.tipo === 'confirmacion') {
        return transitionPendingOrder(numeroCliente, contenidoMensaje, 'confirmar', operationContext);
    }
    if (comando.tipo === 'metodo_pago' && comando.metodoPago) {
        return transitionPendingOrder(numeroCliente, contenidoMensaje, comando.metodoPago, operationContext);
    }
    if (comando.tipo === 'direccion' && comando.direccion && comando.barrio) {
        const direccionNormalizada = comando.direccion.trim().replace(/\s+/g, ' ');
        const barrioNormalizado = comando.barrio.trim().replace(/\s+/g, ' ');
        if (direccionNormalizada.length < 5
            || direccionNormalizada.length > 200
            || barrioNormalizado.length < 2
            || barrioNormalizado.length > 100) {
            return {
                accion: 'direccion_invalida',
                respuesta: 'Usa una dirección de 5 a 200 caracteres y un barrio de 2 a 100 caracteres.',
            };
        }
        const orden = await obtenerOrdenPendiente(numeroCliente);
        if (!orden) {
            return {
                accion: 'sin_orden',
                respuesta: 'No tienes una orden pendiente. Escribe “menú” para comenzar.',
            };
        }
        if (orden.paso !== 'esperando_direccion') {
            return {
                accion: 'paso_invalido',
                respuesta: 'Antes de indicar la dirección, confirma la orden y elige efectivo o transferencia.',
            };
        }
        return confirmarOrden(orden.id, numeroCliente, direccionNormalizada, barrioNormalizado, contenidoMensaje, operationContext);
    }
    // AGREGAR ITEMS A ORDEN
    if (comando.tipo === 'item' && comando.items.length > 0) {
        const resolvedItems = await (0, menuGenerationService_1.obtenerItemsMenuPorNumeros)(comando.items);
        if (resolvedItems.some((item) => item === null)) {
            return {
                accion: 'item_no_disponible',
                respuesta: 'Uno de los números no corresponde al menú disponible. Escribe “menú” e intenta de nuevo.',
            };
        }
        const itemsConCantidad = resolvedItems.map((item, index) => ({
            productoId: item.productoId,
            catalogoTipo: item.catalogoTipo,
            nombreSnapshot: item.nombre,
            precioSnapshot: item.precio,
            cantidad: comando.cantidades?.[index] || 1,
            ...(item.categoria && { categoria: item.categoria }),
        }));
        return (await crearOrdenPendiente(numeroCliente, itemsConCantidad, contenidoMensaje, operationContext)).result;
    }
    // MENÚ O COMANDO NO RECONOCIDO
    return {
        accion: 'comando_desconocido',
        respuesta: whatsappBotService_1.TEMPLATES_AUTO_RESPUESTA.ERROR_COMANDO,
    };
}
/**
 * Estadísticas de órdenes por WhatsApp
 */
async function obtenerEstadisticasOrdenes() {
    try {
        const negocioId = getConfiguredTenantId();
        const pendientes = await getDb()
            .collection('ordenes_pendientes')
            .where('negocioId', '==', negocioId)
            .where('estado', '==', 'pendiente')
            .get();
        const confirmadas = await getDb()
            .collection('ordenes_pendientes')
            .where('negocioId', '==', negocioId)
            .where('estado', '==', 'confirmada')
            .get();
        const pedidosWhatsapp = await getDb()
            .collection('domicilios')
            .where('negocioId', '==', negocioId)
            .where('origen', '==', 'whatsapp')
            .get();
        const montos = pedidosWhatsapp.docs.map((doc) => doc.data().total || 0);
        const montoPromedio = montos.length > 0 ? montos.reduce((a, b) => a + b) / montos.length : 0;
        const ultimaOrden = pedidosWhatsapp.docs.length > 0 ? pedidosWhatsapp.docs[0].id : undefined;
        return {
            ordenesPendientes: pendientes.size,
            ordenesConfirmadas: confirmadas.size,
            ventasTotales: pedidosWhatsapp.size,
            montoPromedio,
            ultimaOrden,
        };
    }
    catch (error) {
        console.error('Error getting order statistics:', error);
        return {
            ordenesPendientes: 0,
            ordenesConfirmadas: 0,
            ventasTotales: 0,
            montoPromedio: 0,
        };
    }
}
