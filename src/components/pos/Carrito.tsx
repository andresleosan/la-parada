// src/components/pos/Carrito.tsx
import { useId, useState } from 'react';
import type { ChangeEventHandler, Dispatch, SetStateAction } from 'react';
import { Camera, ShoppingCart, Trash2 } from 'lucide-react';
import type { ItemVenta, MetodoPago, TipoEntrega } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { ValoresRapidos } from '@/components/ui/ValoresRapidos';
import { ControladorCarrito } from './ControladorCarrito';
import { formatCOP } from '@/utils/formatCOP';
import {
  calcularSubtotal,
  calcularCambio,
  esMontoSuficiente,
  incrementarItem,
  decrementarItem,
  eliminarItem,
} from '@/utils/carritoUtils';

interface CarritoProps {
  items: ItemVenta[];
  onActualizarItems: Dispatch<SetStateAction<ItemVenta[]>>;
  onRegistrarVenta: (metodoPago: MetodoPago, tipoEntrega: TipoEntrega, montoRecibido?: number, clienteNombre?: string, clienteApellido?: string, clienteTelefono?: string, direccion?: string, barrio?: string, fotoTransferencia?: File | null) => Promise<void>;
  loading?: boolean;
  checkoutDisabledReason?: string;
}

interface ComprobanteTransferenciaFieldProps {
  disabled?: boolean;
  previewFoto: string;
  onFileChange: ChangeEventHandler<HTMLInputElement>;
  onClear: () => void;
}

