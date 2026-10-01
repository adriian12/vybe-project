/**
 * Claves de Stripe según el modo.
 *
 * `STRIPE_MODE=test` usa el entorno de pruebas (`STRIPE_TEST_*`) sin tocar las
 * claves reales (`STRIPE_*`): se vuelve al modo real quitando esa variable.
 *
 *   · Clave secreta: STRIPE_SECRET_KEY / STRIPE_TEST_SECRET_KEY.
 *   · Firma del webhook de la plataforma y del de Connect (eventos de las
 *     cuentas de los negocios, donde van los cargos directos):
 *     STRIPE_WEBHOOK_SECRET y STRIPE_CONNECT_WEBHOOK_SECRET, o sus
 *     STRIPE_TEST_… en pruebas.
 *   · Precios: STRIPE_PRICE_… / STRIPE_TEST_PRICE_….
 *
 * Ojo al cambiar de modo: las cuentas de Stripe de los negocios
 * (`venues.stripe_account_id`) de un modo no existen en el otro.
 */

export const stripeTestMode = () => Deno.env.get('STRIPE_MODE') === 'test';

/** Una variable de Stripe en el modo actual: STRIPE_X o STRIPE_TEST_X. */
export const stripeVar = (name: string): string | undefined =>
  Deno.env.get(stripeTestMode() ? name.replace(/^STRIPE_/, 'STRIPE_TEST_') : name) ?? undefined;

export const stripeSecretKey = () => stripeVar('STRIPE_SECRET_KEY');

export const stripeWebhookSecrets = (): string[] =>
  [stripeVar('STRIPE_WEBHOOK_SECRET'), stripeVar('STRIPE_CONNECT_WEBHOOK_SECRET')].filter((s): s is string => Boolean(s));
