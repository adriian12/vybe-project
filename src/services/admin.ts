import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';

/**
 * Lo que puede hacer administración sobre las cuentas.
 *
 * Todo pasa por funciones `SECURITY DEFINER` que comprueban `is_admin()` en la
 * base de datos: si alguien llamara a estas RPC con una sesión normal, el
 * servidor responde `NOT_AUTHORIZED`. La interfaz sólo pinta lo que le
 * devuelven.
 */

export type UserSubscription = 'none' | 'monthly' | 'lifetime' | 'event';

export interface AdminUser {
  profileId: string;
  name: string;
  email: string | null;
  age: number | null;
  role: string;
  accountType: string;
  status: string;
  isVerified: boolean;
  staffOnly: boolean;
  createdAt: string;
  subscription: UserSubscription;
  subscriptionExpiresAt: string | null;
  subscriptionEventId: string | null;
  supercrush: number;
  checkIns: number;
  total: number;
}

export interface AdminVenue {
  venueId: string;
  name: string;
  email: string | null;
  city: string | null;
  type: string | null;
  isVerified: boolean;
  verificationStatus: string | null;
  createdAt: string;
  plan: 'free' | 'pro' | 'business';
  planStatus: string;
  planExpiresAt: string | null;
  eventsTotal: number;
  eventsUpcoming: number;
  members: number;
  followers: number;
}

export interface AdminVenueEvent {
  eventId: string;
  name: string;
  startDate: string;
  endDate: string;
  maxCapacity: number | null;
  featuredUntil: string | null;
  checkIns: number;
  matches: number;
  intents: number;
}

const fallo = (mensaje: string): never => {
  throw new ApiError(mensaje === 'NOT_AUTHORIZED' ? 'NOT_AUTHORIZED' : 'ADMIN_FAILED', mensaje);
};

export const adminService = {
  /**
   * Da de alta una cuenta con nombre y correo. La contraseña la elige quien la
   * reciba, con el enlace que le llega por correo.
   */
  createAccount: async (
    type: 'user' | 'venue',
    name: string,
    email: string,
  ): Promise<{ id: string; emailSent: boolean }> => {
    const { data, error } = await supabase.functions.invoke('admin-create-account', {
      body: { type, name, email },
    });
    if (error) {
      // El código del error viene en el cuerpo de la respuesta.
      const context = (error as { context?: Response }).context;
      let code = 'CREATE_FAILED';
      try {
        const body = (await context?.clone().json()) as { error?: string } | undefined;
        if (body?.error) code = body.error;
      } catch {
        // Sin cuerpo: error genérico.
      }
      throw new Error(code);
    }
    const respuesta = data as { id?: string; emailSent?: boolean; error?: string } | null;
    if (respuesta?.error && !respuesta.id) throw new Error(respuesta.error);
    return { id: respuesta?.id ?? '', emailSent: Boolean(respuesta?.emailSent) };
  },

  /** Crea una fiesta; sin local va al local de la casa («Fiestea»). */
  createEvent: async (event: {
    name: string;
    start: string;
    end: string;
    venueId?: string | null;
    description?: string | null;
    city?: string | null;
    price?: number | null;
    capacity?: number | null;
    theme?: string | null;
  }): Promise<string> => {
    const { data, error } = await supabase.rpc('admin_create_event', {
      p_name: event.name,
      p_start: event.start,
      p_end: event.end,
      p_venue_id: event.venueId ?? null,
      p_description: event.description ?? null,
      p_city: event.city ?? null,
      p_price: event.price ?? null,
      p_capacity: event.capacity ?? null,
      p_theme: event.theme ?? null,
    });
    if (error) fallo(error.message);
    return String(data ?? '');
  },

  listUsers: async (search = '', limit = 50, offset = 0): Promise<AdminUser[]> => {
    const { data, error } = await supabase.rpc('admin_list_users', {
      p_search: search || null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) fallo(error.message);
    return (data ?? []).map((row) => ({
      profileId: row.profile_id,
      name: row.name,
      email: row.email,
      age: row.age,
      role: row.role,
      accountType: row.account_type,
      status: row.status,
      isVerified: row.is_verified,
      staffOnly: row.staff_only,
      createdAt: row.created_at,
      subscription: (row.subscription_type as UserSubscription | null) ?? 'none',
      subscriptionExpiresAt: row.subscription_expires_at,
      subscriptionEventId: row.subscription_event_id,
      supercrush: row.supercrush ?? 0,
      checkIns: Number(row.check_ins ?? 0),
      total: Number(row.total_count ?? 0),
    }));
  },

  setSubscription: async (profileId: string, type: 'none' | 'monthly' | 'lifetime', days = 30): Promise<void> => {
    const { error } = await supabase.rpc('admin_set_subscription', {
      p_profile_id: profileId,
      p_type: type,
      p_days: days,
    });
    if (error) fallo(error.message);
  },

  addSupercrush: async (profileId: string, quantity: number): Promise<number> => {
    const { data, error } = await supabase.rpc('admin_add_supercrush', {
      p_profile_id: profileId,
      p_quantity: quantity,
    });
    if (error) fallo(error.message);
    return Number(data ?? 0);
  },

  listVenues: async (search = ''): Promise<AdminVenue[]> => {
    const { data, error } = await supabase.rpc('admin_list_venues', { p_search: search || null });
    if (error) fallo(error.message);
    return (data ?? []).map((row) => ({
      venueId: row.venue_id,
      name: row.name,
      email: row.email,
      city: row.city,
      type: row.type,
      isVerified: row.is_verified,
      verificationStatus: row.verification_status,
      createdAt: row.created_at,
      plan: (row.plan as AdminVenue['plan']) ?? 'free',
      planStatus: row.plan_status,
      planExpiresAt: row.plan_expires_at,
      eventsTotal: Number(row.events_total ?? 0),
      eventsUpcoming: Number(row.events_upcoming ?? 0),
      members: Number(row.members ?? 0),
      followers: Number(row.followers ?? 0),
    }));
  },

  setVenuePlan: async (venueId: string, plan: 'free' | 'pro' | 'business', days = 30): Promise<void> => {
    const { error } = await supabase.rpc('admin_set_venue_plan', {
      p_venue_id: venueId,
      p_plan: plan,
      p_days: days,
    });
    if (error) fallo(error.message);
  },

  venueEvents: async (venueId: string): Promise<AdminVenueEvent[]> => {
    const { data, error } = await supabase.rpc('admin_venue_events', { p_venue_id: venueId });
    if (error) fallo(error.message);
    return (data ?? []).map((row) => ({
      eventId: row.event_id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      maxCapacity: row.max_capacity,
      featuredUntil: row.featured_until,
      checkIns: Number(row.check_ins ?? 0),
      matches: Number(row.matches ?? 0),
      intents: Number(row.intents ?? 0),
    }));
  },
};
