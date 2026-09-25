import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { ApiError, functionErrorCode } from '@/services/api';

/**
 * Compra integrada de Apple (In-App Purchase) en la app de iOS (migración 074).
 *
 * Apple exige que Premium y los supercrush se vendan en iOS con su compra
 * integrada; Android y la web siguen con Stripe. El flujo:
 *
 *   1. `apple-iap` (`precheck`): las mismas reglas que Stripe antes de cobrar
 *      (no pagar Premium dos veces; el de una fiesta, sólo estando dentro).
 *   2. StoreKit 2 cobra, con la compra atada a la cuenta (`appAccountToken`
 *      es el id del perfil).
 *   3. `apple-iap` (`verify`) comprueba la firma de Apple y activa lo comprado.
 *   4. Sólo entonces se cierra la transacción en StoreKit. Si algo falla por
 *      el camino, sigue abierta y `syncApplePurchases()` la vuelve a mandar al
 *      abrir la app: nadie paga sin recibir lo comprado.
 *
 * El plugin se importa donde se usa y nunca se devuelve desde una promesa (es
 * un Proxy de Capacitor; véase `auth-storage.ts`).
 */

export type ApplePlan = 'monthly' | 'event' | 'supercrush';

const BUNDLE = 'es.fiestea.app';
export const APPLE_PRODUCTS: Record<ApplePlan, string> = {
  monthly: `${BUNDLE}.premium.monthly`,
  event: `${BUNDLE}.premium.event`,
  supercrush: `${BUNDLE}.supercrush`,
};

/** StoreKit deja comprar hasta 10 unidades de un consumible de una vez. */
export const APPLE_MAX_QUANTITY = 10;

export const usesApplePurchases = (): boolean => Capacitor.getPlatform() === 'ios';

const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('apple-iap', { body });
  const code = error ? await functionErrorCode(error) : (data as { error?: string } | null)?.error;
  if (error || (code && !(data as { finish?: boolean } | null)?.finish)) {
    throw new ApiError(code ?? 'IAP_FAILED', 'errors.generic');
  }
  return data as T;
};

/** El error de StoreKit cuando la persona cierra la hoja de pago. */
const cancelada = (error: unknown) => /cancel/i.test(error instanceof Error ? error.message : String(error));

/** Precio de la App Store de la persona: «0,99 €» y su importe, para los totales. */
export interface ApplePrice {
  label: string;
  amount: number;
  currency: string;
}

/** Precios de la tienda de la persona, para enseñarlos tal cual. */
export const getApplePrices = async (): Promise<Partial<Record<ApplePlan, ApplePrice>>> => {
  if (!usesApplePurchases()) return {};
  const { NativePurchases, PURCHASE_TYPE } = await import('@capgo/native-purchases');
  const precios: Partial<Record<ApplePlan, ApplePrice>> = {};
  try {
    const [subs, sueltos] = await Promise.all([
      NativePurchases.getProducts({ productIdentifiers: [APPLE_PRODUCTS.monthly], productType: PURCHASE_TYPE.SUBS }),
      NativePurchases.getProducts({
        productIdentifiers: [APPLE_PRODUCTS.event, APPLE_PRODUCTS.supercrush],
        productType: PURCHASE_TYPE.INAPP,
      }),
    ]);
    for (const p of [...subs.products, ...sueltos.products]) {
      const plan = (Object.keys(APPLE_PRODUCTS) as ApplePlan[]).find((k) => APPLE_PRODUCTS[k] === p.identifier);
      if (plan) precios[plan] = { label: p.priceString, amount: p.price, currency: p.currencyCode };
    }
  } catch {
    // Sin conexión con la App Store: se enseñan los precios de siempre.
  }
  return precios;
};

/**
 * Compra con Apple. Devuelve `true` si se ha activado, `false` si la persona
 * ha cerrado la hoja de pago; cualquier otro fallo lanza un `ApiError`.
 */
export const buyWithApple = async (
  plan: ApplePlan,
  options: { eventId?: string; quantity?: number } = {},
): Promise<boolean> => {
  const { profileId } = await invoke<{ profileId: string }>({ action: 'precheck', plan, eventId: options.eventId ?? null });

  const { NativePurchases, PURCHASE_TYPE } = await import('@capgo/native-purchases');
  let tx;
  try {
    tx = await NativePurchases.purchaseProduct({
      productIdentifier: APPLE_PRODUCTS[plan],
      productType: plan === 'monthly' ? PURCHASE_TYPE.SUBS : PURCHASE_TYPE.INAPP,
      quantity: plan === 'supercrush' ? Math.min(APPLE_MAX_QUANTITY, Math.max(1, options.quantity ?? 1)) : 1,
      appAccountToken: profileId,
      isConsumable: plan !== 'monthly',
      autoAcknowledgePurchases: false,
    });
  } catch (error) {
    if (cancelada(error)) return false;
    throw new ApiError('IAP_FAILED', 'premium.errors.unavailable');
  }

  if (!tx.jwsRepresentation) throw new ApiError('IAP_FAILED', 'errors.generic');
  await invoke({ action: 'verify', jws: tx.jwsRepresentation, eventId: options.eventId ?? null });
  await NativePurchases.acknowledgePurchase({ purchaseToken: tx.transactionId });
  return true;
};

/**
 * Manda al servidor las transacciones que StoreKit tenga abiertas o activas
 * (una compra que se quedó a medias, una renovación) y cierra las que ya
 * están apuntadas. Se llama al abrir la app con sesión y tras «Restaurar».
 */
export const syncApplePurchases = async (): Promise<number> => {
  if (!usesApplePurchases()) return 0;
  const { NativePurchases } = await import('@capgo/native-purchases');
  let hechas = 0;
  try {
    const { purchases } = await NativePurchases.getPurchases();
    for (const tx of purchases) {
      if (!tx.jwsRepresentation) continue;
      try {
        await invoke({ action: 'verify', jws: tx.jwsRepresentation });
        await NativePurchases.acknowledgePurchase({ purchaseToken: tx.transactionId });
        hechas += 1;
      } catch {
        // Otra cuenta, caducada o sin red: se deja para la próxima vez.
      }
    }
  } catch {
    // StoreKit no disponible.
  }
  return hechas;
};

/** «Restaurar compras» (lo pide Apple para las suscripciones). */
export const restoreApplePurchases = async (): Promise<number> => {
  if (!usesApplePurchases()) return 0;
  const { NativePurchases } = await import('@capgo/native-purchases');
  await NativePurchases.restorePurchases();
  return syncApplePurchases();
};

/** Las suscripciones de Apple se cancelan en los ajustes del iPhone. */
export const manageAppleSubscription = async (): Promise<void> => {
  const { NativePurchases } = await import('@capgo/native-purchases');
  await NativePurchases.manageSubscriptions();
};

/** Renovaciones que StoreKit avisa con la app abierta. */
export const listenAppleTransactions = async (onChange: () => void): Promise<() => void> => {
  if (!usesApplePurchases()) return () => undefined;
  const { NativePurchases } = await import('@capgo/native-purchases');
  const handle = await NativePurchases.addListener('transactionUpdated', (tx) => {
    if (!tx.jwsRepresentation) return;
    void invoke({ action: 'verify', jws: tx.jwsRepresentation })
      .then(onChange)
      .catch(() => undefined);
  });
  return () => void handle.remove();
};
