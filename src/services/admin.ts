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
  /** La mensual está cancelada: acaba en `subscriptionExpiresAt`. */
  subscriptionCancelAtPeriodEnd: boolean;
  /** Se renueva sola en Stripe en `subscriptionExpiresAt`. */
  subscriptionRenews: boolean;
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
  phone: string | null;
  address: string | null;
  taxId: string | null;
  planCancelAtPeriodEnd: boolean;
  planRenews: boolean;
  /** Lo que se queda la plataforma de cada entrada vendida en la app. */
  platformFeePercent: number;
  stripeConnected: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
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

const FUNOUT_URL = 'https://funout.es/wp-json/mallorca-events/v1/events?per_page=500';

/** Lo que admite el formulario de fiestas de administración. */
export interface AdminEventInput {
  name: string;
  start: string;
  end: string;
  venueId?: string | null;
  description?: string | null;
  city?: string | null;
  price?: number | null;
  capacity?: number | null;
  theme?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeName?: string | null;
  address?: string | null;
  dressCode?: string | null;
  bookingUrl?: string | null;
  posterUrl?: string | null;
}

/** Un evento de Funout, tal y como se guardó (sólo los datos que usamos). */
export interface FunoutEvent {
  funoutId: number;
  title: string;
  startAt: string;
  endAt: string;
  placeName: string | null;
  address: string | null;
  city: string | null;
  hasLocation: boolean;
  imageUrl: string | null;
  ticketUrl: string | null;
  theme: string | null;
  genres: string[];
  dressCode: string | null;
  isFree: boolean;
  lineup: string[];
  /** La fiesta de Fiestea creada a partir de él, si ya se añadió. */
  importedEventId: string | null;
  syncedAt: string;
}

export const adminService = {
  /**
   * Da de alta una cuenta con nombre y correo. La contraseña la elige quien la
   * reciba, con el enlace que le llega por correo.
   */
  createAccount: async (
    type: 'user' | 'venue',
    name: string,
    email: string,
    venue?: {
      venueType?: string;
      city?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    },
  ): Promise<{ id: string; emailSent: boolean }> => {
    const { data, error } = await supabase.functions.invoke('admin-create-account', {
      body: {
        type,
        name,
        email,
        ...(type === 'venue'
          ? {
              venueType: venue?.venueType,
              city: venue?.city ?? null,
              latitude: venue?.latitude ?? null,
              longitude: venue?.longitude ?? null,
            }
          : {}),
      },
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
    latitude?: number | null;
    longitude?: number | null;
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
      p_latitude: event.latitude ?? null,
      p_longitude: event.longitude ?? null,
      // Con punto en el mapa, se comprueba que la gente está allí al entrar.
      p_requires_location: event.latitude != null && event.longitude != null,
    });
    if (error) fallo(error.message);
    return String(data ?? '');
  },

  /**
   * Edita una fiesta (las de administración, incluidas las de Funout). Los
   * campos vacíos se guardan vacíos: es el formulario entero.
   */
  updateEvent: async (id: string, event: AdminEventInput): Promise<void> => {
    const { error } = await supabase.rpc('admin_update_event', {
      p_event_id: id,
      p_name: event.name,
      p_start: event.start,
      p_end: event.end,
      p_description: event.description ?? null,
      p_city: event.city ?? null,
      p_price: event.price ?? null,
      p_capacity: event.capacity ?? null,
      p_theme: event.theme ?? null,
      p_latitude: event.latitude ?? null,
      p_longitude: event.longitude ?? null,
      p_place_name: event.placeName ?? null,
      p_address: event.address ?? null,
      p_dress_code: event.dressCode ?? null,
      p_booking_url: event.bookingUrl ?? null,
      p_poster_url: event.posterUrl ?? null,
    } as never);
    if (error) fallo(error.message);
  },

  // ---------------------------------------------------------------- Funout
  /** Los eventos de Funout que aún no han empezado (migración 082). */
  listFunout: async (): Promise<FunoutEvent[]> => {
    const { data, error } = await supabase.rpc('admin_list_funout');
    if (error) fallo(error.message);
    return (data ?? []).map((row) => ({
      funoutId: Number(row.funout_id),
      title: row.title,
      startAt: row.start_at,
      endAt: row.end_at,
      placeName: row.place_name,
      address: row.address,
      city: row.city,
      hasLocation: row.has_location,
      imageUrl: row.image_url,
      ticketUrl: row.ticket_url,
      theme: row.theme,
      genres: row.genres ?? [],
      dressCode: row.dress_code,
      isFree: row.is_free,
      lineup: row.lineup ?? [],
      importedEventId: row.imported_event_id,
      syncedAt: row.synced_at,
    }));
  },

  /**
   * Trae de nuevo los eventos de Funout. Su CDN bloquea a los servidores, pero
   * su API admite CORS: se lee desde este navegador y `funout-sync` los guarda.
   */
  syncFunout: async (): Promise<{ saved: number }> => {
    const respuesta = await fetch(FUNOUT_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!respuesta.ok) throw new Error('FUNOUT_UNAVAILABLE');
    const events = (await respuesta.json()) as unknown;
    if (!Array.isArray(events)) throw new Error('FUNOUT_BAD_FORMAT');
    const { data, error } = await supabase.functions.invoke('funout-sync', { body: { events } });
    if (error) throw new Error('SYNC_FAILED');
    return { saved: Number((data as { saved?: number } | null)?.saved ?? 0) };
  },

  /** Crea (o pone al día) las fiestas de Fiestea de esos eventos de Funout. */
  importFunout: async (ids: number[]): Promise<number> => {
    const { data, error } = await supabase.rpc('admin_import_funout', { p_ids: ids });
    if (error) fallo(error.message);
    return Number(data ?? 0);
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
      subscriptionCancelAtPeriodEnd: Boolean(row.subscription_cancel_at_period_end),
      subscriptionRenews: Boolean(row.subscription_renews),
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
      phone: row.phone,
      address: row.address,
      taxId: row.tax_id,
      planCancelAtPeriodEnd: Boolean(row.plan_cancel_at_period_end),
      planRenews: Boolean(row.plan_renews),
      platformFeePercent: Number(row.platform_fee_percent ?? 0),
      stripeConnected: Boolean(row.stripe_connected),
      stripeChargesEnabled: Boolean(row.stripe_charges_enabled),
      stripePayoutsEnabled: Boolean(row.stripe_payouts_enabled),
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

  /** % que se queda la plataforma de cada entrada que venda el local en la app. */
  setVenueFee: async (venueId: string, percent: number): Promise<void> => {
    const { error } = await supabase.rpc('admin_set_venue_fee', { p_venue_id: venueId, p_percent: percent });
    if (error) fallo(error.message);
  },

  /** Avisos de administración (Edge Function `admin-notify`). */
  notify: async <T,>(body: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.functions.invoke('admin-notify', { body });
    if (error || (data as { error?: string } | null)?.error) throw new ApiError('NOTIFY_FAILED', 'errors.generic');
    return data as T;
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
