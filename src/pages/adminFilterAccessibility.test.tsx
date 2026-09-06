import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Producto } from '@/types';

vi.mock('@/context/NegocioContext', () => ({
  useNegocio: () => ({ negocioActual: { id: 'laparada', nombre: 'La Parada' } }),
}));

vi.mock('@/hooks/useCategorias', () => ({
  useCategorias: () => ({
    categorias: [{ id: 'categoria-1', nombre: 'Tequeños', icono: '🥟' }],
  }),
}));

vi.mock('@/hooks/useProductos', () => ({
  useProductos: () => ({
    productos: [{
      id: 'producto-1',
      negocioId: 'laparada',
      nombre: 'Tequeño',
      categoria: 'Tequeños',
      precio: 3500,
      disponible: true,
    } as Producto],
    combos: [],
    loading: false,
    error: null,
    refresh: () => undefined,
  }),
}));

// ProductosPage importa el servicio en el nivel de modulo; aislarlo evita que
// este test de render estatico dependa de credenciales Firebase del entorno.
vi.mock('@/services/productosService', () => ({
  crearProducto: vi.fn(),
  actualizarProducto: vi.fn(),
  eliminarProducto: vi.fn(),
  crearCombo: vi.fn(),
  actualizarCombo: vi.fn(),
  eliminarCombo: vi.fn(),
  toggleProductoDisponibilidad: vi.fn(),
  toggleComboDisponibilidad: vi.fn(),
  toggleProductoDestacado: vi.fn(),
  toggleComboDestacado: vi.fn(),
}));

// Las paginas importan servicios que, fuera del navegador, no deben iniciar
// Firebase durante un render estatico sin configuracion de entorno.
vi.mock('@/services/firebase', () => ({
  db: null,
  auth: null,
  functions: null,
  storage: null,
  appCheckConfigured: false,
}));

vi.mock('@/hooks/useInventario', () => ({
  useInventario: () => ({
    insumos: [],
    insumosConBajoStock: [],
    loading: false,
    error: null,
    crear: async () => undefined,
    eliminar: async () => undefined,
    registrarEntrada: async () => undefined,
    registrarSalida: async () => undefined,
    refresh: () => undefined,
  }),
}));

vi.mock('@/hooks/useDomicilios', () => ({
  useDomicilios: () => ({
    activos: [],
    entregados: [],
    loading: false,
    error: null,
    updateEstado: async () => undefined,
    marcarEntregado: async () => undefined,
    refresh: () => undefined,
  }),
}));

vi.mock('@/services/domiciliosService', () => ({
  onNuevoDomicilio: () => () => undefined,
}));

vi.mock('@/components/productos', () => ({
  ProductoForm: () => null,
  ComboForm: () => null,
}));

vi.mock('@/components/productos/CategoriasModal', () => ({
  CategoriasModal: () => null,
}));

import { DomiciliosPage } from './DomiciliosPage';
import { InventarioPage } from './InventarioPage';
import { ProductosPage } from './ProductosPage';
import * as VentasModule from './VentasPage';

type VentaFilter = 'todas' | 'hoy' | 'semana' | 'mes';
type VentasPeriodFilterProps = {
  filter: VentaFilter;
  onChange: (filter: VentaFilter) => void;
};

describe('estado accesible de filtros administrativos', () => {
  it('expone selección en tipo y categoría de Productos', () => {
    const html = renderToStaticMarkup(<ProductosPage />);

    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
    const pressedButtons = html.match(/<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(pressedButtons.some((button) => button.includes('Productos (1)'))).toBe(true);
  });

  it('expone la pestaña seleccionada de Inventario', () => {
    const html = renderToStaticMarkup(<InventarioPage />);

    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
  });

  it('expone la pestaña seleccionada de Domicilios', () => {
    const html = renderToStaticMarkup(<DomiciliosPage />);

    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
  });

  it('expone el periodo seleccionado de Ventas', () => {
    const VentasPeriodFilter = (
      VentasModule as typeof VentasModule & {
        VentasPeriodFilter?: ComponentType<VentasPeriodFilterProps>;
      }
    ).VentasPeriodFilter;

    expect(VentasPeriodFilter).toBeTypeOf('function');
    if (!VentasPeriodFilter) return;

    const html = renderToStaticMarkup(
      <VentasPeriodFilter filter="hoy" onChange={() => undefined} />
    );

    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
  });
});
