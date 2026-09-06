import { describe, expect, it } from 'vitest';
import {
  calculateOrderItems,
  parsePublicOrderInput,
  PublicOrderError,
  type PublicOrderInput,
} from '../firebase-functions/src/orders/publicOrder';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    negocioId: 'laparada',
    idempotencyKey: 'pedido_prueba_123456789',
    items: [{ tipo: 'producto', referenciaId: 'hamburguesa-1', cantidad: 2 }],
    clienteNombre: 'Ana Pérez',
    clienteTelefono: '300 123 4567',
    direccion: 'Calle 10 # 20-30',
    barrio: 'Centro',
    metodoPago: 'efectivo',
    ...overrides,
  };
}

function validInput(overrides: Partial<PublicOrderInput> = {}): PublicOrderInput {
  return parsePublicOrderInput(validPayload(overrides));
}

describe('contrato de pedidos públicos', () => {
  it('normaliza únicamente los campos permitidos', () => {
    const result = parsePublicOrderInput(validPayload());

    expect(result.clienteTelefono).toBe('3001234567');
    expect(result.items).toEqual([
      { tipo: 'producto', referenciaId: 'hamburguesa-1', cantidad: 2 },
    ]);
  });

  it.each([
    { total: 1 },
    { items: [{ tipo: 'producto', referenciaId: 'hamburguesa-1', cantidad: 1, precioUnitario: 1 }] },
    { metodoPago: 'tarjeta' },
    { items: [{ tipo: 'producto', referenciaId: 'hamburguesa-1', cantidad: 21 }] },
  ])('rechaza campos, pagos o cantidades manipuladas: %o', (overrides) => {
    expect(() => parsePublicOrderInput(validPayload(overrides))).toThrow(PublicOrderError);
  });

  it('recalcula nombres, precios, subtotales y total desde catálogo', () => {
    const result = calculateOrderItems(
      validInput(),
      new Map([
        [
          'producto:hamburguesa-1',
          {
            nombre: 'Hamburguesa de la casa',
            negocioId: 'laparada',
            disponible: true,
            precio: 18_000,
          },
        ],
      ])
    );

    expect(result.total).toBe(36_000);
    expect(result.items[0]).toMatchObject({
      nombre: 'Hamburguesa de la casa',
      precioUnitario: 18_000,
      subtotal: 36_000,
    });
  });

  it('rechaza una referencia de otro tenant', () => {
    expect(() =>
      calculateOrderItems(
        validInput({ negocioId: 'tenant-a' }),
        new Map([
          [
            'producto:hamburguesa-1',
            {
              nombre: 'Producto ajeno',
              negocioId: 'tenant-b',
              disponible: true,
              precio: 1_000,
            },
          ],
        ])
      )
    ).toThrow(/no pertenece/);
  });

  it('rechaza productos que no están disponibles', () => {
    expect(() =>
      calculateOrderItems(
        validInput(),
        new Map([
          [
            'producto:hamburguesa-1',
            {
              nombre: 'Producto agotado',
              negocioId: 'laparada',
              disponible: false,
              precio: 1_000,
            },
          ],
        ])
      )
    ).toThrow(/no están disponibles/);
  });

  it('valida el monto de cambio contra el total calculado', () => {
    expect(() =>
      calculateOrderItems(
        validInput({ pagaCon: 10_000 }),
        new Map([
          [
            'producto:hamburguesa-1',
            {
              nombre: 'Hamburguesa',
              negocioId: 'laparada',
              disponible: true,
              precio: 18_000,
            },
          ],
        ])
      )
    ).toThrow(/menor al total/);
  });
});
