/**
 * Lo que incluye cada plan de local.
 *
 * Los límites son los mismos que aplica la base de datos en
 * `venue_plan_limits()`: si se cambian allí, hay que cambiarlos aquí. Se repiten
 * a propósito para que el panel del local y la landing pinten la comparativa
 * sin una llamada más, pero conviene no perderlo de vista.
 */
export const PLAN_FEATURES = [
  'forecast',
  'promoterCodes',
  'promotions',
  'ratings',
  'audiences',
  'csvExport',
  'pdfExport',
  'headcountCurve',
  'demographics',
  'ticketSales',
  'commissions',
] as const;

export type PlanId = 'free' | 'pro' | 'business';

/**
 * Precio mensual en euros (sin IVA). Son los mismos que cobra `stripe-checkout`
 * cuando no hay un precio creado en Stripe: si cambias uno, cambia el otro.
 */
export const PLAN_PRICES: Record<PlanId, number> = { free: 0, pro: 49, business: 69.99 };

/** Días de Pro gratis que recibe un local al ser aprobado. */
export const TRIAL_DAYS = 30;

/** Destacar un evento: euros por noche, en cualquier plan. */
export const BOOST_PRICE = 19;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

/** ¿Tiene el plan esta función? Lo mismo que `venue_has_feature()` en la base de datos. */
export const planHas = (plan: PlanId | null | undefined, feature: PlanFeature): boolean =>
  PLANS[plan ?? 'free'].features[feature];

export const PLANS: Record<PlanId, { events: number; team: number; features: Record<PlanFeature, boolean> }> = {
  free: {
    events: 1,
    team: 2,
    features: {
      forecast: true,
      promoterCodes: false,
      promotions: false,
      ratings: false,
      audiences: false,
      csvExport: false,
      pdfExport: false,
      headcountCurve: false,
      demographics: false,
      ticketSales: false,
      commissions: false,
    },
  },
  pro: {
    events: 5,
    team: 8,
    features: {
      forecast: true,
      promoterCodes: true,
      promotions: true,
      ratings: true,
      audiences: true,
      csvExport: false,
      pdfExport: false,
      headcountCurve: false,
      demographics: false,
      ticketSales: false,
      commissions: false,
    },
  },
  business: {
    events: 50,
    team: 40,
    features: {
      forecast: true,
      promoterCodes: true,
      promotions: true,
      ratings: true,
      audiences: true,
      csvExport: true,
      pdfExport: true,
      headcountCurve: true,
      demographics: true,
      ticketSales: true,
      commissions: true,
    },
  },
};
