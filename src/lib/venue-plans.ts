/**
 * Lo que incluye cada plan de local.
 *
 * Los límites son los mismos que aplica la base de datos en
 * `venue_plan_limits()`: si se cambian allí, hay que cambiarlos aquí. Se repiten
 * a propósito para que el panel del local y la landing pinten la comparativa
 * sin una llamada más, pero conviene no perderlo de vista.
 */
export const PLAN_FEATURES = ['promoterCodes', 'promotions', 'csvExport', 'pdfExport', 'headcountCurve', 'demographics'] as const;

export type PlanId = 'free' | 'pro' | 'business';

/**
 * Precio mensual en euros (sin IVA). Son los mismos que cobra `stripe-checkout`
 * cuando no hay un precio creado en Stripe: si cambias uno, cambia el otro.
 */
export const PLAN_PRICES: Record<PlanId, number> = { free: 0, pro: 49, business: 99 };

/** Días de Pro gratis que recibe un local al ser aprobado. */
export const TRIAL_DAYS = 30;

/** Destacar un evento: euros por noche, en cualquier plan. */
export const BOOST_PRICE = 19;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export const PLANS: Record<PlanId, { events: number; team: number; features: Record<PlanFeature, boolean> }> = {
  free: {
    events: 1,
    team: 2,
    features: { promoterCodes: false, promotions: false, csvExport: false, pdfExport: false, headcountCurve: false, demographics: false },
  },
  pro: {
    events: 5,
    team: 8,
    features: { promoterCodes: true, promotions: true, csvExport: false, pdfExport: false, headcountCurve: false, demographics: false },
  },
  business: {
    events: 50,
    team: 40,
    features: { promoterCodes: true, promotions: true, csvExport: true, pdfExport: true, headcountCurve: true, demographics: true },
  },
};
