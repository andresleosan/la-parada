import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ID = 'demo-la-parada-rules-test';
const SUPER_ADMIN_EMAIL = 'andres.san1404@gmail.com';
const EMULATORS_AVAILABLE = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  if (!EMULATORS_AVAILABLE) return;

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve('firestore.rules'), 'utf8'),
    },
    storage: {
      rules: readFileSync(resolve('storage.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

async function seedTenant(
  negocioId: string,
  uid: string,
  email: string,
  estado: 'activo' | 'pendiente' = 'activo',
  rol: 'admin' | 'cajero' = 'admin'
) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, 'negocios', negocioId), {
      id: negocioId,
      nombre: `Negocio ${negocioId}`,
      propietarioEmail: email,
      estado,
      plan: 'basico',
      creadoEn: new Date(0),
    });

    await setDoc(doc(db, 'usuarios_negocio', uid), {
      uid,
      email,
      nombre: `Usuario ${uid}`,
      negocioId,
      rol,
      activo: true,
      creadoEn: new Date(0),
    });
  });
}

function buildValidSale(negocioId: string) {
  return {
    negocioId,
    items: [
      {
        tipo: 'producto',
        referenciaId: 'producto-a',
        nombre: 'Producto A',
        cantidad: 1,
        precioUnitario: 1000,
        subtotal: 1000,
      },
    ],
    total: 1000,
    metodoPago: 'efectivo',
    tipoEntrega: 'mostrador',
    origen: 'pos',
    fecha: new Date(0),
  };
}

