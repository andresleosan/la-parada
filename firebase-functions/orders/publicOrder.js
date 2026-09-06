"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicOrderError = exports.RATE_LIMIT_WINDOW_MS = exports.RATE_LIMIT_MAX_ORDERS = exports.MAX_ORDER_TOTAL_COP = exports.MAX_QUANTITY_PER_ITEM = exports.MAX_TOTAL_ITEMS = exports.MAX_DISTINCT_ITEMS = void 0;
exports.parsePublicOrderInput = parsePublicOrderInput;
exports.calculateOrderItems = calculateOrderItems;
exports.createOrderFingerprint = createOrderFingerprint;
exports.createPublicClientKey = createPublicClientKey;
exports.createPublicOrderInFirestore = createPublicOrderInFirestore;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
exports.MAX_DISTINCT_ITEMS = 20;
exports.MAX_TOTAL_ITEMS = 50;
exports.MAX_QUANTITY_PER_ITEM = 20;
exports.MAX_ORDER_TOTAL_COP = 20000000;
exports.RATE_LIMIT_MAX_ORDERS = 10;
exports.RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_TENANT_ID = 'laparada';
const ALLOWED_ORDER_KEYS = new Set([
    'negocioId',
    'idempotencyKey',
    'items',
    'clienteNombre',
    'clienteTelefono',
    'direccion',
    'barrio',
    'notas',
    'metodoPago',
    'pagaCon',
]);
const ALLOWED_ITEM_KEYS = new Set(['tipo', 'referenciaId', 'cantidad']);
class PublicOrderError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'PublicOrderError';
    }
}
exports.PublicOrderError = PublicOrderError;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertOnlyKeys(value, allowed, label) {
    const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
    if (unknownKey) {
        throw new PublicOrderError('invalid-argument', `${label} contiene el campo no permitido ${unknownKey}`);
    }
}
function normalizeText(value, label, min, max) {
    if (typeof value !== 'string') {
        throw new PublicOrderError('invalid-argument', `${label} debe ser texto`);
    }
    const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (normalized.length < min || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
        throw new PublicOrderError('invalid-argument', `${label} no cumple el formato permitido`);
    }
    return normalized;
}
function normalizePhone(value) {
    if (typeof value !== 'string') {
        throw new PublicOrderError('invalid-argument', 'clienteTelefono debe ser texto');
    }
    const normalized = value.trim().replace(/[\s().-]/g, '');
    if (!/^\+?\d{10,15}$/.test(normalized)) {
        throw new PublicOrderError('invalid-argument', 'clienteTelefono no cumple el formato permitido');
    }
    return normalized;
}
function parsePublicOrderInput(data) {
    if (!isRecord(data)) {
        throw new PublicOrderError('invalid-argument', 'El pedido debe ser un objeto');
    }
    assertOnlyKeys(data, ALLOWED_ORDER_KEYS, 'El pedido');
    const negocioId = normalizeText(data.negocioId, 'negocioId', 2, 64).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(negocioId)) {
        throw new PublicOrderError('invalid-argument', 'negocioId no cumple el formato permitido');
    }
    const idempotencyKey = normalizeText(data.idempotencyKey, 'idempotencyKey', 16, 128);
    if (!/^[A-Za-z0-9_-]+$/.test(idempotencyKey)) {
        throw new PublicOrderError('invalid-argument', 'idempotencyKey no cumple el formato permitido');
    }
    if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > exports.MAX_DISTINCT_ITEMS) {
        throw new PublicOrderError('invalid-argument', `items debe contener entre 1 y ${exports.MAX_DISTINCT_ITEMS} referencias`);
    }
    const seen = new Set();
    let totalQuantity = 0;
    const items = data.items.map((rawItem, index) => {
        if (!isRecord(rawItem)) {
            throw new PublicOrderError('invalid-argument', `items[${index}] debe ser un objeto`);
        }
        assertOnlyKeys(rawItem, ALLOWED_ITEM_KEYS, `items[${index}]`);
        if (rawItem.tipo !== 'producto' && rawItem.tipo !== 'combo') {
            throw new PublicOrderError('invalid-argument', `items[${index}].tipo no es válido`);
        }
        const referenciaId = normalizeText(rawItem.referenciaId, `items[${index}].referenciaId`, 1, 128);
        if (!/^[A-Za-z0-9_-]+$/.test(referenciaId)) {
            throw new PublicOrderError('invalid-argument', `items[${index}].referenciaId no es válido`);
        }
        if (!Number.isInteger(rawItem.cantidad) || rawItem.cantidad < 1 || rawItem.cantidad > exports.MAX_QUANTITY_PER_ITEM) {
            throw new PublicOrderError('invalid-argument', `items[${index}].cantidad debe estar entre 1 y ${exports.MAX_QUANTITY_PER_ITEM}`);
        }
        const uniqueKey = `${rawItem.tipo}:${referenciaId}`;
        if (seen.has(uniqueKey)) {
            throw new PublicOrderError('invalid-argument', `La referencia ${uniqueKey} está duplicada`);
        }
        seen.add(uniqueKey);
        totalQuantity += rawItem.cantidad;
        return {
            tipo: rawItem.tipo,
            referenciaId,
            cantidad: rawItem.cantidad,
        };
    });
    if (totalQuantity > exports.MAX_TOTAL_ITEMS) {
        throw new PublicOrderError('invalid-argument', `El pedido supera ${exports.MAX_TOTAL_ITEMS} unidades`);
    }
    if (data.metodoPago !== 'efectivo' && data.metodoPago !== 'transferencia') {
        throw new PublicOrderError('invalid-argument', 'metodoPago debe ser offline');
    }
    let pagaCon;
    if (data.pagaCon !== undefined && data.pagaCon !== null) {
        if (data.metodoPago !== 'efectivo' || !Number.isSafeInteger(data.pagaCon) || data.pagaCon <= 0 || data.pagaCon > 50000000) {
            throw new PublicOrderError('invalid-argument', 'pagaCon solo admite un monto entero para efectivo');
        }
        pagaCon = data.pagaCon;
    }
    const notas = data.notas === undefined || data.notas === ''
        ? undefined
        : normalizeText(data.notas, 'notas', 1, 300);
    return {
        negocioId,
        idempotencyKey,
        items,
        clienteNombre: normalizeText(data.clienteNombre, 'clienteNombre', 2, 80),
        clienteTelefono: normalizePhone(data.clienteTelefono),
        direccion: normalizeText(data.direccion, 'direccion', 5, 180),
        barrio: normalizeText(data.barrio, 'barrio', 2, 80),
        ...(notas && { notas }),
        metodoPago: data.metodoPago,
        ...(pagaCon !== undefined && { pagaCon }),
    };
}
function calculateOrderItems(input, catalogByReference) {
    let total = 0;
    const items = input.items.map((requested) => {
        const key = `${requested.tipo}:${requested.referenciaId}`;
        const catalogItem = catalogByReference.get(key);
        if (!catalogItem) {
            throw new PublicOrderError('not-found', 'Uno o más productos ya no existen');
        }
        const belongsToTenant = input.negocioId === DEFAULT_TENANT_ID
            ? catalogItem.negocioId === undefined || catalogItem.negocioId === DEFAULT_TENANT_ID
            : catalogItem.negocioId === input.negocioId;
        if (!belongsToTenant) {
            throw new PublicOrderError('failed-precondition', 'El producto no pertenece al negocio solicitado');
        }
        if (catalogItem.disponible !== true) {
            throw new PublicOrderError('failed-precondition', 'Uno o más productos no están disponibles');
        }
        const rawPrice = requested.tipo === 'producto' ? catalogItem.precio : catalogItem.precioEspecial;
        if (!Number.isSafeInteger(rawPrice) || rawPrice <= 0) {
            throw new PublicOrderError('failed-precondition', 'El catálogo contiene un precio inválido');
        }
        const nombre = normalizeText(catalogItem.nombre, 'nombre de catálogo', 1, 120);
        const subtotal = rawPrice * requested.cantidad;
        if (!Number.isSafeInteger(subtotal)) {
            throw new PublicOrderError('failed-precondition', 'El subtotal calculado no es válido');
        }
        total += subtotal;
        return {
            tipo: requested.tipo,
            referenciaId: requested.referenciaId,
            nombre,
            cantidad: requested.cantidad,
            precioUnitario: rawPrice,
            subtotal,
        };
    });
    if (!Number.isSafeInteger(total) || total <= 0 || total > exports.MAX_ORDER_TOTAL_COP) {
        throw new PublicOrderError('failed-precondition', 'El total calculado está fuera del límite permitido');
    }
    if (input.pagaCon !== undefined && input.pagaCon < total) {
        throw new PublicOrderError('failed-precondition', 'El monto indicado para efectivo es menor al total');
    }
    return { items, total };
}
function hash(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
function createOrderFingerprint(input) {
    return hash(JSON.stringify(input));
}
function createPublicClientKey(appId, ip) {
    return hash(`${appId || 'sin-app'}:${ip || 'sin-ip'}`).slice(0, 40);
}
function resultFromIdempotency(data, fingerprint) {
    if (data.fingerprint !== fingerprint) {
        throw new PublicOrderError('failed-precondition', 'La clave de idempotencia ya fue usada con un pedido diferente');
    }
    if (typeof data.codigo !== 'string' || !Number.isSafeInteger(data.total)) {
        throw new PublicOrderError('failed-precondition', 'El registro idempotente existente no es válido');
    }
    return { codigo: data.codigo, total: data.total, reused: true };
}
async function createPublicOrderInFirestore(db, input, clientKey, context = {}) {
    const nowMs = context.nowMs ?? Date.now();
    const fingerprint = createOrderFingerprint(input);
    const idempotencyId = hash(`${input.negocioId}:${input.idempotencyKey}`);
    const idempotencyRef = db.collection('_idempotencia_pedidos_publicos').doc(idempotencyId);
    const existing = await idempotencyRef.get();
    if (existing.exists) {
        return resultFromIdempotency(existing.data() || {}, fingerprint);
    }
    const windowStart = Math.floor(nowMs / exports.RATE_LIMIT_WINDOW_MS) * exports.RATE_LIMIT_WINDOW_MS;
    const rateRef = db
        .collection('_limites_pedidos_publicos')
        .doc(`${clientKey}-${windowStart}`);
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(rateRef);
        const count = snapshot.exists && Number.isInteger(snapshot.data()?.count)
            ? snapshot.data().count
            : 0;
        if (count >= exports.RATE_LIMIT_MAX_ORDERS) {
            throw new PublicOrderError('resource-exhausted', 'Demasiados pedidos; intenta más tarde');
        }
        transaction.set(rateRef, {
            count: count + 1,
            ventanaIniciaEn: firestore_1.Timestamp.fromMillis(windowStart),
            expiraEn: firestore_1.Timestamp.fromMillis(windowStart + exports.RATE_LIMIT_WINDOW_MS * 2),
        });
    });
    return db.runTransaction(async (transaction) => {
        const idempotencySnapshot = await transaction.get(idempotencyRef);
        if (idempotencySnapshot.exists) {
            return resultFromIdempotency(idempotencySnapshot.data() || {}, fingerprint);
        }
        const tenantRef = db.collection('negocios').doc(input.negocioId);
        const tenantSnapshot = await transaction.get(tenantRef);
        if (input.negocioId !== DEFAULT_TENANT_ID && (!tenantSnapshot.exists || tenantSnapshot.data()?.estado !== 'activo')) {
            throw new PublicOrderError('failed-precondition', 'El negocio no está habilitado');
        }
        if (input.negocioId === DEFAULT_TENANT_ID && tenantSnapshot.exists && tenantSnapshot.data()?.estado !== 'activo') {
            throw new PublicOrderError('failed-precondition', 'El negocio no está habilitado');
        }
        const catalogRefs = input.items.map((item) => db.collection(item.tipo === 'producto' ? 'productos' : 'combos').doc(item.referenciaId));
        const catalogSnapshots = await Promise.all(catalogRefs.map((ref) => transaction.get(ref)));
        const catalog = new Map();
        catalogSnapshots.forEach((snapshot, index) => {
            if (snapshot.exists) {
                const requested = input.items[index];
                catalog.set(`${requested.tipo}:${requested.referenciaId}`, snapshot.data() || {});
            }
        });
        const calculated = calculateOrderItems(input, catalog);
        const orderRef = db.collection('domicilios').doc();
        const codigo = `LP-${orderRef.id.slice(-8).toUpperCase()}`;
        const timestamp = firestore_1.FieldValue.serverTimestamp();
        transaction.create(orderRef, {
            negocioId: input.negocioId,
            clienteNombre: input.clienteNombre,
            clienteTelefono: input.clienteTelefono,
            direccion: input.direccion,
            barrio: input.barrio,
            ...(input.notas && { notas: input.notas }),
            items: calculated.items,
            subtotal: calculated.total,
            costoDomicilio: 0,
            descuento: 0,
            total: calculated.total,
            metodoPago: input.metodoPago,
            tipoEntrega: 'domicilio',
            origen: 'web',
            estado: 'pendiente',
            ...(input.pagaCon !== undefined && { pagaCon: input.pagaCon }),
            ...(context.authUid && { clienteUid: context.authUid }),
            ...(context.appId && { appId: context.appId }),
            idempotencyHash: idempotencyId,
            codigoPublico: codigo,
            creadoEn: timestamp,
            actualizadoEn: timestamp,
        });
        transaction.create(idempotencyRef, {
            negocioId: input.negocioId,
            fingerprint,
            pedidoId: orderRef.id,
            codigo,
            total: calculated.total,
            creadoEn: timestamp,
        });
        return { codigo, total: calculated.total, reused: false };
    });
}
