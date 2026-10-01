import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { ApiError, functionErrorCode } from '@/services/api';

/**
 * Compras integradas de las tiendas: Apple en iOS (migración 074) y Google
 * Play en Android (migración 090).
 *
 * Apple y Google exigen que Premium y los supercrush se vendan en sus apps con
 * su propio sistema de cobro; la web sigue con Stripe, y las entradas de las
 * fiestas (servicios fuera de la app) van con Stripe en todas partes. El flujo
 * es el mismo en las dos tiendas:
 *
 *   1. `precheck` (en `apple-iap` o `google-play`): las mismas reglas que
 *      Stripe antes de cobrar (no pagar Premium dos veces; el de una fiesta,
 *      sólo estando dentro).
 *   2. La tienda cobra, con la compra atada a la cuenta (`appAccountToken` es
 *      el id del perfil; en Google, `obfuscatedAccountId`).
 *   3. `verify`: el servidor comprueba la compra con Apple o Google y activa lo
 *      comprado.
 *   4. Sólo entonces se cierra en la tienda (Apple: `finish`; Google:
 *      confirmar la suscripción o consumir el producto suelto). Si algo falla
 *      por el camino sigue abierta y `syncStorePurchases()` la vuelve a mandar
 *      al abrir la app: nadie paga sin recibir lo comprado.
 *
 * El plugin se importa donde se usa y nunca se devuelve desde una promesa (es
 * un Proxy de Capacitor; véase `auth-storage.ts`).
 */

export type StorePlan = 'monthly' | 'event' | 'supercrush';
export type Store = 'apple' | 'google';

const BUNDLE = 'es.fiestea.app';
/** Los mismos identificadores en App Store Connect y en Play Console. */
export const STORE_PRODUCTS: Record<StorePlan, string> = {
  monthly: `${BUNDLE}.premium.monthly`,
  event: `${BUNDLE}.premium.event`,
  supercrush: `${BUNDLE}.supercrush`,
};
/** Plan base de la suscripción en Play Console. */
const GOOGLE_BASE_PLAN = 'monthly';

/**
 * Compilaciones de prueba (`VITE_STORE_BILLING=off`): la app instalada cobra
 * con Stripe, como la web. Una APK instalada a mano no puede usar Google Play
 * Billing (sólo funciona instalada desde Play por un tester), y así se puede
 * probar todo con las tarjetas de prueba de Stripe. El AAB para Play se niega
 * a compilar con este interruptor apagado (`scripts/build-aab.mjs`): Google y
 * Apple exigen su cobro para el contenido digital.
 */
const storeBillingOff = () => import.meta.env.VITE_STORE_BILLING === 'off';

/** De qué tienda son las compras en este dispositivo (null: web, con Stripe). */
export const storePlatform = (): Store | null => {
  if (storeBillingOff()) return null;
  const p = Capacitor.getPlatform();
  return p === 'ios' ? 'apple' : p === 'android' ? 'google' : null;
};
export const usesStorePurchases = (): boolean => storePlatform() !== null;

/** Cuántos supercrush se pueden comprar de una vez: StoreKit deja 10, Google Play 1. */
export const storeMaxQuantity = (): number => (storePlatform() === 'apple' ? 10 : 1);

const funcion = () => (storePlatform() === 'google' ? 'google-play' : 'apple-iap');

const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(funcion(), { body });
  const code = error ? await functionErrorCode(error) : (data as { error?: string } | null)?.error;
  if (error || (code && !(data as { finish?: boolean } | null)?.finish)) {
    throw new ApiError(code ?? 'IAP_FAILED', 'errors.generic');
  }
  return data as T;
};

/** El error de la tienda cuando la persona cierra la hoja de pago. */
const cancelada = (error: unknown) =>
  /cancel|user_canceled|USER_CANCELED/i.test(error instanceof Error ? error.message : String(error));

/** Precio de la tienda de la persona: «0,99 €» y su importe, para los totales. */
export interface StorePrice {
  label: string;
  amount: number;
  currency: string;
}

/** Precios de la tienda de la persona, para enseñarlos tal cual. */
export const getStorePrices = async (): Promise<Partial<Record<StorePlan, StorePrice>>> => {
  if (!usesStorePurchases()) return {};
  const { NativePurchases, PURCHASE_TYPE } = await import('@capgo/native-purchases');
  const precios: Partial<Record<StorePlan, StorePrice>> = {};
  try {
    const [subs, sueltos] = await Promise.all([
      NativePurchases.getProducts({ productIdentifiers: [STORE_PRODUCTS.monthly], productType: PURCHASE_TYPE.SUBS }),
      NativePurchases.getProducts({
        productIdentifiers: [STORE_PRODUCTS.event, STORE_PRODUCTS.supercrush],
        productType: PURCHASE_TYPE.INAPP,
      }),
    ]);
    for (const p of [...subs.products, ...sueltos.products]) {
      const plan = (Object.keys(STORE_PRODUCTS) as StorePlan[]).find((k) => STORE_PRODUCTS[k] === p.identifier);
      if (plan) precios[plan] = { label: p.priceString, amount: p.price, currency: p.currencyCode };
    }
  } catch {
    // Sin conexión con la tienda: se enseñan los precios de siempre.
  }
  return precios;
};