describe.runIf(EMULATORS_AVAILABLE)('Firestore rules multi-tenant del menú', () => {
  it('mantiene público el menú', async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(db, 'productos', 'publico')));
    await assertSucceeds(getDoc(doc(db, 'categorias', 'publica')));
  });

  it('permite crear producto y categoría en el tenant propio', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const db = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();

    await assertSucceeds(
      setDoc(doc(db, 'productos', 'producto-a'), {
        nombre: 'Producto A',
        negocioId: 'tenantA',
      })
    );
    await assertSucceeds(
      setDoc(doc(db, 'categorias', 'categoria-a'), {
        nombre: 'Categoría A',
        activo: true,
        negocioId: 'tenantA',
      })
    );
  });

  it('impide escribir en otro tenant o cambiar el tenant de un documento', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const db = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();
    const productoRef = doc(db, 'productos', 'producto-a');

    await assertFails(
      setDoc(productoRef, { nombre: 'Intruso', negocioId: 'tenantB' })
    );

    await assertSucceeds(
      setDoc(productoRef, { nombre: 'Propio', negocioId: 'tenantA' })
    );

    await assertFails(updateDoc(productoRef, { negocioId: 'tenantB' }));
  });

  it('bloquea usuarios sin perfil y negocios pendientes', async () => {
    const sinPerfil = testEnv
      .authenticatedContext('sin-perfil', { email: 'nadie@example.com' })
      .firestore();
    await assertFails(
      setDoc(doc(sinPerfil, 'productos', 'sin-perfil'), {
        nombre: 'No permitido',
        negocioId: 'tenantA',
      })
    );

    await seedTenant(
      'tenantPendiente',
      'admin-pendiente',
      'pendiente@example.com',
      'pendiente'
    );
    const pendiente = testEnv
      .authenticatedContext('admin-pendiente', {
        email: 'pendiente@example.com',
      })
      .firestore();
    await assertFails(
      setDoc(doc(pendiente, 'productos', 'pendiente'), {
        nombre: 'No permitido',
        negocioId: 'tenantPendiente',
      })
    );
  });

  it('autoriza al superadmin autenticado para La Parada', async () => {
    const db = testEnv
      .authenticatedContext('superadmin', { email: SUPER_ADMIN_EMAIL })
      .firestore();

    await assertSucceeds(
      setDoc(doc(db, 'productos', 'laparada'), {
        nombre: 'Producto La Parada',
        negocioId: 'laparada',
      })
    );
  });

  it('permite registrar únicamente un negocio pendiente y su propietario', async () => {
    const owner = testEnv
      .authenticatedContext('owner-nuevo', { email: 'owner@example.com' })
      .firestore();
    const negocioRef = doc(owner, 'negocios', 'tenantNuevo');

    await assertFails(
      setDoc(negocioRef, {
        id: 'tenantNuevo',
        propietarioEmail: 'owner@example.com',
        estado: 'activo',
        plan: 'basico',
        creadoEn: new Date(0),
      })
    );

    await assertSucceeds(
      setDoc(negocioRef, {
        id: 'tenantNuevo',
        propietarioEmail: 'owner@example.com',
        estado: 'pendiente',
        plan: 'basico',
        creadoEn: new Date(0),
      })
    );

    await assertFails(
      setDoc(doc(owner, 'usuarios_negocio', 'owner-nuevo'), {
        uid: 'owner-nuevo',
        email: 'owner@example.com',
        nombre: 'Owner',
        negocioId: 'tenantNuevo',
        rol: 'cajero',
        activo: true,
        creadoEn: new Date(0),
      })
    );

    await assertSucceeds(
      setDoc(doc(owner, 'usuarios_negocio', 'owner-nuevo'), {
        uid: 'owner-nuevo',
        email: 'owner@example.com',
        nombre: 'Owner',
        negocioId: 'tenantNuevo',
        rol: 'admin',
        activo: true,
        creadoEn: new Date(0),
      })
    );
  });

  it('impide que un admin de tenant se autoapruebe', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const db = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();

    await assertFails(
      updateDoc(doc(db, 'negocios', 'tenantA'), { estado: 'suspendido' })
    );
    await assertSucceeds(
      updateDoc(doc(db, 'negocios', 'tenantA'), { nombre: 'Nombre actualizado' })
    );
  });

  it('no expone domicilios a cualquier usuario autenticado', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'domicilios', 'pedido-1'), {
        clienteNombre: 'Cliente',
      });
    });

    const usuarioComun = testEnv
      .authenticatedContext('usuario-comun', { email: 'comun@example.com' })
      .firestore();
    await assertFails(getDoc(doc(usuarioComun, 'domicilios', 'pedido-1')));

    const empleadoLegacy = testEnv
      .authenticatedContext('empleado', { role: 'employee' })
      .firestore();
    await assertFails(getDoc(doc(empleadoLegacy, 'domicilios', 'pedido-1')));
  });

  it('limita el catálogo al admin y conserva la operación del cajero en su tenant', async () => {
    await seedTenant('tenantA', 'cajero-a', 'cajero-a@example.com', 'activo', 'cajero');
    const cajero = testEnv
      .authenticatedContext('cajero-a', { email: 'cajero-a@example.com' })
      .firestore();

    await assertFails(
      setDoc(doc(cajero, 'productos', 'producto-a'), {
        negocioId: 'tenantA',
        nombre: 'No autorizado',
      })
    );
    await assertSucceeds(
      setDoc(doc(cajero, 'ventas', 'venta-a'), {
        negocioId: 'tenantA',
        total: 1000,
      })
    );
    await assertFails(
      setDoc(doc(cajero, 'ventas', 'venta-b'), {
        negocioId: 'tenantB',
        total: 1000,
      })
    );
  });

  it('rechaza una identidad persistida en ventas sin bloquear una venta legítima', async () => {
    await seedTenant('tenantA', 'cajero-a', 'cajero-a@example.com', 'activo', 'cajero');
    const cajero = testEnv
      .authenticatedContext('cajero-a', { email: 'cajero-a@example.com' })
      .firestore();

    await assertFails(
      setDoc(doc(cajero, 'ventas', 'venta-con-id'), {
        ...buildValidSale('tenantA'),
        id: 'venta-forjada',
      })
    );
    await assertSucceeds(
      setDoc(doc(cajero, 'ventas', 'venta-legitima'), buildValidSale('tenantA'))
    );
  });

  it('impide agregar una identidad persistida al actualizar una venta', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const admin = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();
    const ventaRef = doc(admin, 'ventas', 'venta-a');

    await assertSucceeds(setDoc(ventaRef, buildValidSale('tenantA')));
    await assertFails(updateDoc(ventaRef, { id: 'venta-forjada' }));
  });

  it('solo permite borrar ventas al admin del tenant propietario', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'usuarios_negocio', 'cajero-a'), {
        uid: 'cajero-a',
        email: 'cajero-a@example.com',
        nombre: 'Cajero A',
        negocioId: 'tenantA',
        rol: 'cajero',
        activo: true,
        creadoEn: new Date(0),
      });
      await setDoc(doc(db, 'ventas', 'venta-a'), buildValidSale('tenantA'));
    });

    const cajero = testEnv
      .authenticatedContext('cajero-a', { email: 'cajero-a@example.com' })
      .firestore();
    const admin = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();

    await assertFails(deleteDoc(doc(cajero, 'ventas', 'venta-a')));
    await assertSucceeds(deleteDoc(doc(admin, 'ventas', 'venta-a')));
  });

  it('impide que un admin cree directamente el perfil de otra identidad', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const db = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();

    await assertFails(
      setDoc(doc(db, 'usuarios_negocio', 'cajero-nuevo'), {
        uid: 'cajero-nuevo',
        email: 'cajero-nuevo@example.com',
        nombre: 'Cajero Nuevo',
        negocioId: 'tenantA',
        rol: 'cajero',
        activo: true,
        creadoEn: new Date(0),
      })
    );
  });

  it('bloquea toda escritura directa de domicilios desde clientes públicos', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'domicilios', 'pedido-existente'), {
        negocioId: 'tenantA',
        clienteNombre: 'Cliente',
        estado: 'pendiente',
      });
    });

    const publicDb = testEnv.unauthenticatedContext().firestore();
    const customerDb = testEnv
      .authenticatedContext('cliente', { email: 'cliente@example.com' })
      .firestore();

    await assertFails(setDoc(doc(publicDb, 'domicilios', 'pedido-falso'), { total: 1 }));
    await assertFails(setDoc(doc(customerDb, 'domicilios', 'pedido-falso'), { total: 1 }));
    await assertFails(updateDoc(doc(customerDb, 'domicilios', 'pedido-existente'), { total: 1 }));
    await assertFails(deleteDoc(doc(customerDb, 'domicilios', 'pedido-existente')));
  });

  it('rechaza el cruce de tenant y permite el alta del POS solo en el tenant propio', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    await seedTenant('tenantB', 'cajero-b', 'cajero-b@example.com', 'activo', 'cajero');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'domicilios', 'pedido-a'), {
        negocioId: 'tenantA',
        estado: 'pendiente',
      });
    });

    const otroTenant = testEnv
      .authenticatedContext('cajero-b', { email: 'cajero-b@example.com' })
      .firestore();
    await assertFails(getDoc(doc(otroTenant, 'domicilios', 'pedido-a')));
    await assertFails(updateDoc(doc(otroTenant, 'domicilios', 'pedido-a'), { estado: 'entregado' }));
    await assertSucceeds(
      setDoc(doc(otroTenant, 'domicilios', 'pedido-b'), {
        negocioId: 'tenantB',
        origen: 'pos',
      })
    );

    const empleadoLegacy = testEnv
      .authenticatedContext('empleado', { role: 'employee' })
      .firestore();
    await assertFails(
      setDoc(doc(empleadoLegacy, 'domicilios', 'pedido-pos'), {
        negocioId: 'laparada',
        origen: 'pos',
      })
    );
  });

  it('aísla las colecciones operativas entre dos tenants y exige queries acotadas', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    await seedTenant('tenantB', 'admin-b', 'admin-b@example.com');
    const adminA = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();
    const adminB = testEnv
      .authenticatedContext('admin-b', { email: 'admin-b@example.com' })
      .firestore();
    const collections = [
      'ventas',
      'domicilios',
      'inventario',
      'entradas_inventario',
      'gastos',
      'cierres_caja',
      'cajas',
    ];

    for (const collectionName of collections) {
      await assertSucceeds(
        setDoc(doc(adminA, collectionName, `${collectionName}-a`), { negocioId: 'tenantA' })
      );
      await assertSucceeds(
        setDoc(doc(adminB, collectionName, `${collectionName}-b`), { negocioId: 'tenantB' })
      );
      await assertSucceeds(
        getDocs(query(collection(adminA, collectionName), where('negocioId', '==', 'tenantA')))
      );
      await assertFails(getDocs(collection(adminA, collectionName)));
      await assertFails(getDoc(doc(adminA, collectionName, `${collectionName}-b`)));
      await assertFails(
        updateDoc(doc(adminA, collectionName, `${collectionName}-b`), { alterado: true })
      );
      await assertFails(
        setDoc(doc(adminA, collectionName, `${collectionName}-intruso`), {
          negocioId: 'tenantB',
        })
      );
    }
  });

  it('permite al superadmin cambiar de tenant sin mezclar resultados', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'ventas', 'venta-a'), {
        negocioId: 'tenantA',
        total: 1000,
      });
      await setDoc(doc(context.firestore(), 'ventas', 'venta-b'), {
        negocioId: 'tenantB',
        total: 2000,
      });
    });
    const superadmin = testEnv
      .authenticatedContext('superadmin', { email: SUPER_ADMIN_EMAIL })
      .firestore();

    const tenantA = await assertSucceeds(
      getDocs(query(collection(superadmin, 'ventas'), where('negocioId', '==', 'tenantA')))
    );
    const tenantB = await assertSucceeds(
      getDocs(query(collection(superadmin, 'ventas'), where('negocioId', '==', 'tenantB')))
    );

    expect(tenantA.docs.map((item) => item.id)).toEqual(['venta-a']);
    expect(tenantB.docs.map((item) => item.id)).toEqual(['venta-b']);
  });

  it('aísla configuración y fotos de transferencia por ruta de tenant', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    await seedTenant('tenantB', 'admin-b', 'admin-b@example.com');
    const adminA = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' });
    const firestoreA = adminA.firestore();
    const storageA = adminA.storage();

    await assertSucceeds(
      setDoc(doc(firestoreA, 'configuracion', 'tenantA'), {
        negocioId: 'tenantA',
        activo: true,
      })
    );
    await assertFails(
      setDoc(doc(firestoreA, 'configuracion', 'tenantB'), {
        negocioId: 'tenantB',
        activo: true,
      })
    );
    await assertSucceeds(
      uploadBytes(ref(storageA, 'transferencias/tenantA/comprobante.jpg'), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        contentType: 'image/jpeg',
      })
    );
    await assertFails(
      uploadBytes(ref(storageA, 'transferencias/tenantB/comprobante.jpg'), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        contentType: 'image/jpeg',
      })
    );
    await assertFails(
      uploadBytes(ref(storageA, 'transferencias/comprobante-legado.jpg'), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        contentType: 'image/jpeg',
      })
    );
  });

  it('mantiene mensajes y eventos de proveedor bajo autoridad del backend', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    await seedTenant('tenantB', 'admin-b', 'admin-b@example.com');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'mensajes_whatsapp', 'mensaje-a'), {
        negocioId: 'tenantA',
        telefono: '3000000000',
        tipo: 'entrada',
        contenido: 'Hola',
        estado: 'entregado',
        creadoEn: new Date(0),
      });
      await setDoc(doc(context.firestore(), 'mensajes_whatsapp', 'mensaje-a', 'eventos_entrega', 'evento-a'), {
        negocioId: 'tenantA',
        tipo: 'entregado',
      });
    });
    const adminA = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();
    const adminB = testEnv
      .authenticatedContext('admin-b', { email: 'admin-b@example.com' })
      .firestore();
    const mensajeA = doc(adminA, 'mensajes_whatsapp', 'mensaje-a');
    const eventoA = doc(adminA, 'mensajes_whatsapp', 'mensaje-a', 'eventos_entrega', 'evento-a');
    const eventoB = doc(adminB, 'mensajes_whatsapp', 'mensaje-a', 'eventos_entrega', 'evento-b');

    await assertSucceeds(getDoc(eventoA));
    await assertSucceeds(updateDoc(mensajeA, { estado: 'leido', actualizadoEn: new Date() }));
    await assertFails(updateDoc(mensajeA, { contenido: 'alterado' }));
    await assertFails(setDoc(doc(adminA, 'mensajes_whatsapp', 'mensaje-falso'), {
      negocioId: 'tenantA',
      telefono: '3000000000',
      tipo: 'salida',
      contenido: 'Mensaje falso',
      estado: 'enviado',
    }));
    await assertFails(setDoc(doc(adminA, 'mensajes_whatsapp', 'mensaje-a', 'eventos_entrega', 'evento-falso'), {
      negocioId: 'tenantA',
      tipo: 'leido',
    }));
    await assertFails(getDoc(doc(adminB, 'mensajes_whatsapp', 'mensaje-a', 'eventos_entrega', 'evento-a')));
    await assertFails(setDoc(eventoB, { estado: 'leido' }));
  });

  it('mantiene los eventos internos de webhooks fuera del alcance del cliente', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'webhook_eventos', 'evento-1'), {
        proveedor: 'externo',
        negocioId: 'tenantA',
      });
    });

    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const adminDb = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();
    const publicDb = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(adminDb, 'webhook_eventos', 'evento-1')));
    await assertFails(
      setDoc(doc(adminDb, 'webhook_eventos', 'evento-falso'), {
        proveedor: 'externo',
      })
    );
    await assertFails(getDoc(doc(publicDb, 'webhook_eventos', 'evento-1')));
  });

  it('conserva las colecciones históricas de pagos cerradas a todos los clientes', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'transacciones_pago', 'historica-1'), {
        estado: 'archivada',
      });
      await setDoc(doc(context.firestore(), 'sesiones_pago', 'historica-1'), {
        estado: 'archivada',
      });
    });

    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const adminDb = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();
    const publicDb = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(adminDb, 'transacciones_pago', 'historica-1')));
    await assertFails(setDoc(doc(adminDb, 'transacciones_pago', 'nueva'), { monto: 1000 }));
    await assertFails(getDoc(doc(adminDb, 'sesiones_pago', 'historica-1')));
    await assertFails(setDoc(doc(publicDb, 'sesiones_pago', 'nueva'), { estado: 'activa' }));
  });

  it('mantiene privados los controles internos del endpoint de pedidos', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const adminDb = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .firestore();
    const publicDb = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(adminDb, '_idempotencia_pedidos_publicos', 'registro-1')));
    await assertFails(
      setDoc(doc(adminDb, '_idempotencia_pedidos_publicos', 'registro-1'), { ok: true })
    );
    await assertFails(getDoc(doc(publicDb, '_limites_pedidos_publicos', 'registro-1')));
    await assertFails(
      setDoc(doc(publicDb, '_limites_pedidos_publicos', 'registro-1'), { count: 1 })
    );
    await assertFails(getDoc(doc(adminDb, '_ordenes_whatsapp_activas', 'registro-1')));
    await assertFails(
      setDoc(doc(adminDb, '_ordenes_whatsapp_activas', 'registro-1'), {
        negocioId: 'tenantA',
        ordenId: 'orden-1',
      })
    );
  });
});

