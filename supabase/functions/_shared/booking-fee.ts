/**
 * Gastos de gestión por entrada (copia de `src/lib/booking-fee.ts` y de
 * `ticket_booking_fee_cents()`, migración 142): 10 % del precio, máximo 5 €,
 * 0 si es gratis. Los paga el comprador y van a la cuenta de Fiestea.
 */
export const gastosGestionCents = (unitCents: number): number =>
  unitCents > 0 ? Math.min(500, Math.round(unitCents * 0.1)) : 0;
