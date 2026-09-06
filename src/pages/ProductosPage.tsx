import { useState, useMemo } from 'react';
import type { Producto, Combo } from '@/types';
import { useProductos } from '@/hooks/useProductos';
import {
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  crearCombo,
  actualizarCombo,
  eliminarCombo,
  toggleProductoDisponibilidad,
  toggleComboDisponibilidad,
  toggleProductoDestacado,
  toggleComboDestacado,
} from '@/services/productosService';
import { getProductColorClass } from '@/services/imageService';
import { getGourmetImage } from '@/utils/productImages';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductoForm, ComboForm } from '@/components/productos';
import { CategoriasModal } from '@/components/productos/CategoriasModal';
import { createToast } from '@/components/ui/Toast';
import { formatCOP } from '@/utils/formatCOP';
import {
  AlertCircle,
  Edit,
  Eye,
  EyeOff,
  Flame,
  Heart,
  Layers3,
  Package,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react';
import { useNegocio } from '@/context/NegocioContext';
import { useCategorias } from '@/hooks/useCategorias';

type TabType = 'productos' | 'combos';

export function ProductosPage() {
  const { negocioActual } = useNegocio();
  const { categorias: categoriasDB } = useCategorias();
  const [tab, setTab] = useState<TabType>('productos');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas');
  const [productoFormOpen, setProductoFormOpen] = useState(false);
  const [comboFormOpen, setComboFormOpen] = useState(false);
  const [categoriasModalOpen, setCategoriasModalOpen] = useState(false);
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null);
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  
  const { productos, combos: combosFiltered, loading, error, refresh } = useProductos();

  // Extraer categorías únicas disponibles (fusionando categoriasDB con las existentes en productos)
  const categoriasDisponibles = useMemo(() => {
    const list: Array<{ id: string; nombre: string; icono?: string }> = [];
    const setNombres = new Set<string>();

    // Primero las categorías configuradas en la base de datos
    categoriasDB.forEach((c) => {
      if (!setNombres.has(c.nombre.toLowerCase().trim())) {
        setNombres.add(c.nombre.toLowerCase().trim());
        list.push({ id: c.id, nombre: c.nombre, icono: c.icono });
      }
    });

    // Luego agregar cualquier categoría que tengan los productos pero no esté en categoriasDB
    productos.forEach((p) => {
      if (p.categoria && p.categoria.trim() && !setNombres.has(p.categoria.toLowerCase().trim())) {
        setNombres.add(p.categoria.toLowerCase().trim());
        list.push({ id: p.categoria.trim(), nombre: p.categoria.trim() });
      }
    });

    return list;
  }, [categoriasDB, productos]);

  // Filtrar productos según categoría seleccionada
  const productosMostrados = useMemo(() => {
    if (categoriaFiltro === 'todas') return productos;
    return productos.filter(
      (p) => p.categoria?.toLowerCase().trim() === categoriaFiltro.toLowerCase().trim()
    );
  }, [productos, categoriaFiltro]);

  // Handlers para productos
  const handleCrearProducto = async (data: Omit<Producto, 'id' | 'negocioId'>) => {
    try {
      await crearProducto({
        ...data,
        negocioId: negocioActual.id,
      });
      createToast({ title: 'Producto creado', type: 'success' });
      setProductoFormOpen(false);
      refresh();
    } catch {
      createToast({ title: 'Error al crear', type: 'error' });
    }
  };

  const handleEditarProducto = (producto: Producto) => {
    setEditingProducto(producto);
    setProductoFormOpen(true);
  };

  const handleActualizarProducto = async (data: Omit<Producto, 'id' | 'negocioId'>) => {
    if (!editingProducto) return;
    try {
      await actualizarProducto(editingProducto.id, data, negocioActual.id);
      createToast({ title: 'Producto actualizado', type: 'success' });
      setProductoFormOpen(false);
      setEditingProducto(null);
      refresh();
    } catch {
      createToast({ title: 'Error al actualizar', type: 'error' });
    }
  };

  const handleEliminarProducto = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar el producto "${nombre}"?`)) return;
    setLoadingId(id);
    try {
      await eliminarProducto(id, negocioActual.id);
      createToast({ title: 'Producto eliminado', type: 'success' });
      refresh();
    } catch (err) {
      console.error('Error eliminando producto:', err);
      createToast({ title: 'Error al eliminar el producto', type: 'error' });
    } finally {
      setLoadingId(null);
    }
  };

  const handleToggleProductoDisponibilidad = async (id: string, disponible: boolean) => {
    setLoadingId(id);
    try {
      await toggleProductoDisponibilidad(id, !disponible, negocioActual.id);
      createToast({
        title: !disponible ? 'Producto habilitado' : 'Producto deshabilitado',
        type: 'success',
      });
      refresh();
    } catch {
      createToast({ title: 'Error al actualizar', type: 'error' });
    } finally {
      setLoadingId(null);
    }
  };

  const handleToggleProductoDestacado = async (id: string, actual?: boolean) => {
    setLoadingId(id);
    try {
      const nuevo = !actual;
      await toggleProductoDestacado(id, nuevo, negocioActual.id);
      createToast({
        title: nuevo ? 'Marcado como destacado en tienda' : 'Retirado de destacados en tienda',
        type: 'success',
      });
      refresh();
    } catch {
      createToast({ title: 'Error al actualizar destacado', type: 'error' });
    } finally {
      setLoadingId(null);
    }
  };

  // Handlers para combos
  const handleCrearCombo = async (data: Omit<Combo, 'id' | 'negocioId'>) => {
    try {
      await crearCombo({
        ...data,
        negocioId: negocioActual.id,
      });
      createToast({ title: 'Combo creado', type: 'success' });
      setComboFormOpen(false);
      refresh();
    } catch {
      createToast({ title: 'Error al crear', type: 'error' });
    }
  };

  const handleEditarCombo = (combo: Combo) => {
    setEditingCombo(combo);
    setComboFormOpen(true);
  };

  const handleActualizarCombo = async (data: Omit<Combo, 'id' | 'negocioId'>) => {
    if (!editingCombo) return;
    try {
      await actualizarCombo(editingCombo.id, data, negocioActual.id);
      createToast({ title: 'Combo actualizado', type: 'success' });
      setComboFormOpen(false);
      setEditingCombo(null);
      refresh();
    } catch {
      createToast({ title: 'Error al actualizar', type: 'error' });
    }
  };

  const handleEliminarCombo = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar el combo "${nombre}"?`)) return;
    setLoadingId(id);
    try {
      await eliminarCombo(id, negocioActual.id);
      createToast({ title: 'Combo eliminado', type: 'success' });
      refresh();
    } catch (err) {
      console.error('Error eliminando combo:', err);
      createToast({ title: 'Error al eliminar el combo', type: 'error' });
    } finally {
      setLoadingId(null);
    }
  };

  const handleToggleComboDisponibilidad = async (id: string, disponible: boolean) => {
    setLoadingId(id);
    try {
      await toggleComboDisponibilidad(id, !disponible, negocioActual.id);
      createToast({
        title: !disponible ? 'Combo habilitado' : 'Combo deshabilitado',
        type: 'success',
      });
      refresh();
    } catch {
      createToast({ title: 'Error al actualizar', type: 'error' });
    } finally {
      setLoadingId(null);
    }
  };

  const handleToggleComboDestacado = async (id: string, actual?: boolean) => {
    setLoadingId(id);
    try {
      const nuevo = !actual;
      await toggleComboDestacado(id, nuevo, negocioActual.id);
      createToast({
        title: nuevo ? 'Marcado como destacado en tienda' : 'Retirado de destacados en tienda',
        type: 'success',
      });
      refresh();
    } catch {
      createToast({ title: 'Error al actualizar destacado', type: 'error' });
    } finally {
      setLoadingId(null);
    }
  };

  if (error && !loading) {
    return (
      <div className="min-h-screen bg-base-dark px-4 pb-28 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-900">
          <EmptyState
            icon={AlertCircle}
            title="No pudimos cargar el catálogo"
            description="No sustituimos el catálogo por una lista vacía. Comprueba la conexión y reintenta."
            action={{ label: 'Reintentar', onClick: refresh }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-dark pb-28 pt-6 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Productos y Combos</h1>
            <p className="mt-1 text-xs sm:text-sm text-neutral-400">Gestión de catálogo, disponibilidad y precios</p>
          </div>

          {/* Botones de acción: Primero Crear Producto/Combo, y al lado Categorías */}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                if (tab === 'productos') {
                  setEditingProducto(null);
                  setProductoFormOpen(true);
                } else {
                  setEditingCombo(null);
                  setComboFormOpen(true);
                }
              }}
              variant="primary"
              className="flex items-center gap-2 text-xs font-bold bg-amber-500 text-neutral-950 hover:bg-amber-400 shadow-md"
            >
              <Plus size={15} />
              <span>{tab === 'productos' ? 'Crear Producto' : 'Crear Combo'}</span>
            </Button>

            <Button
              onClick={() => setCategoriasModalOpen(true)}
              variant="secondary"
              className="flex items-center gap-1.5 text-xs font-semibold border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-white transition-all shadow-sm"
            >
              <Tag size={15} className="text-amber-400" />
              <span>Categorías</span>
            </Button>
          </div>
        </div>

        {/* Filtros y Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex gap-2" role="group" aria-label="Tipo de catálogo">
            <button
              type="button"
              onClick={() => setTab('productos')}
              aria-pressed={tab === 'productos'}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                tab === 'productos'
                  ? 'bg-gold-400/20 text-gold-400 border border-gold-400/40 shadow-sm'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <Package className="h-3.5 w-3.5" aria-hidden="true" /> Productos ({productos.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('combos')}
              aria-pressed={tab === 'combos'}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                tab === 'combos'
                  ? 'bg-gold-400/20 text-gold-400 border border-gold-400/40 shadow-sm'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <Layers3 className="h-3.5 w-3.5" aria-hidden="true" /> Combos ({combosFiltered.length})
            </button>
          </div>
        </div>

        {/* Barra de Filtro por Categorías */}
        {tab === 'productos' && categoriasDisponibles.length > 0 && (
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
            role="group"
            aria-label="Filtrar productos por categoría"
          >
            <button
              type="button"
              onClick={() => setCategoriaFiltro('todas')}
              aria-pressed={categoriaFiltro === 'todas'}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                categoriaFiltro === 'todas'
                  ? 'bg-amber-500 text-neutral-950 shadow-md'
                  : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white'
              }`}
            >
              <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Todas ({productos.length})</span>
            </button>

            {categoriasDisponibles.map((cat) => {
              const count = productos.filter(
                (p) => p.categoria?.toLowerCase().trim() === cat.nombre.toLowerCase().trim()
              ).length;
              const esActivo = categoriaFiltro.toLowerCase() === cat.nombre.toLowerCase();

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoriaFiltro(cat.nombre)}
                  aria-pressed={esActivo}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    esActivo
                      ? 'bg-amber-500 text-neutral-950 shadow-md'
                      : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white'
                  }`}
                >
                  {cat.icono ? (
                    <span aria-hidden="true">{cat.icono}</span>
                  ) : (
                    <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {cat.nombre} ({count})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Contenido */}
        {loading ? (
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : tab === 'productos' ? (
          // Productos
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {productosMostrados.length === 0 ? (
              <div className="col-span-full">
                <EmptyState icon={Package} title="Sin productos" description="No hay productos para este filtro de categoría" />
              </div>
            ) : (
              productosMostrados.map((producto) => {
                const colorClass = getProductColorClass(producto.nombre);
                const imagenAMostrar =
                  getGourmetImage(producto.nombre, producto.imagenUrl) ||
                  categoriasDB.find(
                    (c) => c.nombre.toLowerCase().trim() === producto.categoria?.toLowerCase().trim()
                  )?.imagenUrl;
                
                return (
                <div 
                  key={producto.id} 
                  data-admin-media="true"
                  className={`rounded-2xl border ${producto.destacado ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-neutral-700'} p-3 flex flex-col relative overflow-hidden group min-h-60 shadow-lg ${colorClass}`}
                  style={imagenAMostrar ? {
                    backgroundImage: `url(${imagenAMostrar})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  } : undefined}
                >
                  {/* Overlay oscuro para mejorar legibilidad */}
                  {imagenAMostrar && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />
                  )}

                  {/* Badge y Botón de Destacado / Favorito (Corazón) */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
                    {producto.destacado ? (
                      <span className="px-2 py-0.5 rounded-full bg-red-500/90 text-white text-[10px] font-black flex items-center gap-1 shadow-md">
                        <Flame className="h-3 w-3" aria-hidden="true" /> Destacado
                      </span>
                    ) : (
                      <span />
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleProductoDestacado(producto.id, producto.destacado);
                      }}
                      title={producto.destacado ? 'Quitar de destacados en tienda' : 'Marcar como destacado en tienda'}
                      aria-label={producto.destacado ? `Quitar ${producto.nombre} de destacados en tienda` : `Destacar ${producto.nombre} en tienda`}
                      className={`pointer-events-auto grid h-11 w-11 place-items-center rounded-full backdrop-blur-md transition-all shadow-md active:scale-90 cursor-pointer ${
                        producto.destacado
                          ? 'bg-red-500/30 border border-red-400/80 text-red-400 scale-110'
                          : 'bg-black/60 border border-white/20 text-neutral-400 hover:text-red-400 hover:scale-105'
                      }`}
                    >
                      <Heart
                        size={15}
                        className={producto.destacado ? 'fill-red-500 text-red-500' : ''}
                      />
                    </button>
                  </div>
                  
                  <div className="flex-1 relative z-10 flex flex-col justify-end mt-8">
                    {producto.categoria && (
                      <span className="text-[10px] font-bold text-amber-300 bg-neutral-950/80 border border-amber-500/30 px-2 py-0.5 rounded-md w-fit mb-1 backdrop-blur-xs">
                        <Tag className="mr-1 inline h-3 w-3" aria-hidden="true" /> {producto.categoria}
                      </span>
                    )}
                    <h3 className="text-sm font-semibold text-white line-clamp-2">{producto.nombre}</h3>
                    <p className="mt-1 text-xs text-neutral-300 line-clamp-2">{producto.descripcion}</p>
                    <div className="mt-2">
                      <span className="text-base font-bold text-gold">{formatCOP(producto.precio)}</span>
                    </div>
                  </div>

                  <div className="mt-2 relative z-10 flex flex-col gap-2">
                    <Badge 
                      variant={producto.disponible ? 'disponible' : 'no-disponible'}
                      className={`w-full text-center py-2 text-xs ${!producto.disponible ? 'line-through opacity-60' : ''}`}
                    >
                      Disponible
                    </Badge>
                    <div className="grid grid-cols-3 gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleToggleProductoDisponibilidad(producto.id, producto.disponible)}
                        loading={loadingId === producto.id}
                        disabled={loadingId === producto.id}
                      title={producto.disponible ? 'Ocultar' : 'Mostrar'}
                        aria-label={producto.disponible ? `Ocultar ${producto.nombre}` : `Mostrar ${producto.nombre}`}
                        className="h-11 w-full p-2"
                      >
                        {producto.disponible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleEditarProducto(producto)}
                        title="Editar"
                        aria-label={`Editar ${producto.nombre}`}
                        className="h-11 w-full p-2"
                      >
                        <Edit size={16} />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleEliminarProducto(producto.id, producto.nombre)}
                        loading={loadingId === producto.id}
                        disabled={loadingId === producto.id}
                        title="Eliminar"
                        aria-label={`Eliminar ${producto.nombre}`}
                        className="h-11 w-full p-2"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        ) : (
          // Combos
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {combosFiltered.length === 0 ? (
              <div className="col-span-full">
                <EmptyState icon={Package} title="Sin combos" description="Crea tu primer combo" />
              </div>
            ) : (
              combosFiltered.map((combo) => {
                const colorClass = getProductColorClass(combo.nombre);
                const comboImg = getGourmetImage(combo.nombre, combo.imagenUrl);
                
                return (
                <div
                  key={combo.id}
                  data-admin-media="true"
                  className={`rounded-2xl border ${combo.destacado ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-neutral-700'} p-3 flex flex-col relative overflow-hidden group min-h-60 shadow-lg ${colorClass}`}
                  style={comboImg ? {
                    backgroundImage: `url(${comboImg})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  } : undefined}
                >
                  {/* Overlay oscuro para mejorar legibilidad */}
                  {comboImg && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />
                  )}

                  {/* Badge y Botón de Destacado / Favorito (Corazón) */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
                    {combo.destacado ? (
                      <span className="px-2 py-0.5 rounded-full bg-red-500/90 text-white text-[10px] font-black flex items-center gap-1 shadow-md">
                        <Flame className="h-3 w-3" aria-hidden="true" /> Destacado
                      </span>
                    ) : (
                      <span />
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleComboDestacado(combo.id, combo.destacado);
                      }}
                      title={combo.destacado ? 'Quitar de destacados en tienda' : 'Marcar como destacado en tienda'}
                      aria-label={combo.destacado ? `Quitar ${combo.nombre} de destacados en tienda` : `Destacar ${combo.nombre} en tienda`}
                      className={`pointer-events-auto grid h-11 w-11 place-items-center rounded-full backdrop-blur-md transition-all shadow-md active:scale-90 cursor-pointer ${
                        combo.destacado
                          ? 'bg-red-500/30 border border-red-400/80 text-red-400 scale-110'
                          : 'bg-black/60 border border-white/20 text-neutral-400 hover:text-red-400 hover:scale-105'
                      }`}
                    >
                      <Heart
                        size={15}
                        className={combo.destacado ? 'fill-red-500 text-red-500' : ''}
                      />
                    </button>
                  </div>
                  
                  <div className="flex-1 relative z-10 flex flex-col justify-end mt-8">
                    <h3 className="text-sm font-semibold text-white line-clamp-2">{combo.nombre}</h3>
                    <p className="mt-1 text-xs text-neutral-300 line-clamp-1">{combo.descripcion}</p>
                    <p className="mt-1 text-xs text-neutral-400">{combo.items.length} items</p>
                    <div className="mt-2">
                      <span className="text-base font-bold text-gold">{formatCOP(combo.precioEspecial)}</span>
                    </div>
                  </div>

                  <div className="mt-2 relative z-10 flex flex-col gap-2">
                    <Badge 
                      variant={combo.disponible ? 'disponible' : 'no-disponible'}
                      className={`w-full text-center py-2 text-xs ${!combo.disponible ? 'line-through opacity-60' : ''}`}
                    >
                      Disponible
                    </Badge>
                    <div className="grid grid-cols-3 gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleToggleComboDisponibilidad(combo.id, combo.disponible)}
                        loading={loadingId === combo.id}
                        disabled={loadingId === combo.id}
                        title={combo.disponible ? 'Ocultar' : 'Mostrar'}
                        aria-label={combo.disponible ? `Ocultar ${combo.nombre}` : `Mostrar ${combo.nombre}`}
                        className="h-11 w-full p-2"
                      >
                        {combo.disponible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleEditarCombo(combo)}
                        title="Editar"
                        aria-label={`Editar ${combo.nombre}`}
                        className="h-11 w-full p-2"
                      >
                        <Edit size={16} />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleEliminarCombo(combo.id, combo.nombre)}
                        loading={loadingId === combo.id}
                        disabled={loadingId === combo.id}
                        title="Eliminar"
                        aria-label={`Eliminar ${combo.nombre}`}
                        className="h-11 w-full p-2"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Modales de formularios */}
      <ProductoForm
        isOpen={productoFormOpen}
        onClose={() => {
          setProductoFormOpen(false);
          setEditingProducto(null);
        }}
        onSubmit={editingProducto ? handleActualizarProducto : handleCrearProducto}
        initialData={editingProducto || undefined}
      />

      <ComboForm
        isOpen={comboFormOpen}
        onClose={() => {
          setComboFormOpen(false);
          setEditingCombo(null);
        }}
        onSubmit={editingCombo ? handleActualizarCombo : handleCrearCombo}
        initialData={editingCombo || undefined}
      />

      <CategoriasModal
        isOpen={categoriasModalOpen}
        onClose={() => setCategoriasModalOpen(false)}
      />
    </div>
  );
}
