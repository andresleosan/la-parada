import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  createPublicOrderInFirestore,
  parsePublicOrderInput,
} from '../src/orders/publicOrder';

const PROJECT_ID = 'demo-la-parada-rules-test';
const EMULATOR_AVAILABLE = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const TEST_COLLECTIONS = [
  'negocios',
  'productos',
  'combos',
  'domicilios',
  '_idempotencia_pedidos_publicos',
  '_limites_pedidos_publicos',
];

let app: App;
let db: Firestore;

beforeAll(() => {
  if (!EMULATOR_AVAILABLE) return;
  app = initializeApp({ projectId: PROJECT_ID }, 'public-order-integration');
  db = getFirestore(app);
});

beforeEach(async () => {
  for (const collectionName of TEST_COLLECTIONS) {
    const snapshot = await db.collection(collectionName).get();
    if (snapshot.empty) continue;
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe.runIf(EMULATOR_AVAILABLE)('integración del backend de pedidos públicos', () => {
  const baseInput = (overrides: Record<string, unknown> = {}) =>
    parsePublicOrderInput({
      negocioId: 'laparada',
      idempotencyKey: 'pedido_integracion_123456',
      items: [{ tipo: 'producto', referenciaId: 'producto-seguro', cantidad: 2 }],
      clienteNombre: 'Cliente Integración',
      clienteTelefono: '3001234567',
      direccion: 'Calle 10 # 20-30',
      barrio: 'Centro',
      metodoPago: 'efectivo',
      ...overrides,
    });

  async function seedPublicProduct(
    id = 'producto-seguro',
    overrides: Record<string, unknown> = {}
  ) {
    await db.collection('productos').doc(id).set({
      nombre: 'Producto seguro',
      negocioId: 'laparada',
      disponible: true,
      precio: 12_000,
      ...overrides,
    });
  }

  it('crea una sola orden y devuelve la misma referencia ante un reintento', async () => {
    await seedPublicProduct();
    const input = baseInput();

    const first = await createPublicOrderInFirestore(db, input, 'cliente-integracion');
    const retry = await createPublicOrderInFirestore(db, input, 'cliente-integracion');
    const orders = await db.collection('domicilios').get();

    expect(first).toMatchObject({ total: 24_000, reused: false });
    expect(retry).toEqual({ codigo: first.codigo, total: 24_000, reused: true });
    expect(orders.size).toBe(1);
    expect(orders.docs[0].data()).toMatchObject({
      total: 24_000,
      subtotal: 24_000,
      negocioId: 'laparada',
      metodoPago: 'efectivo',
      estado: 'pendiente',
    });
  });

  it('rechaza reutilizar la clave idempotente con otro contenido', async () => {
    await seedPublicProduct();
    await createPublicOrderInFirestore(db, baseInput(), 'cliente-integracion');

    await expect(
      createPublicOrderInFirestore(
        db,
        baseInput({ metodoPago: 'transferencia' }),
        'cliente-integracion'
      )
    ).rejects.toThrow(/idempotencia/);
    expect((await db.collection('domicilios').get()).size).toBe(1);
  });

  it('rechaza catálogo de otro tenant sin crear una orden parcial', async () => {
    await db.collection('negocios').doc('tenant-a').set({ estado: 'activo' });
    await seedPublicProduct('producto-seguro', { negocioId: 'tenant-b' });

    await expect(
      createPublicOrderInFirestore(
        db,
        baseInput({ negocioId: 'tenant-a' }),
        'cliente-integracion'
      )
    ).rejects.toThrow(/no pertenece/);
    expect((await db.collection('domicilios').get()).empty).toBe(true);
    expect((await db.collection('_idempotencia_pedidos_publicos').get()).empty).toBe(true);
  });

  it('limita el volumen por cliente y ventana', async () => {
    await seedPublicProduct();

    for (let index = 0; index < 10; index += 1) {
      await createPublicOrderInFirestore(
        db,
        baseInput({ idempotencyKey: `pedido_rate_limit_${index}` }),
        'cliente-limitado',
        { nowMs: 1_000_000 }
      );
    }

    await expect(
      createPublicOrderInFirestore(
        db,
        baseInput({ idempotencyKey: 'pedido_rate_limit_10' }),
        'cliente-limitado',
        { nowMs: 1_000_000 }
      )
    ).rejects.toThrow(/Demasiados pedidos/);
    expect((await db.collection('domicilios').get()).size).toBe(10);
  });
});
