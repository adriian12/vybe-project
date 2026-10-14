import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';

/**
 * Equipos de RRPP y ranking (migración 106). Sólo el propietario del negocio.
 */

export type TeamColor = 'yellow' | 'pink' | 'violet' | 'blue' | 'green' | 'orange' | 'red' | 'gray';
export const TEAM_COLORS: TeamColor[] = ['yellow', 'pink', 'violet', 'blue', 'green', 'orange', 'red', 'gray'];

/** Clases de cada color (escritas enteras para que Tailwind las genere). */
export const TEAM_CHIP: Record<TeamColor, string> = {
  yellow: 'bg-amber-100 text-amber-900',
  pink: 'bg-pink-100 text-pink-800',
  violet: 'bg-violet-100 text-violet-800',
  blue: 'bg-sky-100 text-sky-800',
  green: 'bg-emerald-100 text-emerald-800',
  orange: 'bg-orange-100 text-orange-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-zinc-200 text-zinc-700',
};
export const TEAM_DOT: Record<TeamColor, string> = {
  yellow: 'bg-amber-400',
  pink: 'bg-pink-500',
  violet: 'bg-violet-500',
  blue: 'bg-sky-500',
  green: 'bg-emerald-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  gray: 'bg-zinc-500',
};

export interface PromoterTeam {
  id: string;
  name: string;
  color: TeamColor;
  linkIds: string[];
}

export interface PromoterRankingRow {
  /** El enlace fijo del RRPP; null en los códigos antiguos creados a mano. */
  linkId: string | null;
  name: string;
  teamIds: string[];
  events: number;
  listed: number;
  entered: number;
  revenueCents: number;
  commissionCents: number;
  paidCents: number;
}

const ERRORES: Record<string, string> = {
  TEAM_EXISTS: 'venue.promoters.teamExists',
  NAME_REQUIRED: 'venue.promoters.nameRequired',
  TOO_MANY_TEAMS: 'venue.promoters.tooMany',
};

const fallo = (message: string | undefined): never => {
  const code = Object.keys(ERRORES).find((k) => message?.includes(k));
  throw new ApiError(code ?? 'FAILED', code ? ERRORES[code] : 'errors.generic');
};

export const promotersService = {
  getTeams: async (): Promise<PromoterTeam[]> => {
    const { data, error } = await supabase.rpc('get_promoter_teams');
    if (error) return [];
    return (data ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color as TeamColor, linkIds: t.link_ids ?? [] }));
  },

  saveTeam: async (team: { id?: string | null; name: string; color: TeamColor }): Promise<string> => {
    const { data, error } = await supabase.rpc('save_promoter_team', {
      p_id: team.id ?? null,
      p_name: team.name.trim(),
      p_color: team.color,
    } as never);
    if (error) fallo(error.message);
    return String(data);
  },

  deleteTeam: async (id: string): Promise<void> => {
    const { error } = await supabase.rpc('delete_promoter_team', { p_id: id });
    if (error) fallo(error.message);
  },

  setLinkTeams: async (linkId: string, teamIds: string[]): Promise<void> => {
    const { error } = await supabase.rpc('set_promoter_teams', { p_link_id: linkId, p_team_ids: teamIds });
    if (error) fallo(error.message);
  },

  getRanking: async (filtros: {
    from?: Date | null;
    to?: Date | null;
    eventIds?: string[] | null;
    teamId?: string | null;
  }): Promise<PromoterRankingRow[]> => {
    const { data, error } = await supabase.rpc('get_promoter_ranking', {
      p_from: filtros.from?.toISOString() ?? null,
      p_to: filtros.to?.toISOString() ?? null,
      p_event_ids: filtros.eventIds?.length ? filtros.eventIds : null,
      p_team_id: filtros.teamId ?? null,
    } as never);
    if (error) {
      console.error('Error getting promoter ranking:', error);
      return [];
    }
    return ((data ?? []) as {
      link_id: string | null;
      name: string;
      team_ids: string[] | null;
      events: number;
      listed: number;
      entered: number;
      revenue_cents: number;
      commission_cents: number;
      paid_cents: number;
    }[]).map((r) => ({
      linkId: r.link_id,
      name: r.name,
      teamIds: r.team_ids ?? [],
      events: r.events,
      listed: r.listed,
      entered: r.entered,
      revenueCents: Number(r.revenue_cents),
      commissionCents: Number(r.commission_cents),
      paidCents: Number(r.paid_cents),
    }));
  },
};

/** Periodos del filtro de fecha. */
export type RankingPeriod = 'week' | 'month' | 'quarter' | 'year' | 'all';
export const periodFrom = (p: RankingPeriod): Date | null => {
  if (p === 'all') return null;
  const d = new Date();
  if (p === 'week') d.setDate(d.getDate() - 7);
  else if (p === 'month') d.setMonth(d.getMonth() - 1);
  else if (p === 'quarter') d.setMonth(d.getMonth() - 3);
  else d.setFullYear(d.getFullYear() - 1);
  return d;
};
