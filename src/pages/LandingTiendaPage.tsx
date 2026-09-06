// src/pages/LandingTiendaPage.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  User,
  LogOut,
  MapPin,
  Flame,
  Search,
  Clock,
  Truck,
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed,
  ArrowRight,
  ShieldCheck,
  Send,
  Banknote,
  Phone,
  Sun,
  Moon,
  Receipt,
} from 'lucide-react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '@/services/firebase';
import { getProductos, getCombos } from '@/services/productosService';
import { Producto, Combo, ItemVenta, Jornada, MetodoPago } from '@/types';
import { DEFAULT_NEGOCIO_ID } from '@/types/negocio';
import { createPublicOrder } from '@/services/publicOrderService';
import { formatCOP } from '@/utils/formatCOP';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createToast } from '@/components/ui/Toast';
import { usePublicCategorias } from '@/hooks/usePublicCategorias';
import { MenuItemQuantityControl } from '@/components/storefront/MenuItemQuantityControl';
import { StorefrontDialog } from '@/components/storefront/StorefrontDialog';
import {
  filtrarCombosMenu,
  filtrarProductosMenu,
  normalizarTextoMenu,
} from '@/utils/storefrontFilters';
import { parseCashAmountCOP } from '@/utils/storefrontCheckout';
import {
  getStorefrontCartLimitReason,
  type StorefrontCartLimitReason,
} from '@/utils/storefrontCartLimits';
import { GOURMET_CARD_SIZES, getGourmetImage, getGourmetImageSrcSet } from '@/utils/productImages';

// React 18 no reconoce `fetchPriority`; el atributo en minúsculas llega al DOM sin advertencias.
const HERO_IMAGE_PRIORITY = { fetchpriority: 'high' } as object;

