import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';
import { isNative } from '@/services/native';
import { APP_URL } from '@/lib/hosts';

/**
 * Entradas y mesas de una fiesta (migración 068).
 *
 * Sólo las venden los locales Business. El pago va por `stripe-checkout`
 * (`plan: 'tickets'`), que reserva las plazas antes de abrir la pasarela; las
 * entradas las emite el webhook cuando Stripe confirma el cobro, así que una
 * pasarela abandonada nunca deja entradas creadas.
 */

export type TicketKind = 'entry' | 'table';

export interface TicketType {
  id: string;
  kind: TicketKind;
  name: string;
  description: string | null;
  priceCents: number;
  /** Plazas que quedan; null = sin límite. */
  remaining: number | null;
  guests: number | null;
  minSpendCents: number | null;
  maxPerOrder: number;
}

export interface MyTicket {
  id: string;
  code: string;
  status: 'valid' | 'used' | 'refunded';
  usedAt: string | null;
  kind: TicketKind;
  typeName: string;
  guests: number | null;
  minSpendCents: number | null;
  unitCents: number;
  eventId: string;
  eventName: string;
  startDate: string;
  endDate: string;
  venueName: string;
}

export interface TicketSale {
  id: string;
  kind: TicketKind;
  name: string;
  description: string | null;
  priceCents: number;
  capacity: number | null;
  guests: number | null;
  minSpendCents: number | null;
  maxPerOrder: number;
  active: boolean;
  sold: number;
  used: number;
  revenueCents: number;
}

export interface TicketOrder {
  id: string;
  buyer: string;
  typeName: string;
  kind: TicketKind;
  quantity: number;
  amountCents: number;
  /** Lo que llega al local después de la comisión de la plataforma. */
  netCents: number;
  status: 'paid' | 'refunded';
  paidAt: string | null;
  refundedAt: string | null;
  /** Entradas del pedido ya validadas en la puerta. */
  used: number;
  refundable: boolean;
}

/** Estado de la cuenta de Stripe del local (Connect, migración 069). */
export interface PaymentsStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  pendingFields: number;
}

export interface TicketTypeInput {
  id?: string | null;
  eventId: string;
  kind: TicketKind;
  name: string;
  description?: string | null;
  priceCents: number;
  capacity: number | null;
  guests?: number | null;
  minSpendCents?: number | null;
  maxPerOrder?: number;
  active?: boolean;
}

export interface ValidatedTicket {
  kind: TicketKind;
  typeName: string;
  holderName: string;
  eventName: string;
  guests: number | null;
  alreadyUsed: boolean;
  usedAt: string | null;
}

export interface PromoterSettlement {
  codeId: string;
  code: string;
  label: string | null;
  promoterName: string | null;
  kind: string;
  checkIns: number;
  ticketRevenueCents: number;
  commissionType: 'per_person' | 'percent' | null;
  commissionValue: number | null;
  commissionCents: number;
  paidAt: string | null;
  paidCents: number | null;
}

const ERRORES: Record<string, string> = {
  PLAN_REQUIRED: 'sales.errors.planRequired',
  NOT_AUTHORIZED: 'sales.errors.notAuthorized',
  EVENT_ENDED: 'sales.errors.eventEnded',
  TABLES_NEED_CAPACITY: 'sales.errors.tablesNeedCapacity',
  CAPACITY_BELOW_SOLD: 'sales.errors.capacityBelowSold',
  SOLD_OUT: 'tickets.buy.errors.soldOut',
  SALES_CLOSED: 'tickets.buy.errors.closed',
  BAD_QUANTITY: 'tickets.buy.errors.quantity',
  TICKET_NOT_FOUND: 'sales.errors.ticketNotFound',
  TICKET_REFUNDED: 'sales.errors.ticketRefunded',
  INVALID_COMMISSION: 'sales.errors.invalidCommission',
  PAYMENTS_NOT_ENABLED: 'tickets.buy.errors.closed',
  CONNECT_NOT_ENABLED: 'sales.payments.errors.connectNotEnabled',
  ONBOARD_FAILED: 'sales.payments.errors.onboard',
  STATUS_FAILED: 'sales.payments.errors.generic',
  DASHBOARD_FAILED: 'sales.payments.errors.generic',
  REFUND_FAILED: 'sales.payments.errors.refund',
  NOT_REFUNDABLE: 'sales.payments.errors.refund',
  ALREADY_REFUNDED: 'sales.payments.errors.alreadyRefunded',
};

