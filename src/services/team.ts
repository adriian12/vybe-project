import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';
import type { VenueSosAlert } from '@/services/venue-service';

/**
 * Roles del equipo (migración 072).
 *
 *   · Propietarios: cuenta, todo el panel.
 *   · Seguridad: cuenta o enlace de una noche.
 *   · Camareros: enlace de una noche.
 *   · RRPP: enlace fijo hasta que el local lo revoca.
 *
 * El propietario crea y revoca los enlaces desde Equipo; quien lo recibe abre
 * `/equipo/<token>` sin cuenta, y la página habla con la Edge Function
 * `team-access`.
 */

export type TeamLinkRole = 'security' | 'waiter' | 'promoter';
export type CommissionType = 'per_person' | 'percent';

export interface TeamLink {
  id: string;
  role: TeamLinkRole;
  label: string;
  token: string;
  eventId: string | null;
  eventName: string | null;
  eventStart: string | null;
  commissionType: CommissionType | null;
  commissionValue: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export const teamLinkUrl = (token: string) => `${window.location.origin}/equipo/${token}`;

export const isLinkAlive = (link: Pick<TeamLink, 'revokedAt' | 'expiresAt'>) =>
  !link.revokedAt && (!link.expiresAt || new Date(link.expiresAt).getTime() > Date.now());

const ERRORES: Record<string, string> = {
  NOT_AUTHORIZED: 'sales.errors.notAuthorized',
  NAME_REQUIRED: 'team.errors.name',
  EVENT_NOT_FOUND: 'team.errors.event',
  EVENT_ENDED: 'team.errors.eventEnded',
  TOO_MANY_LINKS: 'team.errors.tooMany',
  INVALID_COMMISSION: 'team.errors.commission',
};

const fallo = (message: string): ApiError => {
  const code = Object.keys(ERRORES).find((key) => message.includes(key));
  return new ApiError(code ?? 'TEAM_FAILED', code ? ERRORES[code] : 'errors.generic');
};

export const teamService = {
  createLink: async (input: {
    role: TeamLinkRole;
    label: string;
    eventId?: string | null;
    commissionType?: CommissionType | null;
    commissionValue?: number | null;
  }): Promise<string> => {
    const { data, error } = await supabase.rpc('create_team_link', {
      p_role: input.role,
      p_label: input.label,
      p_event_id: input.eventId ?? null,
      p_commission_type: input.commissionType ?? null,
      p_commission_value: input.commissionValue ?? null,
    } as never);
    if (error) throw fallo(error.message);
    const row = (data as { token: string }[] | null)?.[0];
    if (!row) throw new ApiError('TEAM_FAILED', 'errors.generic');
    return row.token;
  },

  listLinks: async (): Promise<TeamLink[]> => {
    const { data, error } = await supabase.rpc('list_team_links');
    if (error) throw fallo(error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      role: row.role as TeamLinkRole,
      label: row.label,
      token: row.token,
      eventId: row.event_id,
      eventName: row.event_name,
      eventStart: row.event_start,
      commissionType: (row.commission_type as CommissionType | null) ?? null,
      commissionValue: row.commission_value === null ? null : Number(row.commission_value),
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    }));
  },

  revokeLink: async (linkId: string): Promise<void> => {
    const { error } = await supabase.rpc('revoke_team_link', { p_link_id: linkId });
    if (error) throw fallo(error.message);
  },
};

// ---------------------------------------------------------------------------
// La página del enlace
// ---------------------------------------------------------------------------

/** Error de la función que no se arregla reintentando (enlace caducado…). */
export class TeamLinkError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'TeamLinkError';
  }
}

export interface TeamLinkState {
  role: TeamLinkRole;
  label: string;
  venueName: string;
  expiresAt: string | null;
  event: {
    id: string;
    name: string;
    start: string;
    end: string;
    entryClosedAt: string | null;
    capacity: number | null;
  } | null;
  features: { tickets: boolean; codes: boolean; commissions: boolean };
}

export interface TeamOffer {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  endsAt: string | null;
  claimed: number;
  validated: number;
}

export interface TeamRaffle {
  id: string;
  prize: string;
  status: string;
  drawAt: string;
  winnerName: string | null;
  winnerCode: string | null;
}

export interface PromoterEventSummary {
  id: string;
  name: string;
  start: string;
  end: string;
  posterUrl: string | null;
  people: number;
  admitted: number;
  checkIns: number;
}

export interface PromoterEntry {
  id: string;
  name: string;
  companions: number;
  admitted: number;
  createdAt: string;
}

export interface PromoterEvent {
  event: { id: string; name: string; start: string; end: string; posterUrl: string | null };
  listOpen: boolean;
  entries: PromoterEntry[];
  code: { code: string; active: boolean } | null;
  checkIns: number;
  commission: {
    type: CommissionType;
    value: number;
    checkIns: number;
    revenueCents: number;
    amountCents: number;
    paidAt: string | null;
  } | null;
}

interface SosRow {
  id: string;
  event_id: string;
  profile_name: string;
  profile_photo: string | null;
  event_name: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  handled_at: string | null;
}

/** Códigos que se enseñan con su texto; el resto, error genérico. */
const LINK_ERRORS: Record<string, string> = {
  TICKET_NOT_FOUND: 'sales.errors.ticketNotFound',
  TICKET_REFUNDED: 'sales.errors.ticketRefunded',
  ENTRY_LOCKED: 'team.errors.entryLocked',
  GUEST_LIST_CLOSED: 'guestList.errors.closed',
  NAME_REQUIRED: 'guestList.errors.name',
  INVALID_COMPANIONS: 'guestList.errors.companions',
  CAPACITY_REQUIRED: 'counter.errors.CAPACITY_REQUIRED',
  EVENT_NOT_LIVE: 'counter.errors.EVENT_NOT_LIVE',
  NOT_AUTHORIZED: 'sales.errors.notAuthorized',
};

export const teamLink = (token: string) => {
  const call = async <T>(action: string, args: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await supabase.functions.invoke<{ data: T }>('team-access', {
      body: { token, action, args },
    });
    if (error) {
      let code = 'UNKNOWN';
      if (error instanceof FunctionsHttpError) {
        const detail = (await error.context.json().catch(() => null)) as { error?: string } | null;
        code = detail?.error ?? code;
      }
      if (code === 'INVALID_LINK') throw new TeamLinkError(code);
      throw new ApiError(code, LINK_ERRORS[code] ?? 'errors.generic');
    }
    return (data as { data: T }).data;
  };

  const sos = async (): Promise<VenueSosAlert[]> => {
    const rows = await call<SosRow[]>('sos');
    return (rows ?? []).map((row) => ({
      id: row.id,
      eventId: row.event_id,
      profileName: row.profile_name,
      profilePhoto: row.profile_photo,
      eventName: row.event_name,
      note: row.note,
      latitude: row.latitude,
      longitude: row.longitude,
      createdAt: row.created_at,
      handledAt: row.handled_at,
    }));
  };

  return {
    call,
    state: () => call<TeamLinkState>('state'),
    sos,
    acknowledge: async (alertId: string) => {
      await call('sos_ack', { alertId });
    },
    resolve: async (alertId: string) => {
      await call('sos_resolve', { alertId });
    },
  };
};

export type TeamLinkClient = ReturnType<typeof teamLink>;
