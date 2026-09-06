import type { Firestore } from 'firebase-admin/firestore';
export declare const MAX_DISTINCT_ITEMS = 20;
export declare const MAX_TOTAL_ITEMS = 50;
export declare const MAX_QUANTITY_PER_ITEM = 20;
export declare const MAX_ORDER_TOTAL_COP = 20000000;
export declare const RATE_LIMIT_MAX_ORDERS = 10;
export declare const RATE_LIMIT_WINDOW_MS: number;
export type MetodoPagoOffline = 'efectivo' | 'transferencia';
export type TipoItemPedido = 'producto' | 'combo';
export interface PublicOrderItemInput {
    tipo: TipoItemPedido;
    referenciaId: string;
    cantidad: number;
}
export interface PublicOrderInput {
    negocioId: string;
    idempotencyKey: string;
    items: PublicOrderItemInput[];
    clienteNombre: string;
    clienteTelefono: string;
    direccion: string;
    barrio: string;
    notas?: string;
    metodoPago: MetodoPagoOffline;
    pagaCon?: number;
}
export interface CatalogItemData {
    nombre?: unknown;
    negocioId?: unknown;
    disponible?: unknown;
    precio?: unknown;
    precioEspecial?: unknown;
}
export interface CalculatedOrderItem {
    tipo: TipoItemPedido;
    referenciaId: string;
    nombre: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
}
export interface PublicOrderResult {
    codigo: string;
    total: number;
    reused: boolean;
}
export type PublicOrderErrorCode = 'invalid-argument' | 'failed-precondition' | 'not-found' | 'resource-exhausted';
export declare class PublicOrderError extends Error {
    readonly code: PublicOrderErrorCode;
    constructor(code: PublicOrderErrorCode, message: string);
}
export declare function parsePublicOrderInput(data: unknown): PublicOrderInput;
export declare function calculateOrderItems(input: PublicOrderInput, catalogByReference: ReadonlyMap<string, CatalogItemData>): {
    items: CalculatedOrderItem[];
    total: number;
};
export declare function createOrderFingerprint(input: PublicOrderInput): string;
export declare function createPublicClientKey(appId: string | undefined, ip: string | undefined): string;
export declare function createPublicOrderInFirestore(db: Firestore, input: PublicOrderInput, clientKey: string, context?: {
    authUid?: string;
    appId?: string;
    nowMs?: number;
}): Promise<PublicOrderResult>;