export function ComprobanteTransferenciaField({
  disabled = false,
  previewFoto,
  onFileChange,
  onClear,
}: ComprobanteTransferenciaFieldProps) {
  const generatedId = useId();
  const inputId = `comprobante-${generatedId.replace(/:/g, '')}`;

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="flex items-center gap-2 text-sm font-medium text-neutral-700"
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
        Foto de transferencia
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        disabled={disabled}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-gold-400 focus:outline-none"
      />
      {previewFoto && (
        <div className="relative h-32 w-full overflow-hidden rounded-md bg-neutral-100">
          <img
            src={previewFoto}
            alt="Comprobante de transferencia seleccionado"
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-red-600 text-white shadow-lg transition-colors hover:bg-red-700 disabled:opacity-50"
            aria-label="Quitar comprobante de transferencia"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export function Carrito({
  items,
  onActualizarItems,
  onRegistrarVenta,
  loading = false,
  checkoutDisabledReason,
}: CarritoProps) {
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>('mostrador');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteApellido, setClienteApellido] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [barrio, setBarrio] = useState('');
  const [fotoTransferencia, setFotoTransferencia] = useState<File | null>(null);
  const [previewFoto, setPreviewFoto] = useState<string>('');
  const [error, setError] = useState('');

  const subtotal = calcularSubtotal(items);
  const cambio = metodoPago === 'efectivo' ? calcularCambio(subtotal, Number(montoRecibido) || 0) : 0;
  const montoInsuficiente =
    metodoPago === 'efectivo' && !esMontoSuficiente(subtotal, Number(montoRecibido) || 0, metodoPago);

  const handleRegistrarVenta = async () => {
    if (checkoutDisabledReason) {
      setError(checkoutDisabledReason);
      return;
    }

    if (items.length === 0) {
      setError('El carrito está vacío');
      return;
    }

    if (metodoPago === 'efectivo' && !montoRecibido) {
      setError('Ingresa el monto recibido');
      return;
    }

    if (montoInsuficiente) {
      setError('Monto insuficiente');
      return;
    }

    if (tipoEntrega === 'domicilio') {
      if (!clienteNombre) {
        setError('Ingresa el nombre del cliente');
        return;
      }
      if (!clienteApellido) {
        setError('Ingresa el apellido del cliente');
        return;
      }
      if (!clienteTelefono) {
        setError('Ingresa el teléfono del cliente');
        return;
      }
      if (!direccion) {
        setError('Ingresa la dirección de entrega');
        return;
      }
      if (!barrio) {
        setError('Ingresa el barrio');
        return;
      }
    }

    try {
      setError('');
      await onRegistrarVenta(
        metodoPago,
        tipoEntrega,
        Number(montoRecibido) || undefined,
        clienteNombre || undefined,
        clienteApellido || undefined,
        clienteTelefono || undefined,
        direccion || undefined,
        barrio || undefined,
        fotoTransferencia
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar venta');
    }
  };

  if (items.length === 0) {
    return (
      <Card className="rounded-2xl p-6 text-center">
        <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-neutral-500" aria-hidden="true" />
        <p className="text-sm font-bold text-white">Ticket vacío</p>
        <p className="mt-1 text-xs text-neutral-400">Agrega un producto para comenzar.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Cobro</p>
          <h2 className="text-lg font-bold text-white">Ticket actual</h2>
        </div>
        <span className="rounded-full bg-gold-400 px-2.5 py-1 text-xs font-black text-base-dark">
          {items.reduce((sum, item) => sum + item.cantidad, 0)} ítems
        </span>
      </div>

      {/* Items */}
      <div className="space-y-3 max-h-48 overflow-y-auto">
        {items.map((item) => (
          <div
            key={`${item.tipo}-${item.referenciaId}`}
            className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-800 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-neutral-50">{item.nombre}</p>
              <p className="text-xs text-neutral-400">
                {formatCOP(item.precioUnitario)} x {item.cantidad}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="text-sm font-bold text-gold-400 w-16 text-right">
                {formatCOP(item.subtotal)}
              </span>

              <ControladorCarrito
                cantidad={item.cantidad}
                nombreItem={item.nombre}
                disabled={loading}
                onIncrement={() =>
                  onActualizarItems((currentItems) =>
                    incrementarItem(
                      currentItems,
                      item.tipo,
                      item.referenciaId,
                      item.nombre,
                      item.precioUnitario
                    )
                  )
                }
                onDecrement={() =>
                  onActualizarItems((currentItems) =>
                    decrementarItem(currentItems, item.tipo, item.referenciaId)
                  )
                }
                onRemove={() =>
                  onActualizarItems((currentItems) =>
                    eliminarItem(currentItems, item.tipo, item.referenciaId)
                  )
                }
              />
            </div>
          </div>
        ))}
      </div>

      {/* Resumen */}
      <div className="border-t border-neutral-700 pt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-neutral-400">Subtotal:</span>
          <span className="text-neutral-50 font-semibold">{formatCOP(subtotal)}</span>
        </div>
        <div className="flex justify-between text-lg">
          <span className="font-semibold text-neutral-50">Total:</span>
          <span className="font-bold text-gold-400">{formatCOP(subtotal)}</span>
        </div>
      </div>

      <Select
        label="Tipo de Pedido"
        value={tipoEntrega}
        onChange={(e) => setTipoEntrega(e.target.value as TipoEntrega)}
        options={[
          { value: 'mostrador', label: 'Mostrador' },
          { value: 'domicilio', label: 'Domicilio' },
        ]}
        disabled={loading}
      />

      {/* Método de pago */}
      <Select
        label="Método de Pago"
        value={metodoPago}
        onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
        options={[
          { value: 'efectivo', label: 'Efectivo' },
          { value: 'transferencia', label: 'Transferencia manual' },
        ]}
        disabled={loading}
      />

      {/* Campos de domicilio */}
      {tipoEntrega === 'domicilio' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Nombre"
              type="text"
              placeholder="Ej: Juan"
              value={clienteNombre}
              onChange={(e) => setClienteNombre(e.target.value)}
              disabled={loading}
            />
            <Input
              label="Apellido"
              type="text"
              placeholder="Ej: Pérez"
              value={clienteApellido}
              onChange={(e) => setClienteApellido(e.target.value)}
              disabled={loading}
            />
          </div>
          <Input
            label="Teléfono"
            type="tel"
            placeholder="Ej: 3001234567"
            value={clienteTelefono}
            onChange={(e) => setClienteTelefono(e.target.value)}
            disabled={loading}
          />
          <Input
            label="Dirección de Entrega"
            type="text"
            placeholder="Ej: Cra 5 #12-34"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            disabled={loading}
          />
          <Input
            label="Barrio"
            type="text"
            placeholder="Ej: Centro"
            value={barrio}
            onChange={(e) => setBarrio(e.target.value)}
            disabled={loading}
          />
        </>
      )}

      {/* Campo de foto para transferencia */}
      {metodoPago === 'transferencia' && tipoEntrega === 'mostrador' && (
        <ComprobanteTransferenciaField
          previewFoto={previewFoto}
          disabled={loading}
          onFileChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setFotoTransferencia(file);
                const reader = new FileReader();
                reader.onloadend = () => {
                  setPreviewFoto(reader.result as string);
                };
                reader.readAsDataURL(file);
              }
          }}
          onClear={() => {
            setFotoTransferencia(null);
            setPreviewFoto('');
          }}
        />
      )}

      {/* Monto recibido (si efectivo) */}
      {metodoPago === 'efectivo' && (
        <>
          <Input
            label="Monto Recibido"
            type="number"
            min="0"
            placeholder="0"
            value={montoRecibido}
            onChange={(e) => setMontoRecibido(e.target.value)}
            disabled={loading}
          />

          {/* Valores rápidos: cada botón fija el monto recibido (no se acumulan) */}
          <ValoresRapidos value={montoRecibido} onChange={setMontoRecibido} disabled={loading} />

          {montoRecibido && (
            <div className="flex justify-between bg-neutral-800 p-3 rounded-lg">
              <span className="text-sm text-neutral-400">Cambio:</span>
              <span className="text-sm font-bold text-green-500">
                {formatCOP(cambio)}
              </span>
            </div>
          )}
        </>
      )}

      {/* Errores */}
      {error && (
        <div role="alert" className="rounded-lg bg-status-error/20 border border-status-error p-2">
          <p className="text-xs text-status-error">{error}</p>
        </div>
      )}

      {/* Botón registrar */}
      {checkoutDisabledReason && (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs font-medium text-amber-700">
          {checkoutDisabledReason}
        </p>
      )}

      {metodoPago === 'transferencia' && tipoEntrega === 'domicilio' && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-100 p-3 text-xs text-neutral-600">
          El domicilio guardará el método de pago. En este paso no se adjunta comprobante.
        </p>
      )}
      <Button
        onClick={handleRegistrarVenta}
        fullWidth
        loading={loading}
        disabled={loading || items.length === 0 || Boolean(checkoutDisabledReason)}
        size="lg"
      >
        {loading ? 'Registrando...' : 'Registrar Venta'}
      </Button>
    </Card>
  );
}
