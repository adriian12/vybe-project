/**
 * Lo que incluye cada plan de local (migración 126: Gratis y Business; Pro ya
 * no existe).
 *
 * Los límites son los mismos que aplica la base de datos en
 * `venue_plan_limits()` y `venue_has_feature()`: si se cambian allí, hay que
 * cambiarlos aquí. Se repiten a propósito para que el panel del local y la
 * landing pinten la comparativa sin una llamada más, pero conviene no perderlo
 * de vista.
 */
export const PLAN_FEATURES = [
  'doorTools',
  'ticketSales',
  'guestLists',
  'forecast',
  'promoterCodes',
  'commissions',
  'promotions',
  'ratings',
  'audiences',
  'headcountCurve',
  'demographics',
  'csvExport',
  'pdfExport',
  'includedBoost',
] as const;

export type PlanId = 'free' | 'business';

/** Los planes en el orden en que se enseñan. */
export const PLAN_IDS: PlanId[] = ['free', 'business'];

/**
 * Precio mensual en euros (sin IVA). Son los mismos que cobra `stripe-checkout`
 * cuando no hay un precio creado en Stripe: si cambias uno, cambia el otro.
 */
export const PLAN_PRICES: Record<PlanId, number> = { free: 0, business: 69.99 };

/** Días de Business gratis que recibe un local al ser aprobado. */
export const TRIAL_DAYS = 30;

/** Destacar un evento: euros por noche, en cualquier plan (Business lleva uno al mes). */
export const BOOST_PRICE = 19;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

/** ¿Tiene el plan esta función? Lo mismo que `venue_has_feature()` en la base de datos. */
export const planHas = (plan: string | null | undefined, feature: PlanFeature): boolean =>
  (PLANS[plan as PlanId] ?? PLANS.free).features[feature];

/** `null` en eventos o equipo: sin límite. */
export const PLANS: Record<PlanId, { events: number | null; team: number | null; features: Record<PlanFeature, boolean> }> = {
  free: {
    events: 3,
    team: 3,
    features: {
      doorTools: true,
      ticketSales: true,
      guestLists: true,
      forecast: true,
      promoterCodes: false,
      commissions: false,
      promotions: false,
      ratings: false,
      audiences: false,
      headcountCurve: false,
      demographics: false,
      csvExport: false,
      pdfExport: false,
      includedBoost: false,
    },
  },
  business: {
    events: null,
    team: null,
    features: {
      doorTools: true,
      ticketSales: true,
      guestLists: true,
      forecast: true,
      promoterCodes: true,
      commissions: true,
      promotions: true,
      ratings: true,
      audiences: true,
      headcountCurve: true,
      demographics: true,
      csvExport: true,
      pdfExport: true,
      includedBoost: true,
    },
  },
};
