import { Timestamp } from 'firebase/firestore';

export * from './negocio';

/**
 * Origen de la venta: punto físico (POS), WhatsApp o Tienda Web
 */
export type OrigenVenta = 'pos' | 'whatsapp' | 'web';

/**
 * Método de pago
 */
export type MetodoPago = 'efectivo' | 'transferencia';

/**
 * Forma en que el cliente recibe el pedido. No es un medio de pago.
 */
export type TipoEntrega = 'mostrador' | 'domicilio';

/**
 * Estados de un domicilio en su ciclo de vida
 */
export type EstadoDomicilio = 'pendiente' | 'en_preparacion' | 'en_camino' | 'entregado';

/**
 * Categoría de gasto (ordenado: gas, insumos, mantenimiento, otros, domiciliario, servicios, varios, salarios)
 */
export type CategoriaGasto = 'gas' | 'insumos' | 'mantenimiento' | 'otros' | 'domiciliario' | 'servicios' | 'varios' | 'salarios';

/**
 * Categoría de productos del menú
 */
export interface CategoriaProducto {
  id: string;
  nombre: string;
  icono?: string;
  imagenUrl?: string;       // Foto/Fondo compartido para todos los productos de esta categoría
  descripcion?: string;
  orden?: number;
  activo: boolean;
  negocioId: string;        // ID del negocio / tenant
  creadoEn?: Timestamp;
  actualizadoEn?: Timestamp;
}

/**
 * Producto individual del menú
 */
export interface Producto {
  id: string;
  nombre: string;
  descripcion: string;
  categoria?: string;       // Categoría (ej: Tequeños, Pancerotis, Hamburguesas, etc.)
  precio: number;           // En COP, valor entero
  disponible: boolean;
  destacado?: boolean;      // Marcado como favorito/destacado para la tienda
  imagenUrl?: string;
  negocioId: string;        // ID del negocio / tenant
  creadoEn: Timestamp;
  actualizadoEn: Timestamp;
}

/**
 * Item que forma parte de un combo
 */
export interface ComboItem {
  productoId: string;
  cantidad: number;
  nombreSnapshot: string;  // Nombre del producto al momento de crear el combo
}

/**
 * Combo o paquete promocional
 */
export interface Combo {
  id: string;
  nombre: string;
  categoria?: string;      // Categoría (ej: Combos, Promociones, etc.)
  precioTotal?: number;
  descripcion: string;
  items: ComboItem[];
  precioEspecial: number;  // En COP, valor entero
  disponible: boolean;
  destacado?: boolean;     // Marcado como favorito/destacado para la tienda
  imagenUrl?: string;
  negocioId: string;       // ID del negocio / tenant
  creadoEn: Timestamp;
  actualizadoEn: Timestamp;
}

/**
 * Item en una venta (puede ser producto o combo)
 */
export interface ItemVenta {
  tipo: 'producto' | 'combo';
  referenciaId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;  // En COP, valor entero
  subtotal: number;        // En COP, valor entero
}

/**
 * Venta registrada (POS o domicilio entregado)
 */
export interface Venta {
  id: string;
  items: ItemVenta[];
  total: number;           // En COP, valor entero
  metodoPago: MetodoPago;
  tipoEntrega?: TipoEntrega;
  origen: OrigenVenta;
  /** Fecha y hora exacta del cobro. Es la única fuente de la hora de la venta. */
  fecha: Timestamp;
  domicilioId?: string;    // Si fue entregado como domicilio
  direccion?: string;      // Dirección si es domicilio
  clienteTelefono?: string; // Teléfono del cliente si es domicilio
  fotoTransferenciaPath?: string; // Ruta privada en Storage para transferencias nuevas
  fotoTransferenciaUrl?: string; // Legado: migrar y retirar; no se abre desde la UI
  negocioId: string;       // ID del negocio / tenant
}

/**
 * Pedido a domicilio con seguimiento de estado
 */
export interface Domicilio {
  id: string;
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string;
  barrio: string;
  items: ItemVenta[];
  total: number;           // En COP, valor entero
  metodoPago: MetodoPago;
  origen: OrigenVenta;
  estado: EstadoDomicilio;
  domiciliarioId?: string;
  notas?: string;
  creadoEn: Timestamp;
  actualizadoEn: Timestamp;
  ventaId?: string;        // Se establece cuando se marca como entregado
  negocioId: string;       // ID del negocio / tenant
}

/**
 * Insumo en inventario
 */
export interface Insumo {
  id: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
  unidad: string;          // ej: kg, litro, unidad
  negocioId: string;       // ID del negocio / tenant
  creadoEn: Timestamp;
  actualizadoEn: Timestamp;
}

/**
 * Registro de entrada de insumo al inventario
 */
export interface EntradaInventario {
  id: string;
  insumoId: string;
  insumoNombre: string;
  cantidad: number;
  costo: number;           // En COP, valor entero
  proveedor: string;
  fecha: Timestamp;
  negocioId: string;       // ID del negocio / tenant
}

/**
 * Gasto registrado
 */
export interface Gasto {
  id: string;
  concepto: string;
  monto: number;           // En COP, valor entero
  categoria: CategoriaGasto;
  fecha: Timestamp;
  notas?: string;
  negocioId: string;       // ID del negocio / tenant
}

/**
 * Cierre de caja del día
 */
export interface CierreCaja {
  id: string;
  fecha: Timestamp;
  totalIngresos: number;   // En COP, valor entero
  totalGastos: number;     // En COP, valor entero
  utilidadNeta: number;    // En COP, valor entero
  ventasPos: number;       // En COP, valor entero
  ventasWhatsapp: number;  // En COP, valor entero
  negocioId: string;       // ID del negocio / tenant
}

/**
 * Caja de dinero en efectivo del día
 */
export interface Caja {
  id: string;
  fecha: Timestamp;
  montoInicial: number;    // En COP, valor entero
  ingresos: number;        // En COP, valor entero (ventas en efectivo)
  egresos: number;         // En COP, valor entero (gastos deducidos)
  saldoActual: number;     // En COP, valor entero (inicial + ingresos - egresos)
  negocioId: string;       // ID del negocio / tenant
}

/**
 * Configuración del bot WhatsApp
 */
export interface ConfiguracionBot {
  negocioId: string;
  activo: boolean;
  mensajeBienvenida: string;
  mensajeCierre: string;
  ultimaActualizacion: Timestamp;
}

/**
 * Mensaje WhatsApp mejorado
 */
export interface MensajeWhatsApp {
  id?: string;
  negocioId: string;
  telefono: string;
  tipo: 'entrada' | 'salida';
  contenido: string;
  mediaUrl?: string;
  estado: 'procesando' | 'enviado' | 'entregado' | 'leido' | 'fallido';
  referenciaMensajeWA?: string;
  referenciaWhatsapp?: string;
  creadoEn: Timestamp | Date;
  actualizadoEn?: Timestamp | Date;
  entregadoEn?: Timestamp | Date;
  leidoEn?: Timestamp | Date;
  falloEn?: Timestamp | Date;
  intentosFallidos?: number;
}
