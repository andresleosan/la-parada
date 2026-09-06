import {

  getDoc,
  doc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { ConfiguracionBot } from '../types';
import { requireTenantId } from '@/security/tenantScope';

type BotConfigUpdates = Pick<
  ConfiguracionBot,
  'activo' | 'mensajeBienvenida' | 'mensajeCierre' | 'ultimaActualizacion'
>;

function assertOfflineBotMessage(value: unknown): void {
  if (typeof value !== 'string') return;
  const normalized = value.toLowerCase();
  const urls = normalized.match(/https?:\/\/[^\s]+/g) || [];
  if (
    normalized.includes('pago en línea')
    || normalized.includes('pago online')
    || urls.some((url) => /(?:checkout|payment|pagar|cobro|pay(?:[./?_-]|$))/.test(url))
  ) {
    throw new Error('Los mensajes del bot no pueden incluir cobros en línea');
  }
}

/**
 * Obtener configuración actual del bot WhatsApp
 */
export async function getBotConfig(negocioId: string): Promise<ConfiguracionBot | null> {
  try {
    const tenantId = requireTenantId(negocioId);
    const docRef = doc(db, 'configuracion', tenantId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as ConfiguracionBot;
    }
    return null;
  } catch (error) {
    console.error('Error fetching bot config:', error);
    throw error;
  }
}

/**
 * Actualizar configuración del bot
 */
export async function updateBotConfig(
  negocioId: string,
  updates: Partial<BotConfigUpdates>
): Promise<void> {
  try {
    const tenantId = requireTenantId(negocioId);
    assertOfflineBotMessage(updates.mensajeBienvenida);
    assertOfflineBotMessage(updates.mensajeCierre);
    const docRef = doc(db, 'configuracion', tenantId);
    await setDoc(docRef, { ...updates, negocioId: tenantId }, { merge: true });
  } catch (error) {
    console.error('Error updating bot config:', error);
    throw error;
  }
}

/**
 * Listener en tiempo real para cambios en config del bot
 */
export function onBotConfigChange(
  negocioId: string,
  callback: (config: ConfiguracionBot | null) => void
): () => void {
  const docRef = doc(db, 'configuracion', requireTenantId(negocioId));
  return onSnapshot(docRef, (snapshot: any) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as ConfiguracionBot);
    } else {
      callback(null);
    }
  });
}
