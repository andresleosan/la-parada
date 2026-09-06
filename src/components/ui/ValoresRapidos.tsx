// src/components/ui/ValoresRapidos.tsx

import { Trash2 } from 'lucide-react';

export const VALORES_RAPIDOS_COP = [1000, 2000, 5000, 10000, 20000, 50000, 100000] as const;

interface ValoresRapidosProps {
  /** Monto actual como texto (el mismo estado del input numérico). */
  value: string;
  /** Recibe el nuevo monto como texto; '' al limpiar. */
  onChange: (value: string) => void;
  disabled?: boolean;
  etiqueta?: string;
  valores?: readonly number[];
  mostrarLimpiar?: boolean;
}

function formatoCorto(valor: number): string {
  return valor >= 1000 ? `${(valor / 1000).toFixed(0)}K` : String(valor);
}

/**
 * Botones de montos frecuentes en efectivo. Cada botón FIJA el monto (no se acumulan):
 * pulsar 5K y luego 2K deja 2000. El botón que coincide con el monto actual se resalta.
 */
export function ValoresRapidos({
  value,
  onChange,
  disabled = false,
  etiqueta = 'Valores rápidos (haz clic para fijar el monto):',
  valores = VALORES_RAPIDOS_COP,
  mostrarLimpiar = true,
}: ValoresRapidosProps) {
  const montoActual = Number(value) || 0;

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-neutral-400">{etiqueta}</p>
      <div className="grid grid-cols-4 gap-2">
        {valores.map((valor) => {
          const seleccionado = montoActual === valor;
          return (
            <button
              key={valor}
              type="button"
              onClick={() => onChange(valor.toString())}
              disabled={disabled}
              aria-pressed={seleccionado}
              className={`rounded px-2 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                seleccionado
                  ? 'bg-gold-500 text-neutral-950 hover:bg-gold-400'
                  : 'bg-neutral-700 text-neutral-50 hover:bg-neutral-600'
              }`}
            >
              {formatoCorto(valor)}
            </button>
          );
        })}
      </div>

      {mostrarLimpiar && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          disabled={disabled}
          className="w-full rounded bg-neutral-600 px-2 py-2 text-xs font-semibold text-neutral-50 transition-colors hover:bg-neutral-500 disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-1.5">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Limpiar monto
          </span>
        </button>
      )}
    </div>
  );
}
