import { httpsCallable } from 'firebase/functions';
import type { MetodoPago } from '@/types';
import { appCheckConfigured, functions } from './firebase';

export interface PublicOrderRequest {
  negocioId: string;
  idempotencyKey: string;
  items: Array<{
    tipo: 'producto' | 'combo';
    referenciaId: string;
    cantidad: number;
  }>;
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string;
  barrio: string;
  notas?: string;
  metodoPago: MetodoPago;
  pagaCon?: number;
}

export interface PublicOrderResponse {
  codigo: string;
  total: number;
  reused: boolean;
}

export function getPublicOrderErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
  const messages: Record<string, string> = {
    'functions/invalid-argument': 'Revisa los datos del pedido e intenta de nuevo.',
    'functions/failed-precondition': 'El menú o el pedido cambió. Actualiza la página e intenta de nuevo.',
    'functions/not-found': 'Uno de los productos ya no está disponible.',
    'functions/resource-exhausted': 'Se alcanzó el límite temporal de pedidos. Intenta más tarde.',
    'functions/unauthenticated': 'No fue posible verificar este navegador. Actualiza la página.',
    'functions/internal': 'No fue posible crear el pedido. Intenta de nuevo.',
  };
  return messages[code] || 'No fue posible crear el pedido. Intenta de nuevo.';
}

export async function createPublicOrder(request: PublicOrderRequest): Promise<PublicOrderResponse> {
  if (!functions) {
    throw new Error('El servicio de pedidos no está disponible');
  }
  if (!appCheckConfigured) {
    throw new Error('El checkout seguro aún no está configurado para este entorno');
  }

  const callable = httpsCallable<PublicOrderRequest, PublicOrderResponse>(
    functions,
    'crearPedidoPublico',
    {
      timeout: 20_000,
      limitedUseAppCheckTokens: true,
    }
  );
  try {
    const result = await callable(request);
    return result.data;
  } catch (error) {
    throw new Error(getPublicOrderErrorMessage(error));
  }
}
