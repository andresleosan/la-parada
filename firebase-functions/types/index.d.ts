/**
 * Tipos para Cloud Functions
 * Duplicados aquí para evitar dependencias circulares
 */
export type Timestamp = any;
/**
 * Producto en el menú
 */
export interface Producto {
    id?: string;
    negocioId: string;
    nombre: string;
    descripcion?: string;
    precio: number;
    categoria?: string;
    disponible?: boolean;
    imagen?: string;
    preparacionMinutos?: number;
}
/**
 * Combo de productos
 */
export interface Combo {
    id?: string;
    negocioId: string;
    nombre: string;
    descripcion?: string;
    precioCombo: number;
    precioIndividual?: number;
    items?: Array<{
        id: string;
        nombre: string;
    }>;
    disponible?: boolean;
}
/**
 * Item de una venta
 */
export interface ItemVenta {
    id: string;
    nombre: string;
    precio: number;
    cantidad: number;
    subtotal: number;
    categoria?: string;
}
/**
 * Venta
 */
export interface Venta {
    id?: string;
    negocioId: string;
    numeroCliente?: string;
    items: ItemVenta[];
    total: number;
    fecha?: Timestamp;
    origen: 'pos' | 'whatsapp' | 'phone' | 'domicilio';
    metodoPago: string;
    estado?: string;
    domicilio?: boolean;
}
/**
 * Domicilio (Entrega)
 */
export interface Domicilio {
    id?: string;
    negocioId: string;
    numeroCliente: string;
    telefonoCliente?: string;
    direccion: string;
    referencia?: string;
    monto: number;
    estado: 'confirmado' | 'en_preparacion' | 'listo' | 'en_camino' | 'entregado' | 'cancelado';
    domiciliarioId?: string;
    creadoEn?: Timestamp;
    entregadoEn?: Timestamp;
    horaEnCamino?: Timestamp;
}
/**
 * Usuario del sistema
 */
export interface Usuario {
    id?: string;
    nombre: string;
    email: string;
    telefono?: string;
    rol: 'admin' | 'domiciliario' | 'cliente';
    activo: boolean;
}
