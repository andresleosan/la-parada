// src/pages/POSPage.tsx
import { useRef, useState } from 'react';
import { Clock, ShoppingCart } from 'lucide-react';
import type { ItemVenta, MetodoPago, TipoEntrega } from '@/types';
import { useNegocio } from '@/context/NegocioContext';
import { useProductos } from '@/hooks/useProductos';
import { Catalogo } from '@/components/pos/Catalogo';
import { Carrito } from '@/components/pos/Carrito';
import { createToast } from '@/components/ui/Toast';
import { registrarVenta, uploadFotoTransferencia } from '@/services/ventasService';
import { crearDomicilioDesdePos } from '@/services/domiciliosService';
import {
  calcularSubtotal,
  incrementarItem,
  limpiarCarrito,
} from '@/utils/carritoUtils';
import { formatCOP } from '@/utils/formatCOP';
import { formatHora } from '@/utils/dateUtils';
import { useHoraActual } from '@/hooks/useHoraActual';

export function POSPage() {
  const { negocioActual } = useNegocio();
  const { productos, combos, loading } = useProductos();
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [registrando, setRegistrando] = useState(false);
  const checkoutLockRef = useRef(false);
  const ahora = useHoraActual();

  const handleAgregarProducto = (producto: typeof productos[0]) => {
    if (!producto.disponible || registrando) return;
    setItems((currentItems) =>
      incrementarItem(
        currentItems,
        'producto',
        producto.id,
        producto.nombre,
        producto.precio
      )
    );
    createToast(`${producto.nombre} agregado al carrito`, 'success', 2000);
  };

  const handleAgregarCombo = (combo: typeof combos[0]) => {
    if (!combo.disponible || registrando) return;
    setItems((currentItems) =>
      incrementarItem(
        currentItems,
        'combo',
        combo.id,
        combo.nombre,
        combo.precioEspecial
      )
    );
    createToast(`${combo.nombre} agregado al carrito`, 'success', 2000);
  };

  const handleRegistrarVenta = async (
    metodoPago: MetodoPago,
    tipoEntrega: TipoEntrega,
    _montoRecibido?: number,
    clienteNombre?: string,
    clienteApellido?: string,
    clienteTelefono?: string,
    direccion?: string,
    barrio?: string,
    fotoTransferencia?: File | null
  ) => {
    if (checkoutLockRef.current) return;
    if (items.length === 0) {
      createToast('El carrito está vacío', 'error');
      return;
    }
    checkoutLockRef.current = true;
    setRegistrando(true);

    try {
      const total = items.reduce((sum, item) => sum + item.subtotal, 0);
      if (tipoEntrega === 'domicilio') {
        // Crear domicilio
        await crearDomicilioDesdePos(
          negocioActual.id,
          items,
          total,
          metodoPago,
          clienteNombre || '',
          clienteApellido || '',
          clienteTelefono || '',
          direccion || '',
          barrio || ''
        );
        createToast('¡Domicilio registrado exitosamente!', 'success');
      } else {
        // Crear venta normal
        let fotoPath: string | undefined;
        if (metodoPago === 'transferencia' && fotoTransferencia) {
          fotoPath = await uploadFotoTransferencia(fotoTransferencia, negocioActual.id);
        }
        await registrarVenta(
          negocioActual.id,
          items,
          total,
          metodoPago,
          undefined,
          undefined,
          fotoPath,
          tipoEntrega
        );
        createToast(`¡Venta registrada a las ${formatHora(new Date())}!`, 'success');
      }
      
      setItems(limpiarCarrito());
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message : 'Error al registrar venta';
      createToast(mensaje, 'error');
    } finally {
      checkoutLockRef.current = false;
      setRegistrando(false);
    }
  };

  const totalTicket = calcularSubtotal(items);
  const cantidadTicket = items.reduce((sum, item) => sum + item.cantidad, 0);

  return (
    <div className="px-3 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-8">
      <div className="mx-auto mb-5 max-w-[1500px]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Venta rápida</p>
            <h1 className="font-display text-2xl font-black text-white sm:text-3xl">Punto de venta</h1>
            <p className="mt-1 text-sm text-neutral-400">Selecciona productos, revisa el ticket y cobra.</p>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-bold text-neutral-300">
            <Clock className="h-4 w-4 text-gold-400" aria-hidden="true" />
            <span>
              Se registrará a las{' '}
              <time dateTime={ahora.toISOString()} className="text-white">
                {formatHora(ahora)}
              </time>
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px]">
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_25rem] xl:grid-cols-[minmax(0,1fr)_27rem]">
          <div className="min-w-0">
            <Catalogo
              combos={combos}
              productos={productos}
              loading={loading}
              disabled={registrando}
              onAgregarProducto={handleAgregarProducto}
              onAgregarCombo={handleAgregarCombo}
            />
          </div>

          <aside
            id="pos-ticket"
            aria-label="Ticket de venta"
            className={`${items.length === 0 ? 'hidden lg:block' : 'block'} scroll-mt-24 lg:sticky lg:top-24 lg:h-fit`}
          >
            <Carrito
              items={items}
              onActualizarItems={setItems}
              onRegistrarVenta={handleRegistrarVenta}
              loading={registrando}
            />
          </aside>
        </div>
      </div>

      {items.length > 0 && (
        <a
          href="#pos-ticket"
          className="fixed bottom-[5.2rem] left-3 right-3 z-30 flex min-h-12 items-center justify-between rounded-xl bg-[#201f1b] px-4 text-sm font-bold text-[#fffdf8] shadow-2xl lg:hidden"
          aria-label={`Ver ticket con ${cantidadTicket} productos por ${formatCOP(totalTicket)}`}
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            Ver ticket · {cantidadTicket}
          </span>
          <span>{formatCOP(totalTicket)}</span>
        </a>
      )}
    </div>
  );
}