/** Llama a `stripe-connect` y devuelve su respuesta o lanza su error. */
const connect = async <T,>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('stripe-connect', { body });
  let code = (data as { error?: string } | null)?.error;
  if (error) {
    const context = (error as { context?: Response }).context;
    try {
      code = ((await context?.clone().json()) as { error?: string } | undefined)?.error ?? 'SERVER_ERROR';
    } catch {
      code = 'SERVER_ERROR';
    }
  }
  if (code) throw new ApiError(code, ERRORES[code] ?? 'errors.generic');
  return data as T;
};

const volverAlPanel = () => `${window.location.origin}/venue/dashboard`;

const fallo = (message: string): ApiError => {
  const code = Object.keys(ERRORES).find((key) => message.includes(key));
  return new ApiError(code ?? 'TICKETS_FAILED', code ? ERRORES[code] : 'errors.generic');
};

/** «15 €», «15,50 €». */
export const euros = (cents: number): string =>
  `${(cents / 100).toLocaleString('es-ES', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;

/** Los códigos de entrada empiezan por «E-»; los vales de promoción, no. */
export const isEventTicketCode = (code: string): boolean => /^E-[0-9A-F]{8}$/i.test(code.trim());

export const ticketsService = {
  // ---------------------------------------------------------------- público
  getEventTypes: async (eventId: string): Promise<TicketType[]> => {
    const { data, error } = await supabase.rpc('get_event_ticket_types', { p_event_id: eventId });
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id,
      kind: row.kind as TicketKind,
      name: row.name,
      description: row.description,
      priceCents: row.price_cents,
      remaining: row.remaining,
      guests: row.guests,
      minSpendCents: row.min_spend_cents,
      maxPerOrder: row.max_per_order,
    }));
  },

  /** Abre la pasarela de pago y devuelve su URL. */
  startCheckout: async (ticketTypeId: string, quantity: number): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', {
      body: {
        plan: 'tickets',
        ticketTypeId,
        quantity,
        // En la app instalada vuelve por `/pago.html`, que reabre «Entradas».
        returnUrl: isNative() ? `${APP_URL}/pago.html` : `${window.location.origin}/tickets`,
      },
    });
    let code = (data as { error?: string } | null)?.error;
    if (error) {
      const context = (error as { context?: Response }).context;
      try {
        code = ((await context?.clone().json()) as { error?: string } | undefined)?.error ?? 'CHECKOUT_FAILED';
      } catch {
        code = 'CHECKOUT_FAILED';
      }
    }
    const url = (data as { url?: string } | null)?.url;
    if (code || !url) {
      const key = code && ERRORES[code] ? ERRORES[code] : 'tickets.buy.errors.checkout';
      throw new ApiError(code ?? 'CHECKOUT_FAILED', key);
    }
    return url;
  },

  getMine: async (): Promise<MyTicket[]> => {
    const { data, error } = await supabase.rpc('my_tickets');
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status as MyTicket['status'],
      usedAt: row.used_at,
      kind: row.kind as TicketKind,
      typeName: row.type_name,
      guests: row.guests,
      minSpendCents: row.min_spend_cents,
      unitCents: row.unit_cents,
      eventId: row.event_id,
      eventName: row.event_name,
      startDate: row.start_date,
      endDate: row.end_date,
      venueName: row.venue_name,
    }));
  },

  // ----------------------------------------------------------------- local
  validate: async (code: string): Promise<ValidatedTicket> => {
    const { data, error } = await supabase.rpc('validate_event_ticket', { p_code: code.trim() });
    if (error) throw fallo(error.message);
    const row = data?.[0];
    if (!row) throw new ApiError('TICKET_NOT_FOUND', ERRORES.TICKET_NOT_FOUND);
    return {
      kind: row.kind as TicketKind,
      typeName: row.type_name,
      holderName: row.holder_name,
      eventName: row.event_name,
      guests: row.guests,
      alreadyUsed: row.already_used,
      usedAt: row.used_at,
    };
  },

  getSales: async (eventId: string): Promise<TicketSale[]> => {
    const { data, error } = await supabase.rpc('get_ticket_sales', { p_event_id: eventId });
    if (error) throw fallo(error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      kind: row.kind as TicketKind,
      name: row.name,
      description: row.description,
      priceCents: row.price_cents,
      capacity: row.capacity,
      guests: row.guests,
      minSpendCents: row.min_spend_cents,
      maxPerOrder: row.max_per_order,
      active: row.active,
      sold: row.sold,
      used: row.used,
      revenueCents: Number(row.revenue_cents),
    }));
  },

  getOrders: async (eventId: string): Promise<TicketOrder[]> => {
    const { data, error } = await supabase.rpc('get_ticket_orders', { p_event_id: eventId });
    if (error) throw fallo(error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      buyer: row.buyer,
      typeName: row.type_name,
      kind: row.kind as TicketKind,
      quantity: row.quantity,
      amountCents: row.amount_cents,
      netCents: row.net_cents,
      status: row.status as TicketOrder['status'],
      paidAt: row.paid_at,
      refundedAt: row.refunded_at,
      used: row.used,
      refundable: row.refundable,
    }));
  },

  saveType: async (input: TicketTypeInput): Promise<string> => {
    const { data, error } = await supabase.rpc('save_ticket_type', {
      p_id: input.id ?? null,
      p_event_id: input.eventId,
      p_kind: input.kind,
      p_name: input.name,
      p_description: input.description ?? null,
      p_price_cents: input.priceCents,
      p_capacity: input.capacity,
      p_guests: input.guests ?? null,
      p_min_spend_cents: input.minSpendCents ?? null,
      p_max_per_order: input.maxPerOrder ?? 6,
      p_active: input.active ?? true,
    } as never);
    if (error) throw fallo(error.message);
    return String(data ?? '');
  },

  // ------------------------------------------------- cobros (Stripe Connect)
  /** Lo guardado en la base de datos: rápido, sin preguntar a Stripe. */
  getPaymentsStatus: async (): Promise<PaymentsStatus | null> => {
    const { data, error } = await supabase.rpc('get_venue_payments_status');
    const row = !error && data?.[0];
    if (!row) return null;
    return {
      connected: row.connected,
      chargesEnabled: row.charges_enabled,
      payoutsEnabled: row.payouts_enabled,
      detailsSubmitted: row.details_submitted,
      pendingFields: row.pending_fields,
    };
  },

  /** Pregunta a Stripe y lo guarda (al volver del alta o al abrir Ventas). */
  refreshPayments: (): Promise<PaymentsStatus> => connect<PaymentsStatus>({ action: 'status' }),

  /** Enlace al alta de Stripe: crea la cuenta si todavía no la tiene. */
  startOnboarding: async (): Promise<string> =>
    (await connect<{ url: string }>({ action: 'onboard', returnUrl: volverAlPanel() })).url,

  /** Enlace de un solo uso al panel de pagos del local en Stripe. */
  paymentsDashboard: async (): Promise<string> => (await connect<{ url: string }>({ action: 'dashboard' })).url,

  /** Devuelve un pedido entero; sus entradas dejan de valer. */
  refundOrder: async (orderId: string): Promise<void> => {
    await connect({ action: 'refund', orderId });
  },

  // ------------------------------------------------------- comisiones RRPP
  getSettlement: async (eventId: string): Promise<PromoterSettlement[]> => {
    const { data, error } = await supabase.rpc('get_promoter_settlement', { p_event_id: eventId });
    if (error) throw fallo(error.message);
    return (data ?? []).map((row) => ({
      codeId: row.code_id,
      code: row.code,
      label: row.label,
      promoterName: row.promoter_name,
      kind: row.kind,
      checkIns: row.check_ins,
      ticketRevenueCents: Number(row.ticket_revenue_cents),
      commissionType: row.commission_type as PromoterSettlement['commissionType'],
      commissionValue: row.commission_value === null ? null : Number(row.commission_value),
      commissionCents: Number(row.commission_cents),
      paidAt: row.paid_at,
      paidCents: row.paid_cents,
    }));
  },

  setCommission: async (codeId: string, type: 'per_person' | 'percent' | null, value: number | null) => {
    const { error } = await supabase.rpc('set_code_commission', {
      p_code_id: codeId,
      p_type: type,
      p_value: value,
    } as never);
    if (error) throw fallo(error.message);
  },

  markPaid: async (codeId: string, paid: boolean) => {
    const { error } = await supabase.rpc('mark_promoter_paid', { p_code_id: codeId, p_paid: paid });
    if (error) throw fallo(error.message);
  },
};
