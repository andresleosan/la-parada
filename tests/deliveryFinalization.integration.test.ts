import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = 'demo-la-parada-rules-test';
const EMULATOR_AVAILABLE = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const DELIVERY_ID = 'pedido-finalizacion';
const SALE_ID = `domicilio_${DELIVERY_ID}`;
const ORIGINAL_TIMESTAMP = Timestamp.fromMillis(1_700_000_000_000);
const ITEMS = [
  {
    tipo: 'producto',
    referenciaId: 'producto-1',
    nombre: 'Producto de prueba',
    cantidad: 2,
    precioUnitario: 6_000,
    subtotal: 12_000,
  },
] as const;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  if (!EMULATOR_AVAILABLE) return;

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve('firestore.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterEach(() => {
  vi.doUnmock('../src/services/firebase');
  vi.resetModules();
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

async function seedTenant(negocioId: string, uid: string, email: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();

    await setDoc(doc(firestore, 'negocios', negocioId), {
      id: negocioId,
      nombre: `Negocio ${negocioId}`,
      propietarioEmail: email,
      estado: 'activo',
      plan: 'basico',
      creadoEn: ORIGINAL_TIMESTAMP,
    });
    await setDoc(doc(firestore, 'usuarios_negocio', uid), {
      uid,
      email,
      nombre: `Usuario ${uid}`,
      negocioId,
      rol: 'admin',
      activo: true,
      creadoEn: ORIGINAL_TIMESTAMP,
    });
  });
}

async function seedDelivery(negocioId = 'tenantA') {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'domicilios', DELIVERY_ID), {
      negocioId,
      clienteNombre: 'Cliente Integración',
      clienteTelefono: '3001234567',
      direccion: 'Calle 10 # 20-30',
      barrio: 'Centro',
      items: ITEMS,
      total: 12_000,
      metodoPago: 'efectivo',
      origen: 'pos',
      estado: 'en_camino',
      creadoEn: ORIGINAL_TIMESTAMP,
      actualizadoEn: ORIGINAL_TIMESTAMP,
    });
  });
}

async function loadFinalizer(firestore: Firestore) {
  vi.resetModules();
  vi.doMock('../src/services/firebase', () => ({ db: firestore }));
  const { finalizarDomicilio } = await import('../src/services/domiciliosService');
  return finalizarDomicilio;
}

describe.runIf(EMULATOR_AVAILABLE)('finalización transaccional de domicilios', () => {
  it('crea la venta y marca el domicilio entregado en la primera finalización', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    await seedDelivery();
    const firestore = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();
    const finalizarDomicilio = await loadFinalizer(firestore);

    const ventaId = await finalizarDomicilio(DELIVERY_ID, 'tenantA');
    const [deliverySnapshot, saleSnapshot] = await Promise.all([
      getDoc(doc(firestore, 'domicilios', DELIVERY_ID)),
      getDoc(doc(firestore, 'ventas', SALE_ID)),
    ]);

    expect(ventaId).toBe(SALE_ID);
    expect(deliverySnapshot.data()).toMatchObject({
      negocioId: 'tenantA',
      estado: 'entregado',
      ventaId: SALE_ID,
    });
    expect(deliverySnapshot.data()?.actualizadoEn.toMillis()).toBeGreaterThan(
      ORIGINAL_TIMESTAMP.toMillis()
    );
    expect(saleSnapshot.data()).toMatchObject({
      negocioId: 'tenantA',
      items: ITEMS,
      total: 12_000,
      metodoPago: 'efectivo',
      tipoEntrega: 'domicilio',
      origen: 'pos',
      domicilioId: DELIVERY_ID,
      direccion: 'Calle 10 # 20-30',
      clienteTelefono: '3001234567',
    });
    expect(saleSnapshot.data()?.fecha).toBeInstanceOf(Timestamp);
  });

  it('devuelve la misma venta y no duplica registros ante un reintento', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    await seedDelivery();
    const firestore = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();
    const finalizarDomicilio = await loadFinalizer(firestore);

    const firstSaleId = await finalizarDomicilio(DELIVERY_ID, 'tenantA');
    const retrySaleId = await finalizarDomicilio(DELIVERY_ID, 'tenantA');
    const sales = await getDocs(
      query(collection(firestore, 'ventas'), where('negocioId', '==', 'tenantA'))
    );

    expect(firstSaleId).toBe(SALE_ID);
    expect(retrySaleId).toBe(SALE_ID);
    expect(sales.docs.map((sale) => sale.id)).toEqual([SALE_ID]);
  });

  it('mantiene exactamente una venta ante dos finalizaciones concurrentes', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    await seedDelivery();
    const firestore = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();
    const finalizarDomicilio = await loadFinalizer(firestore);

    const results = await Promise.allSettled([
      finalizarDomicilio(DELIVERY_ID, 'tenantA'),
      finalizarDomicilio(DELIVERY_ID, 'tenantA'),
    ]);
    const fulfilledResults = results.filter(
      (result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled'
    );
    const rejectedResults = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    const transientEmulatorCodes = new Set(['aborted', 'deadline-exceeded', 'unavailable']);
    const rejectionCodes = rejectedResults.map(({ reason }) =>
      typeof reason === 'object' && reason !== null && 'code' in reason
        ? String(reason.code)
        : 'unknown'
    );
    if (rejectionCodes.length > 0) {
      console.warn(
        `Una finalización concurrente falló de forma transitoria: ${rejectionCodes.join(', ')}`
      );
    }

    expect(fulfilledResults.length).toBeGreaterThanOrEqual(1);
    expect(fulfilledResults.map((result) => result.value)).toEqual(
      Array.from({ length: fulfilledResults.length }, () => SALE_ID)
    );
    expect(rejectedResults.length).toBeLessThanOrEqual(1);
    rejectionCodes.forEach((code) => {
      expect(transientEmulatorCodes.has(code)).toBe(true);
    });

    const [deliverySnapshot, sales] = await Promise.all([
      getDoc(doc(firestore, 'domicilios', DELIVERY_ID)),
      getDocs(query(collection(firestore, 'ventas'), where('negocioId', '==', 'tenantA'))),
    ]);

    expect(deliverySnapshot.data()).toMatchObject({
      negocioId: 'tenantA',
      estado: 'entregado',
      ventaId: SALE_ID,
    });
    expect(sales.docs.map((sale) => sale.id)).toEqual([SALE_ID]);
  });

  it('rechaza otro tenant sin crear la venta ni modificar el domicilio', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    await seedTenant('tenantB', 'admin-b', 'admin-b@example.com');
    await seedDelivery();
    const otherTenantFirestore = testEnv
      .authenticatedContext('admin-b', { email: 'admin-b@example.com' })
      .firestore();
    const finalizarDomicilio = await loadFinalizer(otherTenantFirestore);

    await expect(finalizarDomicilio(DELIVERY_ID, 'tenantB')).rejects.toMatchObject({
      code: 'permission-denied',
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      const [deliverySnapshot, salesSnapshot] = await Promise.all([
        getDoc(doc(firestore, 'domicilios', DELIVERY_ID)),
        getDocs(collection(firestore, 'ventas')),
      ]);

      expect(deliverySnapshot.data()).toMatchObject({
        negocioId: 'tenantA',
        estado: 'en_camino',
      });
      expect(deliverySnapshot.data()).not.toHaveProperty('ventaId');
      expect(salesSnapshot.empty).toBe(true);
    });
  });
});
