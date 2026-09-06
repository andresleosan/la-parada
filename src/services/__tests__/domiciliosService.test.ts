import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: firestoreMocks.getDocs,
  onSnapshot: vi.fn(),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  runTransaction: vi.fn(),
  Timestamp: {
    fromDate: vi.fn(() => ({})),
    now: vi.fn(() => ({})),
  },
  where: vi.fn(() => ({})),
}));

vi.mock('../firebase', () => ({ db: {} }));

import {
  getDomiciliosActivos,
  getDomiciliosEntregados,
} from '../domiciliosService';

describe('lecturas de domicilios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propaga el error al fallar la lectura de domicilios activos', async () => {
    const failure = new Error('Firestore no disponible');
    firestoreMocks.getDocs.mockRejectedValueOnce(failure);

    await expect(getDomiciliosActivos('negocio-a')).rejects.toBe(failure);
  });

  it('propaga el error al fallar la lectura de pedidos creados hoy ya entregados', async () => {
    const failure = new Error('Firestore no disponible');
    firestoreMocks.getDocs.mockRejectedValueOnce(failure);

    await expect(getDomiciliosEntregados('negocio-a')).rejects.toBe(failure);
  });
});
