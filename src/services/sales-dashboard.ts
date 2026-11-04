import { supabase } from '@/integrations/supabase/client';

/**
 * Ventas → Resumen y tramos de precio (migración 131). Las funciones aún no
 * están en los tipos generados.
 */

export interface SalesDay {
  day: string;
  entry: number;
  vip: number;
  table: number;
  tickets: number;
}

export interface SalesEventRow {
  event_id: string;
  name: string;
  start_date: string;
  revenue_cents: number;
  tickets: number;
  capacity: number | null;
  entered: number;
}

export interface SalesDashboard {
  kpis: {
    revenue_cents: number;
    tickets: number;
    orders: number;
    refunded_cents: number;
    refunded_orders: number;
    comps: number;
    entered: number;
  };
  by_day: SalesDay[];
  events: SalesEventRow[];
}

export interface PriceTier {
  price_cents: number;
  up_to: number | null;
  until_at: string | null;
}

/** Lo que enseña la ficha: cuántas quedan a este precio y el siguiente. */
export interface PublicTier {
  type_id: string;
  price_cents: number;
  tier_left: number | null;
  next_price_cents: number;
  tier_until: string | null;
}

export const salesDashboardService = {
  get: async (from: Date, to: Date, eventId: string | null): Promise<SalesDashboard> => {
    const { data, error } = await supabase.rpc(
      'get_sales_dashboard' as never,
      { p_from: from.toISOString(), p_to: to.toISOString(), p_event_id: eventId } as never,
    );
    if (error) throw error;
    return data as unknown as SalesDashboard;
  },

  getTiers: async (typeId: string): Promise<PriceTier[]> => {
    const { data, error } = await supabase.rpc('get_ticket_price_tiers' as never, { p_type_id: typeId } as never);
    if (error) throw error;
    return ((data ?? []) as unknown as PriceTier[]).map((t) => ({
      price_cents: t.price_cents,
      up_to: t.up_to,
      until_at: t.until_at,
    }));
  },

  saveTiers: async (typeId: string, tiers: PriceTier[]): Promise<void> => {
    const { error } = await supabase.rpc('save_ticket_price_tiers' as never, { p_type_id: typeId, p_tiers: tiers } as never);
    if (error) throw error;
  },

  /** Nunca falla: sin tramos, la ficha enseña el precio sin más. */
  publicTiers: async (eventId: string): Promise<PublicTier[]> => {
    try {
      const { data, error } = await supabase.rpc('get_event_price_tiers' as never, { p_event_id: eventId } as never);
      if (error) return [];
      return (data ?? []) as unknown as PublicTier[];
    } catch {
      return [];
    }
  },
};
