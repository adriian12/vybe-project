import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';

export const LEAD_VENUE_TYPES = ['discoteca', 'bar', 'club', 'beach_club', 'festival', 'otro'] as const;
export type LeadVenueType = (typeof LEAD_VENUE_TYPES)[number];

export const LEAD_STATUSES = ['new', 'contacted', 'won', 'discarded'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface VenueLeadInput {
  venueName: string;
  city: string;
  venueType: LeadVenueType | '';
  contact: string;
  message: string;
  consent: boolean;
  /** Campo trampa: una persona nunca lo rellena. */
  website: string;
  locale: string;
}

export interface VenueLead {
  id: string;
  venueName: string;
  city: string;
  venueType: string | null;
  contact: string;
  message: string | null;
  locale: string | null;
  status: LeadStatus;
  createdAt: string;
  handledAt: string | null;
}

const ERRORS: Record<string, string> = {
  INVALID_CONTACT: 'landing.form.errors.contact',
  INVALID_FIELDS: 'landing.form.errors.fields',
  CONSENT_REQUIRED: 'landing.form.errors.consent',
  TOO_MANY: 'landing.form.errors.tooMany',
};

/**
 * Solicitudes de locales.
 *
 * El envío va por la Edge Function `venue-lead` (pública, con límite por IP y
 * aviso por correo); leer y gestionar es de administración y va directo a la
 * tabla, que sólo deja a `is_admin()`.
 */
export const leadsService = {
  submit: async (input: VenueLeadInput): Promise<void> => {
    const { error } = await supabase.functions.invoke('venue-lead', {
      body: { ...input, venueType: input.venueType || null },
    });

    if (!error) return;

    let code = 'SEND_FAILED';
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { error?: string };
        code = body.error ?? code;
      } catch {
        // Sin cuerpo legible: se queda el error genérico.
      }
    }
    throw new ApiError(code, ERRORS[code] ?? 'landing.form.errors.generic');
  },

  list: async (): Promise<VenueLead[]> => {
    const { data, error } = await supabase
      .from('venue_leads')
      .select('id, venue_name, city, venue_type, contact, message, locale, status, created_at, handled_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      venueName: row.venue_name,
      city: row.city,
      venueType: row.venue_type,
      contact: row.contact,
      message: row.message,
      locale: row.locale,
      status: (LEAD_STATUSES as readonly string[]).includes(row.status) ? (row.status as LeadStatus) : 'new',
      createdAt: row.created_at,
      handledAt: row.handled_at,
    }));
  },

  setStatus: async (id: string, status: LeadStatus): Promise<void> => {
    const { error } = await supabase.from('venue_leads').update({ status }).eq('id', id);
    if (error) throw error;
  },
};
