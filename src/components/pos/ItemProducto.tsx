// src/components/pos/ItemProducto.tsx

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCOP } from '@/utils/formatCOP';
import { getProductColorClass } from '@/services/imageService';
import { getGourmetImage } from '@/utils/productImages';

interface ItemProductoProps {
  nombre: string;
  precio: number;
  descripcion?: string;
  disponible: boolean;
  esCombo?: boolean;
  imagenUrl?: string;
  onAgregar: () => void;
  disabled?: boolean;
}

export function ItemProducto({
  nombre,
  precio,
  descripcion,
  disponible,
  esCombo = false,
  imagenUrl,
  onAgregar,
  disabled = false,
}: ItemProductoProps) {
  const colorClass = getProductColorClass(nombre);
  // Tarjeta pequeña del POS: la variante de 480px basta y pesa un tercio.
  const resolvedImageUrl = getGourmetImage(nombre, imagenUrl, 480);
  
  return (
    <div
      data-admin-media="true"
      className={`min-h-56 rounded-2xl border border-neutral-700 p-4 flex flex-col h-full relative overflow-hidden group shadow-lg ${colorClass}`}
      style={resolvedImageUrl ? {
        backgroundImage: `url(${resolvedImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : undefined}
    >
      {/* Overlay oscuro para mejorar legibilidad */}
      {resolvedImageUrl && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />
      )}
      
      <div className="flex-1 relative z-10">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-neutral-50 text-sm flex-1">
            {nombre}
          </h3>
          {esCombo && (
            <span className="ml-2 text-xs font-bold text-gold-400 whitespace-nowrap">
              COMBO
            </span>
          )}
        </div>

        {descripcion && (
          <p className="text-xs text-neutral-300 mb-3 line-clamp-2">
            {descripcion}
          </p>
        )}

        <p className="text-lg font-bold text-gold-400">
          {formatCOP(precio)}
        </p>
      </div>

      <Button
        onClick={onAgregar}
        disabled={!disponible || disabled}
        aria-label={
          !disponible
            ? `${nombre} no disponible`
            : disabled
              ? `Agregar ${nombre} al ticket (cobro en proceso)`
              : `Agregar ${nombre} al ticket`
        }
        size="sm"
        variant={disponible ? 'primary' : 'secondary'}
        fullWidth
        className="mt-4 relative z-10"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span>{disponible ? (disabled ? 'Procesando cobro' : 'Agregar') : 'No disponible'}</span>
      </Button>
    </div>
  );
}