interface Compra {
  productIdentifier?: string;
  transactionId?: string;
  jwsRepresentation?: string;
  purchaseToken?: string;
  purchaseState?: string;
  isAcknowledged?: boolean;
}

const planDe = (productId?: string): StorePlan | null =>
  (Object.keys(STORE_PRODUCTS) as StorePlan[]).find((k) => STORE_PRODUCTS[k] === productId) ?? null;

/** Manda una compra al servidor y, si la activa, la cierra en la tienda. */
const verificarYCerrar = async (tx: Compra, eventId?: string | null): Promise<void> => {
  const { NativePurchases } = await import('@capgo/native-purchases');
  if (storePlatform() === 'apple') {
    if (!tx.jwsRepresentation || !tx.transactionId) throw new ApiError('IAP_FAILED', 'errors.generic');
    await invoke({ action: 'verify', jws: tx.jwsRepresentation, eventId: eventId ?? null });
    await NativePurchases.acknowledgePurchase({ purchaseToken: tx.transactionId });
    return;
  }
  const plan = planDe(tx.productIdentifier);
  if (!tx.purchaseToken || !plan) throw new ApiError('IAP_FAILED', 'errors.generic');
  await invoke({
    action: 'verify',
    productId: tx.productIdentifier,
    purchaseToken: tx.purchaseToken,
    eventId: eventId ?? null,
  });
  // La suscripción se confirma; los productos sueltos se consumen para poder
  // volver a comprarlos (consumir también los confirma).
  if (plan === 'monthly') {
    if (!tx.isAcknowledged) await NativePurchases.acknowledgePurchase({ purchaseToken: tx.purchaseToken });
  } else {
    await NativePurchases.consumePurchase({ purchaseToken: tx.purchaseToken });
  }
};

/**
 * Compra en la tienda. Devuelve `true` si se ha activado, `false` si la
 * persona ha cerrado la hoja de pago; cualquier otro fallo lanza un `ApiError`.
 */
export const buyInStore = async (
  plan: StorePlan,
  options: { eventId?: string; quantity?: number } = {},
): Promise<boolean> => {
  const { profileId } = await invoke<{ profileId: string }>({ action: 'precheck', plan, eventId: options.eventId ?? null });

  const { NativePurchases, PURCHASE_TYPE } = await import('@capgo/native-purchases');
  const google = storePlatform() === 'google';
  let tx: Compra;
  try {
    tx = await NativePurchases.purchaseProduct({
      productIdentifier: STORE_PRODUCTS[plan],
      productType: plan === 'monthly' ? PURCHASE_TYPE.SUBS : PURCHASE_TYPE.INAPP,
      ...(google && plan === 'monthly' ? { planIdentifier: GOOGLE_BASE_PLAN } : {}),
      quantity: plan === 'supercrush' ? Math.min(storeMaxQuantity(), Math.max(1, options.quantity ?? 1)) : 1,
      appAccountToken: profileId,
      // Se consume a mano tras activarlo en el servidor (`verificarYCerrar`).
      isConsumable: false,
      autoAcknowledgePurchases: false,
    });
  } catch (error) {
    if (cancelada(error)) return false;
    throw new ApiError('IAP_FAILED', 'premium.errors.unavailable');
  }

  await verificarYCerrar(tx, options.eventId);
  return true;
};

/**
 * Manda al servidor las compras que la tienda tenga abiertas o activas (una
 * compra que se quedó a medias, una renovación) y cierra las que ya están
 * apuntadas. Se llama al abrir la app con sesión y tras «Restaurar».
 */
export const syncStorePurchases = async (): Promise<number> => {
  if (!usesStorePurchases()) return 0;
  const { NativePurchases } = await import('@capgo/native-purchases');
  let hechas = 0;
  try {
    const { purchases } = await NativePurchases.getPurchases();
    for (const tx of purchases as Compra[]) {
      // En Android sólo cuentan las pagadas (`purchaseState` "1").
      if (storePlatform() === 'google' && tx.purchaseState && tx.purchaseState !== '1') continue;
      try {
        await verificarYCerrar(tx);
        hechas += 1;
      } catch {
        // Otra cuenta, caducada o sin red: se deja para la próxima vez.
      }
    }
  } catch {
    // Tienda no disponible.
  }
  return hechas;
};

/** «Restaurar compras». */
export const restoreStorePurchases = async (): Promise<number> => {
  if (!usesStorePurchases()) return 0;
  const { NativePurchases } = await import('@capgo/native-purchases');
  await NativePurchases.restorePurchases();
  return syncStorePurchases();
};

/** Las suscripciones de las tiendas se gestionan en la propia tienda. */
export const manageStoreSubscription = async (): Promise<void> => {
  const { NativePurchases } = await import('@capgo/native-purchases');
  await NativePurchases.manageSubscriptions();
};

/** Renovaciones que la tienda avisa con la app abierta (sólo StoreKit). */
export const listenStoreTransactions = async (onChange: () => void): Promise<() => void> => {
  if (storePlatform() !== 'apple') return () => undefined;
  const { NativePurchases } = await import('@capgo/native-purchases');
  const handle = await NativePurchases.addListener('transactionUpdated', (tx) => {
    if (!tx.jwsRepresentation) return;
    void invoke({ action: 'verify', jws: tx.jwsRepresentation })
      .then(onChange)
      .catch(() => undefined);
  });
  return () => void handle.remove();
};
