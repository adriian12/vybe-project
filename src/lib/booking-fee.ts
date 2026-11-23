/**
 * Gastos de gestión de las entradas que se venden en Fiestea (desde el
 * 23-11-2026; sustituyen a la comisión por local, `platform_fee_percent`).
 *
 * Los paga quien compra, encima del precio, como en las ticketeras: el 10 % de
 * cada entrada, redondeado al céntimo, con un tope de 5 € por entrada. Una
 * entrada gratis no tiene gastos. El negocio cobra el precio entero y los
 * gastos van a la cuenta de Stripe de Fiestea (`application_fee_amount`).
 *
 * La misma regla está en el servidor: `ticket_booking_fee_cents()` (migración
 * 142) y `supabase/functions/_shared/booking-fee.ts`. Si cambia, cambian los tres.
 * Las entradas de otras webs (enlace externo) no pasan por aquí.
 */
export const GASTOS_GESTION_PORCENTAJE = 10;
export const GASTOS_GESTION_TOPE_CENTS = 500;

/** Gastos de gestión de UNA entrada de `unitCents` céntimos. */
export const gastosGestionCents = (unitCents: number): number =>
  unitCents > 0 ? Math.min(GASTOS_GESTION_TOPE_CENTS, Math.round((unitCents * GASTOS_GESTION_PORCENTAJE) / 100)) : 0;
