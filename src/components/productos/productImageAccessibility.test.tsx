import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Combo, Producto } from '@/types';

vi.mock('@/context/NegocioContext', () => ({
  useNegocio: () => ({ negocioActual: { id: 'laparada' } }),
}));

vi.mock('@/hooks/useCategorias', () => ({
  useCategorias: () => ({ categorias: [] }),
}));

vi.mock('./FormModal', () => ({
  FormModal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('./ImageUploadModal', () => ({
  ImageUploadModal: () => null,
}));

import { ComboForm } from './ComboForm';
import { ProductoForm } from './ProductoForm';

describe('eliminación accesible de fotos del catálogo', () => {
  it('mantiene visible y nombra el control de quitar la foto de un producto', () => {
    const html = renderToStaticMarkup(
      <ProductoForm
        isOpen
        initialData={{
          id: 'producto-1',
          negocioId: 'laparada',
          nombre: 'Tequeño',
          precio: 3500,
          disponible: true,
          imagenUrl: 'https://example.com/tequeno.jpg',
        } as Producto}
        onClose={() => undefined}
        onSubmit={async () => undefined}
      />
    );

    expect(html).toContain('aria-label="Quitar foto de Tequeño"');
    expect(html).not.toContain('opacity-0');
  });

  it('mantiene visible y nombra el control de quitar la foto de un combo', () => {
    const html = renderToStaticMarkup(
      <ComboForm
        isOpen
        initialData={{
          id: 'combo-1',
          negocioId: 'laparada',
          nombre: 'Combo familiar',
          descripcion: '',
          categoria: 'Combos',
          precioEspecial: 38000,
          items: [{ productoId: 'producto-1', cantidad: 2, nombreSnapshot: 'Tequeño' }],
          disponible: true,
          imagenUrl: 'https://example.com/combo.jpg',
        } as Combo}
        onClose={() => undefined}
        onSubmit={async () => undefined}
      />
    );

    expect(html).toContain('aria-label="Quitar foto de Combo familiar"');
    expect(html).not.toContain('opacity-0');
  });
});