// Determina el tipo de plato y estilo para placeholders gastronómicos elegantes
function getCategoryTag(nombre: string): { label: string; tagColor: string } {
  const n = nombre.toLowerCase();
  if (n.includes('hamburguesa') || n.includes('burger')) return { label: 'Burgers', tagColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
  if (n.includes('perro') || n.includes('hot dog')) return { label: 'Perros', tagColor: 'bg-red-500/20 text-red-300 border-red-500/30' };
  if (n.includes('salchipapa')) return { label: 'Salchipapas', tagColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' };
  if (n.includes('tequeño')) return { label: 'Entradas', tagColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30' };
  if (n.includes('arepa') || n.includes('caldo') || n.includes('desayuno')) return { label: 'Tradicional', tagColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
  if (n.includes('jugo') || n.includes('gaseosa') || n.includes('bebida') || n.includes('coca')) return { label: 'Bebidas', tagColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30' };
  return { label: 'Especialidad', tagColor: 'bg-neutral-800 text-neutral-300 border-neutral-700' };
}

function getCartLimitMessage(reason: StorefrontCartLimitReason): string {
  if (reason === 'max-per-item') return 'Puedes pedir máximo 20 unidades de cada producto.';
  if (reason === 'max-distinct-items') return 'Puedes incluir máximo 20 productos distintos.';
  return 'El pedido puede tener máximo 50 unidades en total.';
}

export function LandingTiendaPage() {
  const categoriasDB = usePublicCategorias();
  // Estados de Catálogo
  const [jornada, setJornada] = useState<Jornada>('noche');
  const [categoriaActiva, setCategoriaActiva] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [jornadaPendiente, setJornadaPendiente] = useState<Jornada | null>(null);

  // Estados del Carrito
  const [carrito, setCarrito] = useState<ItemVenta[]>([]);
  const [carritoAbierto, setCarritoAbierto] = useState(false);

  // Estados de Auth Cliente (Firebase)
  const [clienteUser, setClienteUser] = useState<FirebaseUser | null>(null);
  const [modalAuthAbierto, setModalAuthAbierto] = useState(false);
  const [modoAuth, setModoAuth] = useState<'login' | 'registro'>('login');
  const [emailAuth, setEmailAuth] = useState('');
  const [passwordAuth, setPasswordAuth] = useState('');
  const [nombreAuth, setNombreAuth] = useState('');
  const [cargandoAuth, setCargandoAuth] = useState(false);
  const [errorAuth, setErrorAuth] = useState('');

  // Estados de Checkout
  const [modalCheckoutAbierto, setModalCheckoutAbierto] = useState(false);
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [direccionCliente, setDireccionCliente] = useState('');
  const [barrioCliente, setBarrioCliente] = useState('');
  const [notasCliente, setNotasCliente] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [pagaConCuanto, setPagaConCuanto] = useState('');
  const [cargandoPedido, setCargandoPedido] = useState(false);
  const pendingOrderRef = useRef<{ key: string; fingerprint: string } | null>(null);

  // Estado de Confirmación de Pedido
  const [pedidoExitoso, setPedidoExitoso] = useState<{ id: string; total: number } | null>(null);

  // Escuchar estado de autenticación del cliente
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setClienteUser(user);
      if (user?.displayName && !nombreCliente) {
        setNombreCliente(user.displayName);
      }
    });
    return () => unsubscribe();
  }, []);

  // Cargar menú según jornada
  useEffect(() => {
    let isCurrentRequest = true;

    const cargarMenu = async () => {
      setLoadingMenu(true);
      try {
        const [prodsData, combosData] = await Promise.all([
          getProductos(jornada, DEFAULT_NEGOCIO_ID),
          getCombos(jornada, DEFAULT_NEGOCIO_ID),
        ]);
        if (!isCurrentRequest) return;
        setProductos(prodsData.filter((p) => p.disponible !== false));
        setCombos(combosData.filter((c) => c.disponible !== false));
      } catch (error) {
        if (isCurrentRequest) console.error('Error cargando menú:', error);
      } finally {
        if (isCurrentRequest) setLoadingMenu(false);
      }
    };
    cargarMenu();

    return () => {
      isCurrentRequest = false;
    };
  }, [jornada]);

  const aplicarCambioJornada = (nuevaJornada: Jornada) => {
    if (nuevaJornada === jornada) return;

    setProductos([]);
    setCombos([]);
    setLoadingMenu(true);
    setJornada(nuevaJornada);
    setCategoriaActiva('todos');
    setBusqueda('');
    pendingOrderRef.current = null;
    setCarrito([]);
    setCarritoAbierto(false);
  };

  const cambiarJornada = (nuevaJornada: Jornada) => {
    if (nuevaJornada === jornada) return;
    if (carrito.length > 0) {
      setJornadaPendiente(nuevaJornada);
      return;
    }

    aplicarCambioJornada(nuevaJornada);
  };

  // Carrito helpers
  const agregarAlCarrito = (tipo: 'producto' | 'combo', item: Producto | Combo) => {
    const precio = tipo === 'producto' ? (item as Producto).precio : (item as Combo).precioEspecial;
    const limitReason = getStorefrontCartLimitReason(carrito, tipo, item.id);
    if (limitReason) {
      createToast(getCartLimitMessage(limitReason), 'info');
      return;
    }

    setCarrito((prev) => {
      if (getStorefrontCartLimitReason(prev, tipo, item.id)) return prev;
      const existe = prev.find((i) => i.tipo === tipo && i.referenciaId === item.id);
      if (existe) {
        return prev.map((i) =>
          i.tipo === tipo && i.referenciaId === item.id
            ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precioUnitario }
            : i
        );
      }
      return [
        ...prev,
        {
          tipo,
          referenciaId: item.id,
          nombre: item.nombre,
          cantidad: 1,
          precioUnitario: precio,
          subtotal: precio,
        },
      ];
    });
    createToast(`🛒 ${item.nombre} agregado al pedido`, 'success');
  };

  const modificarCantidadCarrito = (
    tipo: 'producto' | 'combo',
    referenciaId: string,
    delta: number
  ) => {
    if (delta > 0) {
      const limitReason = getStorefrontCartLimitReason(carrito, tipo, referenciaId);
      if (limitReason) {
        createToast(getCartLimitMessage(limitReason), 'info');
        return;
      }
    }

    setCarrito((prev) => {
      if (delta > 0 && getStorefrontCartLimitReason(prev, tipo, referenciaId)) return prev;

      return prev
        .map((item) => {
          if (item.tipo === tipo && item.referenciaId === referenciaId) {
            const nuevaCantidad = item.cantidad + delta;
            return nuevaCantidad > 0
              ? { ...item, cantidad: nuevaCantidad, subtotal: nuevaCantidad * item.precioUnitario }
              : null;
          }
          return item;
        })
        .filter(Boolean) as ItemVenta[];
    });
  };

  const eliminarDelCarrito = (tipo: 'producto' | 'combo', referenciaId: string) => {
    setCarrito((prev) =>
      prev.filter((item) => !(item.tipo === tipo && item.referenciaId === referenciaId))
    );
  };

  const totalCarrito = carrito.reduce((sum, item) => sum + item.subtotal, 0);
  const totalItemsCarrito = carrito.reduce((sum, item) => sum + item.cantidad, 0);

  // Extraer categorías únicas para la tienda pública
  const categoriasDisponibles = useMemo(() => {
    const list: Array<{ id: string; label: string; count?: number }> = [
      { id: 'todos', label: 'Todos', count: productos.length + combos.length },
    ];
    if (combos.length > 0) {
      list.push({ id: 'combos', label: 'Combos', count: combos.length });
    }
    const categoriasUnicas = new Map<string, string>();
    productos.forEach((p) => {
      if (p.categoria && p.categoria.trim()) {
        const label = p.categoria.trim();
        const id = normalizarTextoMenu(label);
        if (id && id !== 'todos' && id !== 'combos' && !categoriasUnicas.has(id)) {
          categoriasUnicas.set(id, label);
        }
      }
    });

    if (categoriasUnicas.size > 0) {
      categoriasUnicas.forEach((label, id) => {
        const count = productos.filter(
          (p) => normalizarTextoMenu(p.categoria || '') === id
        ).length;
        list.push({ id, label, count });
      });
    } else {
      list.push(
        { id: 'tequenos', label: 'Tequeños' },
        { id: 'pancerotis', label: 'Pancerotis' },
        { id: 'hamburguesas', label: 'Hamburguesas' },
        { id: 'perros', label: 'Perros calientes' },
        { id: 'salchipapas', label: 'Salchipapas' },
        { id: 'bebidas', label: 'Bebidas' },
        { id: 'otros', label: 'Otros' }
      );
    }

    return list;
  }, [productos, combos]);

  // Filtrado de productos según categoría y búsqueda
  const productosFiltrados = useMemo(() => {
    return filtrarProductosMenu(productos, categoriaActiva, busqueda);
  }, [productos, busqueda, categoriaActiva]);

  const combosFiltrados = useMemo(
    () => filtrarCombosMenu(combos, categoriaActiva, busqueda),
    [combos, categoriaActiva, busqueda]
  );

  // Lista de items destacados seleccionados por el administrador
  const itemsDestacados = useMemo(() => {
    const list: Array<{
      tipo: 'combo' | 'producto';
      item: Combo | Producto;
      id: string;
      nombre: string;
      descripcion: string;
      precio: number;
      precioOriginal?: number;
      imagenUrl?: string;
    }> = [];

    combos
      .filter((c) => c.destacado && c.disponible !== false)
      .forEach((c) => {
        list.push({
          tipo: 'combo',
          item: c,
          id: c.id,
          nombre: c.nombre,
          descripcion: c.descripcion || 'Combo especial preparado al instante.',
          precio: c.precioEspecial,
          precioOriginal: c.precioTotal,
          imagenUrl: getGourmetImage(c.nombre, c.imagenUrl),
        });
      });

    productos
      .filter((p) => p.destacado && p.disponible !== false)
      .forEach((p) => {
        list.push({
          tipo: 'producto',
          item: p,
          id: p.id,
          nombre: p.nombre,
          descripcion: p.descripcion || 'Plato artesanal con ingredientes frescos de la casa.',
          precio: p.precio,
          imagenUrl: getGourmetImage(p.nombre, p.imagenUrl),
        });
      });

    return list;
  }, [combos, productos]);

  const [destacadoIndex, setDestacadoIndex] = useState(0);

  useEffect(() => {
    if (itemsDestacados.length > 0 && destacadoIndex >= itemsDestacados.length) {
      setDestacadoIndex(0);
    }
  }, [itemsDestacados.length, destacadoIndex]);

  const itemActivoDestacado = itemsDestacados[destacadoIndex] || null;

  // Manejo de Auth
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAuth('');
    setCargandoAuth(true);

    try {
      if (!auth) throw new Error('Firebase Auth no disponible');

      if (modoAuth === 'registro') {
        await createUserWithEmailAndPassword(auth, emailAuth, passwordAuth);
        if (nombreAuth) {
          setNombreCliente(nombreAuth);
        }
        createToast('🎉 ¡Cuenta creada con éxito!', 'success');
      } else {
        await signInWithEmailAndPassword(auth, emailAuth, passwordAuth);
        createToast('✅ Sesión iniciada', 'success');
      }
      setModalAuthAbierto(false);
      setEmailAuth('');
      setPasswordAuth('');
      setNombreAuth('');
    } catch (err: any) {
      console.error('Error auth:', err);
      setErrorAuth(err.message || 'Error al procesar autenticación');
    } finally {
      setCargandoAuth(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorAuth('');
    setCargandoAuth(true);
    try {
      if (!auth) throw new Error('Firebase Auth no disponible');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user?.displayName) {
        setNombreCliente(result.user.displayName);
      }
      createToast(`🎉 ¡Bienvenido, ${result.user.displayName || 'Cliente'}!`, 'success');
      setModalAuthAbierto(false);
    } catch (err: any) {
      console.error('Error Google Sign-In:', err);
      if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorAuth(err.message || 'Error al iniciar sesión con Google');
      }
    } finally {
      setCargandoAuth(false);
    }
  };

  const handleCerrarSesion = async () => {
    if (auth) {
      await signOut(auth);
      createToast('Sesión cerrada', 'success');
    }
  };

  // Confirmar Pedido
  const handleConfirmarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (carrito.length === 0) return;

    if (!nombreCliente.trim() || !telefonoCliente.trim() || !direccionCliente.trim() || !barrioCliente.trim()) {
      createToast('Por favor completa todos los campos de entrega', 'error');
      return;
    }

    setCargandoPedido(true);
    try {
      const pagaCon = metodoPago === 'efectivo' ? parseCashAmountCOP(pagaConCuanto) : undefined;
      const orderData = {
        negocioId: DEFAULT_NEGOCIO_ID,
        items: carrito.map(({ tipo, referenciaId, cantidad }) => ({
          tipo,
          referenciaId,
          cantidad,
        })),
        clienteNombre: nombreCliente.trim(),
        clienteTelefono: telefonoCliente.trim(),
        direccion: direccionCliente.trim(),
        barrio: barrioCliente.trim(),
        ...(notasCliente.trim() && { notas: notasCliente.trim() }),
        metodoPago,
        jornada: jornada as Exclude<Jornada, 'ambas'>,
        ...(pagaCon ? { pagaCon } : {}),
      };
      const fingerprint = JSON.stringify(orderData);
      if (!pendingOrderRef.current || pendingOrderRef.current.fingerprint !== fingerprint) {
        pendingOrderRef.current = {
          key: crypto.randomUUID().replace(/-/g, ''),
          fingerprint,
        };
      }

      const result = await createPublicOrder({
        ...orderData,
        idempotencyKey: pendingOrderRef.current.key,
      });

      setPedidoExitoso({
        id: result.codigo,
        total: result.total,
      });

      pendingOrderRef.current = null;
      setCarrito([]);
      setModalCheckoutAbierto(false);
      setCarritoAbierto(false);
      createToast('Pedido recibido. Confirmaremos los detalles por WhatsApp.', 'success');
    } catch (error) {
      console.error('Error enviando pedido:', error);
      createToast(
        error instanceof Error ? error.message : 'No fue posible crear el pedido. Intenta de nuevo.',
        'error'
      );
    } finally {
      setCargandoPedido(false);
    }
  };

  return (
    <div className="min-h-screen bg-restaurant-theme text-neutral-100 font-sans selection:bg-amber-500 selection:text-black relative overflow-x-hidden">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {totalItemsCarrito} {totalItemsCarrito === 1 ? 'producto' : 'productos'} en el pedido,
        subtotal {formatCOP(totalCarrito)}.
      </p>
      {/* 0. Ticker de Estado del Local & Despachos */}
      <div className="border-b border-amber-500/20 bg-neutral-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 text-xs text-neutral-300 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-white">Pedidos en línea</span>
          <span className="text-neutral-500 hidden sm:inline">•</span>
          <span className="hidden text-neutral-400 sm:inline">
            Confirmamos disponibilidad y entrega al recibirlo
          </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-neutral-400">
          <span className="hidden md:flex items-center gap-1">
            <MapPin size={12} className="text-amber-400" />
            <span>Punto físico & Domicilios</span>
          </span>
          <a
            href="https://wa.me/573001234567?text=Hola%20La%20Parada,%20quiero%20hacer%20un%20pedido"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition-colors"
          >
            <Phone size={12} />
            <span>WhatsApp Directo</span>
          </a>
          </div>
        </div>
      </div>

      {/* 1. Header Principal */}
      <header className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          {/* Logo y Marca */}
          <Link to="/" className="flex items-center gap-3 group shrink-0">
            <img
              src="/logo-96.jpg"
              alt="La Parada"
              width="96"
              height="96"
              loading="eager"
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl border border-amber-500/40 object-cover shadow-lg group-hover:border-amber-400 transition-all"
            />
            <div className="hidden md:block">
              <span className="font-display font-black text-xl sm:text-2xl text-white tracking-wide uppercase leading-none block">
                La Parada
              </span>
              <span className="text-[10px] sm:text-xs text-amber-400 font-medium tracking-wider uppercase">
                Comida Rápida & Tradición
              </span>
            </div>
          </Link>

          {/* Selector de Turno + Auth + Carrito */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Selector Mañana / Noche */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-1 flex text-xs">
              <button
                type="button"
                id="menu-shift-morning"
                onClick={() => cambiarJornada('mañana')}
                aria-label="Ver menú de la mañana"
                aria-pressed={jornada === 'mañana'}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all ${
                  jornada === 'mañana'
                    ? 'bg-amber-500 text-neutral-950 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Sun size={14} aria-hidden="true" />
                <span className="hidden sm:inline">Mañana</span>
              </button>
              <button
                type="button"
                id="menu-shift-night"
                onClick={() => cambiarJornada('noche')}
                aria-label="Ver menú de la noche"
                aria-pressed={jornada === 'noche'}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all ${
                  jornada === 'noche'
                    ? 'bg-amber-500 text-neutral-950 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Moon size={14} aria-hidden="true" />
                <span className="hidden sm:inline">Noche</span>
              </button>
            </div>

            {/* Auth Button */}
            {clienteUser ? (
              <div className="flex items-center gap-2 bg-neutral-900 px-3 py-1.5 rounded-xl border border-neutral-800 text-xs">
                <span className="font-semibold text-neutral-200">
                  {clienteUser.displayName || clienteUser.email?.split('@')[0]}
                </span>
                <button
                  type="button"
                  onClick={handleCerrarSesion}
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                  className="text-neutral-400 hover:text-red-400 transition-colors"
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                id="storefront-auth-button"
                onClick={() => setModalAuthAbierto(true)}
                aria-label="Ingresar a tu cuenta"
                className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <User size={14} className="text-amber-400" />
                <span className="hidden sm:inline">Ingresar</span>
              </button>
            )}

            {/* Botón Carrito */}
            <button
              type="button"
              id="storefront-cart-button"
              onClick={() => setCarritoAbierto(true)}
              aria-label={`Ver pedido, ${totalItemsCarrito} productos`}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <ShoppingCart size={17} />
              <span className="hidden sm:inline">Ver Pedido</span>
              {totalItemsCarrito > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-neutral-950 text-amber-400 text-xs font-black">
                  {totalItemsCarrito}
                </span>
              )}
            </button>

            {/* Acceso Staff */}
            <Link
              to="/admin"
              aria-label="Acceso para personal y administración"
              className="inline-flex items-center text-xs font-semibold text-neutral-400 hover:text-amber-400 transition-colors border-l border-neutral-800 pl-2 sm:pl-3"
            >
              Staff
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero Gastronómico */}
      <section className="relative overflow-hidden border-b border-neutral-800/80 px-4 py-6 sm:px-6 sm:py-10 lg:px-8 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.12),rgba(11,10,9,0))]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 lg:grid-cols-12">
          {/* Columna Izquierda: Copy Directo y Búsqueda */}
          <div className="space-y-4 text-left lg:col-span-7">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold backdrop-blur-sm">
              <Flame size={14} className="text-amber-400" />
              <span className="sm:hidden">Hecho al momento</span>
              <span className="hidden sm:inline">
                {jornada === 'mañana'
                  ? 'Desayunos tradicionales, arepas rellenas y caldos caseros'
                  : 'Carne 100% de res a la parrilla, tocineta crujiente y pan brioche'}
              </span>
            </div>

            <h1 className="max-w-3xl font-display text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
              De la parrilla <span className="text-amber-400 drop-shadow-[0_2px_14px_rgba(245,158,11,0.3)]">a tu mesa.</span>
            </h1>

            <p className="max-w-2xl text-sm font-normal leading-relaxed text-neutral-300 sm:text-base">
              Elige tu antojo, ajusta la cantidad y envía el pedido directo a cocina.
            </p>

            {/* Badges de Confianza */}
            <div className="hidden flex-wrap justify-start gap-2.5 pt-1 text-xs text-neutral-300 sm:flex">
              <span className="flex items-center gap-1.5 bg-neutral-900/90 px-3.5 py-2 rounded-xl border border-neutral-800/90 shadow-sm">
                <Flame size={14} className="text-amber-400" /> Preparación al Instante
              </span>
              <span className="flex items-center gap-1.5 bg-neutral-900/90 px-3.5 py-2 rounded-xl border border-neutral-800/90 shadow-sm">
                <Truck size={14} className="text-emerald-400" /> Entrega coordinada
              </span>
              <span className="flex items-center gap-1.5 bg-neutral-900/90 px-3.5 py-2 rounded-xl border border-neutral-800/90 shadow-sm">
                <Banknote size={14} className="text-sky-400" /> Pago offline al coordinar el pedido
              </span>
            </div>
          </div>

          {/* Columna Derecha: Showcase del Plato / Combo Estrella */}
          {(loadingMenu || itemActivoDestacado) && (
            <div className="hidden justify-end lg:col-span-5 lg:flex">
              {itemActivoDestacado ? (
              <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-amber-500/30 bg-neutral-900/90 shadow-2xl transition-all duration-300 backdrop-blur-sm">
                {/* Imagen del Plato Estrella */}
                <div className="group relative h-48 overflow-hidden bg-neutral-950">
                  {itemActivoDestacado.imagenUrl ? (
                    <img
                      src={itemActivoDestacado.imagenUrl}
                      srcSet={getGourmetImageSrcSet(itemActivoDestacado.imagenUrl)}
                      sizes="384px"
                      alt={itemActivoDestacado.nombre}
                      width="384"
                      height="224"
                      loading="eager"
                      decoding="async"
                      {...HERO_IMAGE_PRIORITY}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-neutral-900 to-neutral-950 p-6 text-center">
                      <UtensilsCrossed size={48} className="text-amber-400/50 mb-2" />
                      <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">
                        Especialidad de la Casa
                      </span>
                    </div>
                  )}

                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-neutral-950 font-black text-xs shadow-md">
                      RECOMENDADO
                    </span>
                  </div>

                  {itemsDestacados.length > 1 && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/70 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setDestacadoIndex(
                            (prev) => (prev - 1 + itemsDestacados.length) % itemsDestacados.length
                          )
                        }
                        aria-label="Ver destacado anterior"
                        className="text-neutral-400 hover:text-white p-0.5"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="font-bold text-amber-400">
                        {destacadoIndex + 1}/{itemsDestacados.length}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDestacadoIndex((prev) => (prev + 1) % itemsDestacados.length)
                        }
                        aria-label="Ver siguiente destacado"
                        className="text-neutral-400 hover:text-white p-0.5"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Info del Plato */}
                <div className="space-y-2 p-4">
                  <div>
                    <h2 className="font-display text-lg font-black text-white">
                      {itemActivoDestacado.nombre}
                    </h2>
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                      {itemActivoDestacado.descripcion}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-neutral-800 pt-2">
                    <div>
                      {itemActivoDestacado.precioOriginal &&
                        itemActivoDestacado.precioOriginal > itemActivoDestacado.precio && (
                          <span className="text-[11px] text-neutral-400 line-through block">
                            {formatCOP(itemActivoDestacado.precioOriginal)}
                          </span>
                        )}
                      <span className="font-display text-xl font-black text-amber-400">
                        {formatCOP(itemActivoDestacado.precio)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        agregarAlCarrito(itemActivoDestacado.tipo, itemActivoDestacado.item)
                      }
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                    >
                      <Plus size={16} />
                      <span>Pedir Ahora</span>
                    </button>
                  </div>
                </div>
              </div>
              ) : (
                <div
                  className="h-[286px] w-full max-w-sm animate-pulse rounded-3xl border border-neutral-800 bg-neutral-900/60"
                  aria-hidden="true"
                />
              )}
            </div>
          )}
        </div>
      </section>

      {/* 3. Barra de Categorías Estilo Pills */}
      <section className="sticky top-16 z-30 border-b border-neutral-800/80 bg-neutral-950/95 px-4 py-2.5 text-white shadow-xl backdrop-blur-md sm:top-20 sm:px-6 sm:py-3.5 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:gap-3 md:flex-row md:items-center">
          <div className="relative w-full shrink-0 md:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
              size={17}
              aria-hidden="true"
            />
            <input
              id="menu-search"
              type="search"
              name="menu-search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar en el menú"
              placeholder="Buscar un plato o antojo..."
              className="h-11 w-full rounded-xl border border-neutral-800 bg-neutral-900/90 pl-10 pr-10 text-sm text-white shadow-inner placeholder:text-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/40 transition-colors"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
              >
                <X size={17} aria-hidden="true" />
              </button>
            )}
          </div>

          <div
            className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto py-1"
            role="group"
            aria-label="Filtrar el menú por categoría"
          >
            {categoriasDisponibles.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setCategoriaActiva(cat.id)}
                aria-pressed={categoriaActiva === cat.id}
                className={`flex min-h-11 min-w-max items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  categoriaActiva === cat.id
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 shadow-lg shadow-amber-500/20'
                    : 'border border-neutral-800/80 bg-neutral-900/80 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800 hover:text-white'
                }`}
              >
                <span>{cat.label}</span>
                {cat.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                      categoriaActiva === cat.id
                        ? 'bg-neutral-950 text-amber-400'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {cat.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <span className="hidden min-w-max text-xs font-medium text-neutral-400 xl:inline">
            Menú:{' '}
            <strong className="text-amber-400">
              {jornada === 'mañana' ? 'Mañana / Tarde' : 'Noche'}
            </strong>
          </span>
        </div>
      </section>

      {/* 4. Menú Principal de Productos y Combos */}
      <main id="menu" className="bg-[#0B0A09] text-white min-h-screen">
        <div className="mx-auto max-w-7xl space-y-10 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="min-w-0 space-y-10">
        {/* Combos Destacados */}
        {combosFiltrados.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame size={22} className="text-amber-400" />
                <h2 className="font-display text-xl sm:text-2xl font-black text-white">
                  Combos de la Casa
                </h2>
              </div>
              <span className="hidden text-xs text-neutral-400 sm:inline">
                Ahorra más pidiendo en combo
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {combosFiltrados.map((combo) => (
                <div
                  key={combo.id}
                  className="bg-neutral-900 rounded-3xl border border-neutral-800 hover:border-amber-500/50 p-5 shadow-lg transition-all duration-300 flex flex-col justify-between group"
                >
                  <div>
                    {/* Imagen o Placeholder del Combo */}
                    {combo.imagenUrl ? (
                      <div className="h-44 rounded-2xl overflow-hidden mb-4 bg-neutral-950">
                        <img
                          src={combo.imagenUrl}
                          srcSet={getGourmetImageSrcSet(combo.imagenUrl)}
                          sizes={GOURMET_CARD_SIZES}
                          alt={combo.nombre}
                          width="640"
                          height="352"
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ) : (
                      <div className="h-28 rounded-2xl bg-neutral-950 border border-neutral-800/80 flex items-center justify-center mb-4">
                        <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">
                          Combo Especial La Parada
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-bold text-base text-white group-hover:text-amber-400 transition-colors">
                        {combo.nombre}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                        COMBO
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-neutral-300 leading-relaxed line-clamp-2">
                      {combo.descripcion || 'Combinación perfecta de nuestros mejores platos.'}
                    </p>

                    {combo.items && combo.items.length > 0 && (
                      <div className="mt-3 p-3 bg-neutral-950 rounded-2xl border border-neutral-800 text-xs text-neutral-300 space-y-1">
                        {combo.items.map((it, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <CheckCircle2 size={13} className="text-amber-400 shrink-0" />
                            <span>
                              {it.cantidad}x {it.nombreSnapshot}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-3 border-t border-neutral-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">
                        Precio
                      </span>
                      <span className="text-xl font-black text-amber-400 font-display">
                        {formatCOP(combo.precioEspecial)}
                      </span>
                    </div>

                    <MenuItemQuantityControl
                      itemName={combo.nombre}
                      quantity={
                        carrito.find(
                          (item) => item.tipo === 'combo' && item.referenciaId === combo.id
                        )?.cantidad ?? 0
                      }
                      onDecrease={() => modificarCantidadCarrito('combo', combo.id, -1)}
                      onIncrease={() => agregarAlCarrito('combo', combo)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Platos Individuales */}
        {categoriaActiva !== 'combos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UtensilsCrossed size={20} className="text-amber-400" />
              <h2 className="font-display text-xl sm:text-2xl font-black text-white">
                Nuestro menú
              </h2>
            </div>
            <span className="hidden text-xs text-neutral-400 min-[360px]:inline">
              {productosFiltrados.length} opciones disponibles
            </span>
          </div>

          {loadingMenu ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-72 animate-pulse rounded-3xl border border-neutral-800 bg-neutral-900/60"
                />
              ))}
            </div>
          ) : productosFiltrados.length === 0 && combosFiltrados.length === 0 ? (
            <div className="space-y-3 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-12 text-center text-neutral-400">
              <Search size={32} className="mx-auto text-neutral-500" />
              <p className="text-sm font-semibold text-white">No encontramos platos con ese criterio</p>
              <p className="text-xs text-neutral-400">Prueba con otra palabra o selecciona otra categoría.</p>
            </div>
          ) : productosFiltrados.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {productosFiltrados.map((producto, index) => {
                const catTag = getCategoryTag(producto.nombre);
                // Las dos primeras tarjetas suelen estar en el primer viewport móvil.
                const imageLoading = index < 2 ? 'eager' : 'lazy';
                const imagenAMostrar =
                  getGourmetImage(producto.nombre, producto.imagenUrl) ||
                  categoriasDB.find(
                    (c) => c.nombre.toLowerCase().trim() === producto.categoria?.toLowerCase().trim()
                  )?.imagenUrl;

                return (
                  <div
                    key={producto.id}
                    className="group flex min-h-full flex-col justify-between overflow-hidden rounded-3xl border border-neutral-800/90 bg-neutral-900/80 p-4 shadow-xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/50 hover:bg-neutral-900 hover:shadow-[0_16px_40px_rgba(245,158,11,0.12)]"
                  >
                    <div>
                      {/* Imagen Real o Gourmet */}
                      {imagenAMostrar ? (
                        <div className="relative mb-4 h-48 overflow-hidden rounded-2xl bg-neutral-950">
                          <img
                            src={imagenAMostrar}
                            srcSet={getGourmetImageSrcSet(imagenAMostrar)}
                            sizes={GOURMET_CARD_SIZES}
                            alt={producto.nombre}
                            width="320"
                            height="288"
                            loading={imageLoading}
                            decoding="async"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                          />
                          {producto.destacado && (
                            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-amber-500 text-neutral-950 font-black text-[11px] shadow-lg tracking-wider">
                              RECOMENDADO
                            </span>
                          )}
                          <span
                            className={`absolute bottom-3 left-3 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-lg border font-bold backdrop-blur-md bg-black/60 ${catTag.tagColor}`}
                          >
                            {catTag.label}
                          </span>
                        </div>
                      ) : (
                        <div className="mb-4 flex h-36 flex-col items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-950 p-2 text-center">
                          <span
                            className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border font-bold ${catTag.tagColor}`}
                          >
                            {catTag.label}
                          </span>
                          <span className="text-[10px] text-neutral-500 mt-1 font-medium">
                            La Parada
                          </span>
                        </div>
                      )}

                      <h3 className="line-clamp-2 font-display text-lg font-black text-white transition-colors group-hover:text-amber-400">
                        {producto.nombre}
                      </h3>
                      {producto.descripcion && (
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-400">
                          {producto.descripcion}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-800/80 pt-3">
                      <span className="font-display text-xl font-black text-amber-400">
                        {formatCOP(producto.precio)}
                      </span>

                      <MenuItemQuantityControl
                        itemName={producto.nombre}
                        quantity={
                          carrito.find(
                            (item) =>
                              item.tipo === 'producto' && item.referenciaId === producto.id
                          )?.cantidad ?? 0
                        }
                        onDecrease={() =>
                          modificarCantidadCarrito('producto', producto.id, -1)
                        }
                        onIncrease={() => agregarAlCarrito('producto', producto)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        )}

        {categoriaActiva === 'combos' && !loadingMenu && combosFiltrados.length === 0 && (
          <div className="space-y-3 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-12 text-center text-neutral-400">
            <Search size={32} className="mx-auto text-neutral-500" />
            <p className="text-sm font-semibold text-white">
              No encontramos combos con ese criterio
            </p>
            <p className="text-xs text-neutral-400">Prueba con otra palabra o limpia la búsqueda.</p>
          </div>
        )}

            </div>

            <aside
              id="pedido-resumen"
              aria-label="Resumen del pedido"
              className="sticky top-[9.5rem] hidden overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/90 shadow-2xl backdrop-blur-sm xl:block"
            >
              <div className="flex items-start justify-between bg-neutral-950 border-b border-neutral-800 px-5 py-4 text-white">
                <div>
                  <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-400">
                    <Receipt size={16} aria-hidden="true" />
                    Pedido en curso
                  </p>
                  <h2 className="font-display text-xl font-black">Tu ticket</h2>
                </div>
                <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-black text-neutral-950">
                  {totalItemsCarrito}
                </span>
              </div>

              {carrito.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <ShoppingCart size={24} aria-hidden="true" />
                  </div>
                  <p className="font-display text-base font-black text-white">
                    Tu pedido empieza aquí
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                    Agrega un plato y podrás ajustar la cantidad sin salir del menú.
                  </p>
                </div>
              ) : (
                <>
                  <div className="max-h-[42vh] space-y-4 overflow-y-auto px-5 py-5">
                    {carrito.map((item) => (
                      <div
                        key={`${item.tipo}-${item.referenciaId}`}
                        className="border-b border-dashed border-neutral-800 pb-4 last:border-0 last:pb-0"
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">{item.nombre}</p>
                            <p className="mt-0.5 text-xs text-neutral-400">
                              {formatCOP(item.precioUnitario)} cada uno
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => eliminarDelCarrito(item.tipo, item.referenciaId)}
                            aria-label={`Eliminar ${item.nombre} del pedido`}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-800 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <MenuItemQuantityControl
                            itemName={item.nombre}
                            quantity={item.cantidad}
                            onDecrease={() =>
                              modificarCantidadCarrito(item.tipo, item.referenciaId, -1)
                            }
                            onIncrease={() =>
                              modificarCantidadCarrito(item.tipo, item.referenciaId, 1)
                            }
                          />
                          <span className="font-display text-base font-black text-amber-400">
                            {formatCOP(item.subtotal)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-neutral-800 bg-neutral-950/80 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
                          Total estimado
                        </span>
                        <p className="text-[11px] text-neutral-500">
                          Entrega coordinada al confirmar
                        </p>
                      </div>
                      <span className="font-display text-2xl font-black text-amber-400">
                        {formatCOP(totalCarrito)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setModalCheckoutAbierto(true)}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-black text-sm shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      <span>Continuar al despacho</span>
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </aside>
          </div>

        {/* 5. Sección de Confianza: Horarios, Cobertura y Métodos de Pago Reales */}
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/95 p-6 shadow-2xl sm:p-8">
          <div className="max-w-3xl mx-auto text-center space-y-2 mb-8">
            <h3 className="text-2xl sm:text-3xl font-display font-black text-white">
              Punto de Venta & Cobertura de Domicilios
            </h3>
            <p className="text-xs sm:text-sm text-neutral-400">
              Disfruta de la mejor comida rápida en nuestro punto físico o en la comodidad de tu casa.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Tarjeta 1: Horarios */}
            <div className="p-5 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Clock size={20} />
              </div>
              <h4 className="font-bold text-sm text-white">Horarios de Atención</h4>
              <ul className="text-xs text-neutral-300 space-y-1.5">
                <li className="flex justify-between">
                  <span className="text-neutral-400">Jornada Mañana:</span>
                  <span className="font-semibold text-white">7:00 AM – 1:00 PM</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-neutral-400">Jornada Noche:</span>
                  <span className="font-semibold text-white">6:00 PM – 11:30 PM</span>
                </li>
                <li className="text-[11px] text-emerald-400 pt-1">
                  Abierto de Lunes a Domingo
                </li>
              </ul>
            </div>

            {/* Tarjeta 2: Tiempos & Cobertura */}
            <div className="p-5 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Truck size={20} />
              </div>
              <h4 className="font-bold text-sm text-white">Tiempos & Entrega</h4>
              <ul className="text-xs text-neutral-300 space-y-1.5">
                <li className="flex justify-between">
                  <span className="text-neutral-400">Tiempo promedio:</span>
                  <span className="font-semibold text-emerald-400">25 a 35 minutos</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-neutral-400">Empaque:</span>
                  <span className="font-semibold text-white">Térmico & Sellado</span>
                </li>
                <li className="text-[11px] text-neutral-400 pt-1">
                  Cobertura en todo el perímetro urbano.
                </li>
              </ul>
            </div>

            {/* Tarjeta 3: Métodos de Pago */}
            <div className="p-5 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <ShieldCheck size={20} />
              </div>
              <h4 className="font-bold text-sm text-white">Medios de Pago</h4>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold">
                  Efectivo
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[11px] font-bold">
                  Transferencia manual
                </span>
              </div>
            </div>
          </div>
        </section>
        </div>
      </main>

      {/* 6. Barra Flotante de Carrito en Móvil */}
      {totalItemsCarrito > 0 &&
        !carritoAbierto &&
        !modalCheckoutAbierto &&
        !pedidoExitoso &&
        !modalAuthAbierto &&
        !jornadaPendiente && (
        <div
          className="fixed left-4 right-4 z-40 mx-auto max-w-md animate-in slide-in-from-bottom duration-300 xl:hidden"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setCarritoAbierto(true)}
            className="w-full p-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-sm flex items-center justify-between shadow-2xl shadow-amber-500/30 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-neutral-950 text-amber-400 text-xs font-black">
                {totalItemsCarrito}
              </span>
              <span>Ver mi pedido</span>
            </div>
            <div className="flex items-center gap-1 font-display font-black text-base">
              <span>{formatCOP(totalCarrito)}</span>
              <ArrowRight size={18} />
            </div>
          </button>
        </div>
      )}

      {/* 8. Drawer de Carrito */}
      {carritoAbierto && (
        <StorefrontDialog
          labelledBy="cart-title"
          onClose={() => setCarritoAbierto(false)}
          returnFocusSelector="#storefront-cart-button"
          className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm"
        >
          <div className="flex h-[100dvh] w-full max-w-md flex-col border-l border-neutral-800 bg-neutral-950 p-5 shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                    <ShoppingCart size={18} />
                  </div>
                  <div>
                    <h3 id="cart-title" className="font-bold text-white font-display text-base">Tu Pedido</h3>
                    <p className="text-xs text-neutral-400">
                      {totalItemsCarrito} {totalItemsCarrito === 1 ? 'producto seleccionado' : 'productos seleccionados'}
                    </p>
                    <p className="sr-only" aria-live="polite" aria-atomic="true">
                      Subtotal actual {formatCOP(totalCarrito)}.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCarritoAbierto(false)}
                  aria-label="Cerrar pedido"
                  className="grid h-11 w-11 place-items-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Lista */}
              <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                {carrito.length === 0 ? (
                  <div className="text-center py-16 text-neutral-500 text-xs space-y-2">
                    <ShoppingCart size={36} className="mx-auto text-neutral-600 mb-2" />
                    <p className="font-semibold text-white">Tu canasta está vacía</p>
                    <p className="text-neutral-400">Agrega tus platos favoritos del menú.</p>
                  </div>
                ) : (
                  carrito.map((item) => (
                    <div
                      key={`${item.tipo}-${item.referenciaId}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-xs text-white truncate">{item.nombre}</p>
                        <p className="text-[11px] text-amber-400 font-bold mt-0.5">
                          {formatCOP(item.precioUnitario)} c/u
                        </p>
                      </div>

                      <MenuItemQuantityControl
                        itemName={item.nombre}
                        quantity={item.cantidad}
                        onDecrease={() =>
                          modificarCantidadCarrito(item.tipo, item.referenciaId, -1)
                        }
                        onIncrease={() =>
                          modificarCantidadCarrito(item.tipo, item.referenciaId, 1)
                        }
                      />

                      <button
                        type="button"
                        onClick={() => eliminarDelCarrito(item.tipo, item.referenciaId)}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-neutral-400 hover:bg-red-950/40 hover:text-red-400"
                        title="Eliminar"
                        aria-label={`Eliminar ${item.nombre} del pedido`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Footer Carrito */}
            {carrito.length > 0 && (
              <div className="shrink-0 space-y-3 border-t border-neutral-800 pt-4">
                <div className="space-y-1.5 text-xs text-neutral-400 bg-neutral-900 p-3 rounded-2xl border border-neutral-800">
                  <div className="flex justify-between">
                    <span>Subtotal de productos:</span>
                    <span className="font-semibold text-white">{formatCOP(totalCarrito)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Entrega a domicilio:</span>
                    <span className="font-semibold text-emerald-400">Por confirmar</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-neutral-800">
                    <span>Subtotal estimado:</span>
                    <span className="text-amber-400 font-display text-lg">
                      {formatCOP(totalCarrito)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setCarritoAbierto(false);
                    setModalCheckoutAbierto(true);
                  }}
                  className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-sm flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all cursor-pointer"
                >
                  <span>Continuar con los Datos de Entrega</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        </StorefrontDialog>
      )}

      {jornadaPendiente && (
        <StorefrontDialog
          labelledBy="change-menu-title"
          onClose={() => setJornadaPendiente(null)}
          returnFocusSelector={
            jornadaPendiente === 'mañana' ? '#menu-shift-morning' : '#menu-shift-night'
          }
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm space-y-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-center shadow-2xl">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-400">
              {jornadaPendiente === 'mañana' ? (
                <Sun size={24} aria-hidden="true" />
              ) : (
                <Moon size={24} aria-hidden="true" />
              )}
            </div>
            <div className="space-y-2">
              <h2 id="change-menu-title" className="font-display text-xl font-black text-white">
                ¿Cambiar al menú de {jornadaPendiente === 'mañana' ? 'la mañana' : 'la noche'}?
              </h2>
              <p className="text-sm leading-relaxed text-neutral-300">
                Los productos cambian según el horario. Para evitar mezclar menús, vaciaremos tu
                pedido actual.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" variant="secondary" onClick={() => setJornadaPendiente(null)}>
                Conservar pedido
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  const nuevaJornada = jornadaPendiente;
                  setJornadaPendiente(null);
                  aplicarCambioJornada(nuevaJornada);
                  createToast('Pedido vacío. Ya puedes elegir productos del nuevo menú.', 'info');
                }}
                className="bg-amber-500 text-neutral-950 hover:bg-amber-400"
              >
                Vaciar y cambiar
              </Button>
            </div>
          </div>
        </StorefrontDialog>
      )}

      {/* 9. Modal de Checkout */}
      {modalCheckoutAbierto && (
        <StorefrontDialog
          labelledBy="checkout-title"
          onClose={() => setModalCheckoutAbierto(false)}
          returnFocusSelector="#storefront-cart-button"
          canClose={!cargandoPedido}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto overscroll-contain rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 id="checkout-title" className="font-bold text-white font-display text-base flex items-center gap-2">
                <MapPin size={18} className="text-amber-400" />
                Datos de Entrega
              </h3>
              <button
                type="button"
                onClick={() => setModalCheckoutAbierto(false)}
                disabled={cargandoPedido}
                aria-label="Cerrar datos de entrega"
                className="grid h-11 w-11 place-items-center rounded-xl text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmarPedido} aria-busy={cargandoPedido}>
              <fieldset disabled={cargandoPedido} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Tu Nombre Completo"
                  autoComplete="name"
                  value={nombreCliente}
                  onChange={(e) => setNombreCliente(e.target.value)}
                  placeholder="Ej: Laura Gómez"
                  required
                />
                <Input
                  label="Teléfono WhatsApp"
                  autoComplete="tel"
                  inputMode="tel"
                  value={telefonoCliente}
                  onChange={(e) => setTelefonoCliente(e.target.value)}
                  placeholder="Ej: 3001234567"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Dirección de Entrega"
                  autoComplete="street-address"
                  value={direccionCliente}
                  onChange={(e) => setDireccionCliente(e.target.value)}
                  placeholder="Ej: Calle 45 # 12-34"
                  required
                />
                <Input
                  label="Barrio"
                  autoComplete="address-level3"
                  value={barrioCliente}
                  onChange={(e) => setBarrioCliente(e.target.value)}
                  placeholder="Ej: Centro / Floresta"
                  required
                />
              </div>

              <Input
                label="Instrucciones para el domiciliario (Opcional)"
                value={notasCliente}
                onChange={(e) => setNotasCliente(e.target.value)}
                placeholder="Ej: Apto 302, timbre blanco, sin cebolla"
              />

              {/* Selector de Método de Pago */}
              <fieldset className="space-y-1.5 pt-2">
                <legend className="text-xs font-semibold text-neutral-300">
                  Método de Pago Preferido
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border p-2.5 text-xs font-semibold transition-all focus-within:ring-2 focus-within:ring-amber-300 ${
                      metodoPago === 'efectivo'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="metodo-pago"
                      value="efectivo"
                      checked={metodoPago === 'efectivo'}
                      onChange={() => setMetodoPago('efectivo')}
                      className="sr-only"
                    />
                    <Banknote size={16} aria-hidden="true" />
                    <span>Efectivo</span>
                  </label>

                  <label
                    className={`flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border p-2.5 text-xs font-semibold transition-all focus-within:ring-2 focus-within:ring-purple-300 ${
                      metodoPago === 'transferencia'
                        ? 'bg-purple-500/20 border-purple-400 text-purple-300 font-bold'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="metodo-pago"
                      value="transferencia"
                      checked={metodoPago === 'transferencia'}
                      onChange={() => setMetodoPago('transferencia')}
                      className="sr-only"
                    />
                    <Send size={16} aria-hidden="true" />
                    <span>Transferencia manual</span>
                  </label>

                </div>
              </fieldset>

              {metodoPago === 'efectivo' && (
                <Input
                  label="¿Con cuánto pagas? (valor completo en pesos)"
                  type="number"
                  inputMode="numeric"
                  min={totalCarrito}
                  value={pagaConCuanto}
                  onChange={(e) => setPagaConCuanto(e.target.value)}
                  placeholder="Ej: 50000"
                />
              )}

              {metodoPago === 'transferencia' && (
                <div className="p-3.5 bg-neutral-950 rounded-2xl border border-purple-500/30 text-xs space-y-1 text-neutral-300">
                  <p className="font-bold text-white flex items-center gap-1">
                    Transferencia coordinada manualmente
                  </p>
                  <p className="text-[11px] text-neutral-400 pt-1">
                    El negocio confirmará directamente los datos y el comprobante. La aplicación
                    no procesa el pago ni redirige a plataformas externas.
                  </p>
                </div>
              )}

              <div className="space-y-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-3.5 text-sm text-white">
                <div className="flex items-center justify-between font-bold">
                  <span>Subtotal de productos:</span>
                  <span className="font-display text-xl font-black text-amber-400">
                    {formatCOP(totalCarrito)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-neutral-800 pt-2 text-xs text-neutral-300">
                  <span>Entrega a domicilio:</span>
                  <span className="text-right font-semibold text-emerald-400">
                    Se confirma antes de despachar
                  </span>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-neutral-200">
                <input
                  type="checkbox"
                  required
                  className="mt-0.5 h-5 w-5 shrink-0 accent-amber-400"
                />
                <span>
                  Entiendo que el valor del domicilio se confirma por WhatsApp y se suma antes de
                  despachar el pedido.
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={cargandoPedido}
                  onClick={() => {
                    setModalCheckoutAbierto(false);
                    setCarritoAbierto(true);
                  }}
                  className="flex-1 text-xs"
                >
                  Volver
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={cargandoPedido}
                  disabled={cargandoPedido}
                  className="flex-1 text-xs font-bold bg-amber-500 text-neutral-950 hover:bg-amber-400"
                >
                  Enviar pedido
                </Button>
              </div>
              </fieldset>
            </form>
          </div>
        </StorefrontDialog>
      )}

      {/* 10. Modal de Pedido Exitoso */}
      {pedidoExitoso && (
        <StorefrontDialog
          labelledBy="success-title"
          onClose={() => setPedidoExitoso(null)}
          returnFocusSelector="#menu-search"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 size={36} />
            </div>
            <h3 id="success-title" className="text-2xl font-black font-display text-white">
              ¡Pedido recibido!
            </h3>
            <p className="text-xs text-neutral-300">
              <strong>La Parada</strong> recibió tu pedido. Te contactaremos para confirmar la
              disponibilidad y el valor del domicilio antes de despacharlo.
            </p>

            <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-1">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">
                Código de Orden
              </span>
              <span className="text-2xl font-black font-mono text-amber-400">
                {pedidoExitoso.id}
              </span>
              <p className="text-xs text-neutral-400 mt-1">
                Subtotal de productos: <strong>{formatCOP(pedidoExitoso.total)}</strong>
              </p>
            </div>

            <Button
              fullWidth
              variant="primary"
              onClick={() => setPedidoExitoso(null)}
              className="text-xs font-bold bg-amber-500 text-neutral-950 hover:bg-amber-400"
            >
              Hacer otro pedido
            </Button>
          </div>
        </StorefrontDialog>
      )}

      {/* 11. Modal de Auth */}
      {modalAuthAbierto && (
        <StorefrontDialog
          labelledBy="auth-title"
          onClose={() => setModalAuthAbierto(false)}
          returnFocusSelector="#storefront-auth-button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-4 overflow-y-auto overscroll-contain rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 id="auth-title" className="font-bold text-white font-display text-base flex items-center gap-2">
                <User size={18} className="text-amber-400" />
                {modoAuth === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
              </h3>
              <button
                type="button"
                onClick={() => setModalAuthAbierto(false)}
                aria-label="Cerrar acceso de cliente"
                className="grid h-11 w-11 place-items-center rounded-xl text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {modoAuth === 'registro' && (
                <Input
                  label="Nombre Completo"
                  value={nombreAuth}
                  onChange={(e) => setNombreAuth(e.target.value)}
                  placeholder="Tu nombre"
                  required
                />
              )}

              <Input
                label="Correo Electrónico"
                type="email"
                value={emailAuth}
                onChange={(e) => setEmailAuth(e.target.value)}
                placeholder="tu@email.com"
                required
              />

              <Input
                label="Contraseña"
                type="password"
                value={passwordAuth}
                onChange={(e) => setPasswordAuth(e.target.value)}
                placeholder="••••••••"
                required
              />

              {errorAuth && (
                <p className="text-xs text-red-400 p-2.5 bg-red-950/40 rounded-xl border border-red-900/50">
                  {errorAuth}
                </p>
              )}

              <Button
                type="submit"
                fullWidth
                variant="primary"
                loading={cargandoAuth}
                disabled={cargandoAuth}
                className="text-xs font-bold bg-amber-500 text-neutral-950 hover:bg-amber-400"
              >
                {modoAuth === 'login' ? 'Iniciar Sesión' : 'Registrarme'}
              </Button>
            </form>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-neutral-800"></div>
              <span className="flex-shrink mx-3 text-[11px] text-neutral-500 uppercase tracking-wider font-semibold">
                o también
              </span>
              <div className="flex-grow border-t border-neutral-800"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={cargandoAuth}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-semibold transition-all shadow-md active:scale-[0.99] cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continuar con Google</span>
            </button>

            <div className="text-center pt-2 border-t border-neutral-800">
              {modoAuth === 'login' ? (
                <p className="text-xs text-neutral-400">
                  ¿No tienes cuenta aún?{' '}
                  <button
                    onClick={() => setModoAuth('registro')}
                    className="text-amber-400 font-semibold hover:underline"
                  >
                    Crear una cuenta
                  </button>
                </p>
              ) : (
                <p className="text-xs text-neutral-400">
                  ¿Ya tienes cuenta?{' '}
                  <button
                    onClick={() => setModoAuth('login')}
                    className="text-amber-400 font-semibold hover:underline"
                  >
                    Iniciar sesión
                  </button>
                </p>
              )}
            </div>
          </div>
        </StorefrontDialog>
      )}

      {/* 12. Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-950 py-10 mt-16 text-center text-xs text-neutral-500 space-y-3">
        <div className="flex justify-center items-center gap-2.5">
          <img
            src="/logo-96.jpg"
            alt="La Parada"
            width="96"
            height="96"
            loading="lazy"
            decoding="async"
            className="w-7 h-7 rounded-full border border-amber-500/40 object-cover"
          />
          <span className="font-display font-black text-amber-400 text-sm">La Parada</span>
          <span>•</span>
          <span className="text-neutral-400">Sabores que te acompañan © 2026</span>
        </div>
        <p className="max-w-md mx-auto text-neutral-400 text-[11px]">
          Comida rápida artesanal & tradicional. Domicilios en toda la ciudad.
        </p>
      </footer>
    </div>
  );
}

export default LandingTiendaPage;
