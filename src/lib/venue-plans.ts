/**
 * Lo que incluye cada plan de local.
 *
 * Los límites son los mismos que aplica la base de datos en
 * `venue_plan_limits()`: si se cambian allí, hay que cambiarlos aquí. Se repiten
 * a propósito para que el panel del local y la landing pinten la comparativa
 * sin una llamada más, pero conviene no perderlo de vista.
 */
export const PLAN_FEATURES = ['promoterCodes', 'promotions', 'csvExport', 'demographics'] as const;

export type PlanId = 'free' | 'pro' | 'business';
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export const PLANS: Record<PlanId, { events: number; team: number; features: Record<PlanFeature, boolean> }> = {
  free: {
    events: 1,
    team: 2,
    features: { promoterCodes: false, promotions: false, csvExport: false, demographics: false },
  },
  pro: {
    events: 5,
    team: 8,
    features: { promoterCodes: true, promotions: true, csvExport: true, demographics: false },
  },
  business: {
    events: 50,
    team: 40,
    features: { promoterCodes: true, promotions: true, csvExport: true, demographics: true },
  },
};