describe.runIf(EMULATORS_AVAILABLE)('Storage rules multi-tenant de fotos', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

  it('permite una imagen del tenant propio', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const storage = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .storage();

    await assertSucceeds(
      uploadBytes(ref(storage, 'productos/tenantA/item/foto.jpg'), jpeg, {
        contentType: 'image/jpeg',
      })
    );

    const publicStorage = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(
      getBytes(ref(publicStorage, 'productos/tenantA/item/foto.jpg'))
    );
  });

  it('bloquea otro tenant, usuarios sin perfil y negocios pendientes', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const storage = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .storage();
    await assertFails(
      uploadBytes(ref(storage, 'productos/tenantB/item/foto.jpg'), jpeg, {
        contentType: 'image/jpeg',
      })
    );

    const sinPerfil = testEnv
      .authenticatedContext('sin-perfil', { email: 'nadie@example.com' })
      .storage();
    await assertFails(
      uploadBytes(ref(sinPerfil, 'productos/tenantA/item/foto.jpg'), jpeg, {
        contentType: 'image/jpeg',
      })
    );

    await seedTenant(
      'tenantPendiente',
      'admin-pendiente',
      'pendiente@example.com',
      'pendiente'
    );
    const pendiente = testEnv
      .authenticatedContext('admin-pendiente', {
        email: 'pendiente@example.com',
      })
      .storage();
    await assertFails(
      uploadBytes(
        ref(pendiente, 'productos/tenantPendiente/item/foto.jpg'),
        jpeg,
        { contentType: 'image/jpeg' }
      )
    );
  });

  it('rechaza contenido que no sea imagen', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const storage = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .storage();

    await assertFails(
      uploadBytes(ref(storage, 'productos/tenantA/item/datos.txt'), jpeg, {
        contentType: 'text/plain',
      })
    );
  });

  it('rechaza imágenes de 2 MiB o más', async () => {
    await seedTenant('tenantA', 'admin-a', 'admin-a@example.com');
    const storage = testEnv
      .authenticatedContext('admin-a', { email: 'admin-a@example.com' })
      .storage();

    await assertFails(
      uploadBytes(
        ref(storage, 'productos/tenantA/item/grande.jpg'),
        new Uint8Array(2 * 1024 * 1024),
        { contentType: 'image/jpeg' }
      )
    );
  });

  it('autoriza la foto de La Parada al superadmin autenticado', async () => {
    const storage = testEnv
      .authenticatedContext('superadmin', { email: SUPER_ADMIN_EMAIL })
      .storage();

    await assertSucceeds(
      uploadBytes(ref(storage, 'productos/laparada/item/foto.jpg'), jpeg, {
        contentType: 'image/jpeg',
      })
    );
  });
});
