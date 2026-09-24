import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';

/** Mapea los errores de las funciones de local a claves de traducción. */
const VENUE_ERROR_KEYS: Record<string, string> = {
  PLAN_UPGRADE_REQUIRED: 'venue.plan.errors.upgradeRequired',
  PLAN_EVENT_LIMIT: 'venue.plan.errors.eventLimit',
  PLAN_TEAM_LIMIT: 'venue.plan.errors.teamLimit',
  NOT_AUTHORIZED: 'venue.errors.notAuthorized',
  TICKET_NOT_FOUND: 'venue.promotions.errors.ticketNotFound',
  PROMOTION_EXHAUSTED: 'venue.promotions.errors.exhausted',
  CODE_EXHAUSTED: 'venue.codes.errors.exhausted',
  ALERT_NOT_FOUND: 'venue.safety.errors.alertNotFound',
  CAPACITY_REQUIRED: 'venue.counter.errors.capacityRequired',
  EVENT_NOT_LIVE: 'venue.counter.errors.notLive',
  INVALID_DELTA: 'venue.counter.errors.invalid',
  INVALID_TOTAL: 'venue.counter.errors.invalid',
  TOO_MANY_LINKS: 'venue.counter.errors.tooManyLinks',
  PLAN_REQUIRED: 'venue.plan.errors.upgradeRequired',
  SCHEDULE_LIMIT: 'venue.broadcast.errors.scheduleLimit',
  AUDIENCE_DAILY_LIMIT: 'venue.broadcast.errors.audienceDailyLimit',
  NO_SHOW_NEEDS_STARTED_EVENT: 'venue.broadcast.errors.noShowNeedsStarted',
  SCHEDULE_IN_PAST: 'venue.broadcast.errors.scheduleInPast',
  SCHEDULE_AFTER_EVENT: 'venue.broadcast.errors.scheduleAfterEvent',
};

const venueError = (message: string): ApiError => {
  const code = Object.keys(VENUE_ERROR_KEYS).find((key) => message.includes(key));
  return new ApiError(code ?? 'VENUE_FAILED', code ? VENUE_ERROR_KEYS[code] : 'errors.generic');
};

/** Papeles con cuenta (migración 072). Camareros y RRPP van por enlace. */
export type VenueRole = 'owner' | 'security';

export interface VenueMember {
  id: string;
  userId: string;
  email?: string;
  role: VenueRole;
  createdAt: string;
}

export interface EventFunnel {
  intents: number;
  checkIns: number;
  activeSwipers: number;
  swipes: number;
  matches: number;
  bookingClicks: number;
}

export interface HourlyPoint {
  hour: string;
  checkIns: number;
  matches: number;
}

export interface EventOccupancy {
  /** Gente con Vybe dentro. */
  inside: number;
  totalCheckIns: number;
  capacity: number | null;
  /** Ocupación sobre el aforo: con el total del local si está al día. */
  ratio: number | null;
  /** El aforo está en el umbral configurado o por encima. */
  alert: boolean;
  /** Total real que da la puerta (el último, aunque sea viejo). */
  headcount: number | null;
  headcountAt: string | null;
  /** Parte del público que usa Vybe (0–1). */
  vybeShare: number | null;
}

/** Enlace de contador para el portero. El token sólo se ve al crearlo. */
export interface CounterLink {
  id: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

/** Un tramo de 15 minutos de la curva de la noche. */
export interface HeadcountPoint {
  bucket: string;
  /** Total que daba la puerta; null si aún no se contaba. */
  total: number | null;
  vybe: number;
}

export type CodeKind = 'general' | 'promoter' | 'guest_list' | 'staff';

export interface CodeAttribution {
  codeId: string;
  code: string;
  label: string | null;
  promoterName: string | null;
  kind: CodeKind;
  checkIns: number;
  stillInside: number;
  matches: number;
  /** Si todavía abre la puerta. Los desactivados siguen contando para el histórico. */
  active: boolean;
  /** Veces que se ha canjeado. */
  uses: number;
  /** Tope de canjes, o `null` si no tiene. */
  maxUses: number | null;
  expiresAt: string | null;
}

export interface Promotion {
  id: string;
  eventId: string;
  title: string;
  description: string | null;
  kind: 'offer' | 'voucher' | 'ticket' | 'prize' | 'challenge';
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxPerPerson: number;
  premiumOnly: boolean;
  active: boolean;
  /** Plantilla de la que salió (retos y promos preestablecidas). */
  templateKey: string | null;
  challengeType: string | null;
  challengeTarget: number | null;
  challengeDeadline: string | null;
}

export interface PromotionStats {
  promotionId: string;
  title: string;
  kind: string;
  claimed: number;
  validated: number;
  maxRedemptions: number | null;
}

export interface VenueSosAlert {
  id: string;
  eventId: string;
  profileName: string;
  profilePhoto: string | null;
  eventName: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  handledAt: string | null;
}

export interface VenueReport {
  reportId: string;
  reportedProfileId: string;
  reportedName: string;
  reportedPhoto: string | null;
  reportType: string;
  description: string | null;
  createdAt: string;
  reportsTotal: number;
}

export interface DemographicBucket {
  bucket: string;
  gender: string;
  people: number;
}

export interface WeekdayStats {
  weekday: number;
  events: number;
  avgCheckIns: number;
  avgMatches: number;
  bestTheme: string | null;
}

export interface DropoffPoint {
  hour: string;
  present: number;
  arrived: number;
  left: number;
}

export interface Broadcast {
  id: string;
  title: string;
  body: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  /** Cuántos avisos salieron de verdad. Nulo mientras está en cola. */
  recipients: number | null;
  createdAt: string;
  sentAt: string | null;
  /** Hora a la que saldrá. Nulo: sale en la siguiente pasada. */
  scheduledAt: string | null;
  audience: BroadcastAudience;
}

/**
 * A quién va un aviso. «inside» es quien está dentro ahora (todos los planes);
 * el resto son públicos del local, de Pro y Business (migración 068).
 */
export type BroadcastAudience = 'inside' | 'followers' | 'regulars' | 'no_show' | 'never_came';

export interface EventForecast {
  intents: number;
  pastNights: number;
  expectedCheckins: number;
  /** Personas en total (con y sin la app), si hay recuentos de puerta anteriores. */
  expectedTotal: number | null;
  low: number;
  high: number;
  capacity: number | null;
  confidence: 'low' | 'medium' | 'high';
  fullRisk: boolean;
}

export interface VenuePlanStatus {
  plan: 'free' | 'pro' | 'business';
  status: string;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
  activeEvents: number;
  maxActiveEvents: number;
  teamMembers: number;
  maxTeamMembers: number;
  promoterCodes: boolean;
  demographics: boolean;
  promotions: boolean;
  csvExport: boolean;
}

export interface EventSummary {
  eventId: string;
  eventName: string;
  startDate: string;
  endDate: string;
  intents: number;
  checkIns: number;
  swipes: number;
  matches: number;
  bookingClicks: number;
}

/** Escapa un valor para CSV: comillas dobles y separador incluidos. */
const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const venueService = {
  // ==========================================================================
  // EQUIPO
  // ==========================================================================

  getMyRole: async (): Promise<VenueRole | null> => {
    const { data } = await supabase.rpc('current_venue_role');
    return (data as VenueRole | null) ?? null;
  },

  getMembers: async (venueId: string): Promise<VenueMember[]> => {
    const { data, error } = await supabase
      .from('venue_members')
      .select('id, user_id, email, role, created_at')
      .eq('venue_id', venueId)
      .order('created_at');

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      userId: row.user_id,
      email: row.email ?? undefined,
      role: row.role as VenueRole,
      createdAt: row.created_at,
    }));
  },

  /**
   * Añade a alguien al equipo.
   *
   * La persona debe tener ya cuenta en Vybe: no creamos usuarios desde aquí
   * para no abrir una vía de alta sin verificación de email.
   */
  addMember: async (venueId: string, email: string, role: VenueRole): Promise<void> => {
    const { data, error } = await supabase.functions.invoke('venue-add-member', {
      body: { venueId, email, role },
    });

    if (error) {
      const detail = (data as { error?: string } | null)?.error;
      throw new ApiError(detail === 'USER_NOT_FOUND' ? 'USER_NOT_FOUND' : 'ADD_FAILED',
        detail === 'USER_NOT_FOUND' ? 'venue.team.notFound' : 'errors.generic');
    }
  },

  removeMember: async (memberId: string): Promise<void> => {
    const { error } = await supabase.from('venue_members').delete().eq('id', memberId);
    if (error) throw new ApiError('REMOVE_FAILED', 'errors.generic');
  },

  // ==========================================================================
  // MÉTRICAS
  // ==========================================================================

  getEventFunnel: async (eventId: string): Promise<EventFunnel> => {
    const { data, error } = await supabase.rpc('get_event_funnel', { p_event_id: eventId });

    if (error || !data?.[0]) {
      return { intents: 0, checkIns: 0, activeSwipers: 0, swipes: 0, matches: 0, bookingClicks: 0 };
    }

    const row = data[0];
    return {
      intents: Number(row.intents),
      checkIns: Number(row.check_ins),
      activeSwipers: Number(row.active_swipers),
      swipes: Number(row.swipes),
      matches: Number(row.matches),
      bookingClicks: Number(row.booking_clicks),
    };
  },

  getEventHourly: async (eventId: string): Promise<HourlyPoint[]> => {
    const { data, error } = await supabase.rpc('get_event_hourly', { p_event_id: eventId });
    if (error || !data) return [];

    return data.map((row) => ({
      hour: row.hour,
      checkIns: Number(row.check_ins),
      matches: Number(row.matches),
    }));
  },

  getEventsSummary: async (venueId: string, since?: Date): Promise<EventSummary[]> => {
    const { data, error } = await supabase.rpc('get_venue_events_summary', {
      p_venue_id: venueId,
      p_since: since?.toISOString() ?? null,
    });

    if (error || !data) return [];

    return data.map((row) => ({
      eventId: row.event_id,
      eventName: row.event_name,
      startDate: row.start_date,
      endDate: row.end_date,
      intents: Number(row.intents),
      checkIns: Number(row.check_ins),
      swipes: Number(row.swipes),
      matches: Number(row.matches),
      bookingClicks: Number(row.booking_clicks),
    }));
  },

  /**
   * Informe en PDF del resumen de eventos (plan Business). Abre una ventana con
   * la tabla ya maquetada y el diálogo de imprimir, donde se elige «Guardar como
   * PDF»: sin librerías y con el texto seleccionable.
   */
  exportSummaryPdf: (
    rows: EventSummary[],
    headers: Record<keyof EventSummary, string>,
    meta: { title: string; venueName: string; brand: string },
  ): boolean => {
    const esc = (value: unknown) =>
      String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
    const columns: (keyof EventSummary)[] = [
      'eventName', 'startDate', 'intents', 'checkIns', 'swipes', 'matches', 'bookingClicks',
    ];
    const total = (key: keyof EventSummary) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
    const body = rows
      .map(
        (row) =>
          `<tr>${columns
            .map((c) =>
              c === 'startDate'
                ? `<td>${esc(new Date(row[c]).toLocaleString())}</td>`
                : `<td${c === 'eventName' ? '' : ' class="n"'}>${esc(row[c])}</td>`,
            )
            .join('')}</tr>`,
      )
      .join('');
    const foot = `<tr><td><b>Total</b></td><td></td>${columns
      .slice(2)
      .map((c) => `<td class="n"><b>${total(c)}</b></td>`)
      .join('')}</tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1c1c;margin:32px}
  h1{font-size:22px;margin:0 0 4px} p{margin:0 0 20px;color:#666;font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{padding:7px 8px;border-bottom:1px solid #e5e5e5;text-align:left}
  th{background:#f8d000;color:#1c1c1c;font-weight:700}
  td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{border-top:2px solid #1c1c1c}
  @page{size:A4 landscape;margin:14mm}
</style></head><body>
<h1>${esc(meta.venueName)} · ${esc(meta.title)}</h1>
<p>${esc(meta.brand)} · ${esc(new Date().toLocaleString())}</p>
<table><thead><tr>${columns
      .map((c, i) => `<th${i >= 2 ? ' class="n"' : ''}>${esc(headers[c])}</th>`)
      .join('')}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>
<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>
</body></html>`;
    const ventana = window.open('', '_blank');
    if (!ventana) return false;
    ventana.document.open();
    ventana.document.write(html);
    ventana.document.close();
    return true;
  },

  /** Exporta el resumen de eventos a CSV para poder analizarlo fuera. */
  exportSummaryCsv: (rows: EventSummary[], headers: Record<keyof EventSummary, string>): void => {
    const columns: (keyof EventSummary)[] = [
      'eventName',
      'startDate',
      'endDate',
      'intents',
      'checkIns',
      'swipes',
      'matches',
      'bookingClicks',
    ];

    const lines = [
      columns.map((c) => csvCell(headers[c])).join(','),
      ...rows.map((row) =>
        columns
          .map((column) => {
            const value = row[column];
            if (column === 'startDate' || column === 'endDate') {
              return csvCell(new Date(value as string).toLocaleString());
            }
            return csvCell(value);
          })
          .join(','),
      ),
    ];

    // El BOM hace que Excel abra el CSV en UTF-8 sin destrozar los acentos.
    const blob = new Blob(['﻿' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vybe-eventos-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // ==========================================================================
  // ROTACIÓN DE CÓDIGOS
  // ==========================================================================

  rotateIfNeeded: async (
    venueId: string,
  ): Promise<{ code: string; expiresAt: string; rotated: boolean } | null> => {
    const { data, error } = await supabase.rpc('rotate_event_code_if_needed', {
      p_venue_id: venueId,
    });

    if (error || !data?.[0]) return null;

    return {
      code: data[0].code,
      expiresAt: data[0].expires_at,
      rotated: data[0].rotated,
    };
  },

  // ==========================================================================
  // AFORO Y ATRIBUCIÓN
  // ==========================================================================

  /** Aforo en vivo. Sustituye al clicker de la puerta. */
  getOccupancy: async (eventId: string): Promise<EventOccupancy | null> => {
    const { data, error } = await supabase.rpc('get_event_occupancy', { p_event_id: eventId });
    if (error || !data?.[0]) return null;

    const row = data[0];
    return {
      inside: Number(row.inside),
      totalCheckIns: Number(row.total_check_ins),
      capacity: row.capacity,
      ratio: row.ratio !== null ? Number(row.ratio) : null,
      alert: row.alert,
      headcount: row.headcount ?? null,
      headcountAt: row.headcount_at ?? null,
      vybeShare: row.vybe_share !== null && row.vybe_share !== undefined ? Number(row.vybe_share) : null,
    };
  },

  // ==========================================================================
  // AFORO REAL (contador de puerta)
  // ==========================================================================

  /** Suma o resta gente desde el panel. Devuelve el total nuevo. */
  adjustHeadcount: async (eventId: string, delta: number): Promise<number> => {
    const { data, error } = await supabase.rpc('adjust_event_headcount', {
      p_event_id: eventId,
      p_delta: delta,
    });
    if (error) throw venueError(error.message);
    return Number(data);
  },

  /** Corrige el total de golpe (al abrir, o si el contador se ha desviado). */
  setHeadcount: async (eventId: string, total: number): Promise<number> => {
    const { data, error } = await supabase.rpc('set_event_headcount', {
      p_event_id: eventId,
      p_total: total,
    });
    if (error) throw venueError(error.message);
    return Number(data);
  },

  createCounterLink: async (
    eventId: string,
    label?: string,
  ): Promise<{ id: string; token: string; expiresAt: string }> => {
    const { data, error } = await supabase.rpc('create_counter_link', {
      p_event_id: eventId,
      p_label: label ?? null,
    });
    if (error) throw venueError(error.message);
    const row = data?.[0];
    if (!row) throw new ApiError('COUNTER_LINK_FAILED', 'errors.generic');
    return { id: row.id, token: row.token, expiresAt: row.expires_at };
  },

  listCounterLinks: async (eventId: string): Promise<CounterLink[]> => {
    const { data, error } = await supabase.rpc('list_counter_links', { p_event_id: eventId });
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id,
      label: row.label,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      lastUsedAt: row.last_used_at,
    }));
  },

  /** El token de un enlace ya creado, para volver a enseñarlo (migración 071). */
  getCounterLinkToken: async (linkId: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('get_counter_link_token', { p_link_id: linkId });
    if (error) throw venueError(error.message);
    return (data as string | null) ?? null;
  },

  revokeCounterLink: async (linkId: string): Promise<void> => {
    const { error } = await supabase.rpc('revoke_counter_link', { p_link_id: linkId });
    if (error) throw venueError(error.message);
  },

  /** Curva de la noche: total real frente a Vybe. Sólo Pro y Business. */
  getHeadcountCurve: async (eventId: string): Promise<HeadcountPoint[]> => {
    const { data, error } = await supabase.rpc('get_headcount_curve', { p_event_id: eventId });
    if (error) throw venueError(error.message);
    return (data ?? []).map((row) => ({
      bucket: row.bucket,
      total: row.total ?? null,
      vybe: Number(row.vybe),
    }));
  },

  setCapacity: async (
    eventId: string,
    capacity: number | null,
    alertRatio: number,
  ): Promise<void> => {
    const { error } = await supabase
      .from('events')
      .update({ max_capacity: capacity, capacity_alert_ratio: alertRatio })
      .eq('id', eventId);

    if (error) throw new ApiError('CAPACITY_FAILED', 'errors.generic');
  },

  /** Cuánta gente ha traído cada código, y por tanto cada RRPP. */
  getCodeAttribution: async (eventId: string): Promise<CodeAttribution[]> => {
    const { data, error } = await supabase.rpc('get_code_attribution', { p_event_id: eventId });
    if (error || !data) return [];

    // La función no dice si el código sigue activo ni cuántos usos le quedan,
    // y la pestaña de puerta lo enseña («12/50 usos»). El local puede leer sus
    // propios códigos, así que se completa con una consulta en vez de cambiar
    // la función en la base de datos.
    const ids = data.map((row) => row.code_id);
    const { data: estado } = ids.length
      ? await supabase.from('event_codes').select('id, active, uses, max_uses, expires_at').in('id', ids)
      : { data: [] as { id: string; active: boolean | null; uses: number; max_uses: number | null; expires_at: string }[] };
    const porId = new Map((estado ?? []).map((row) => [row.id, row]));
    const ahora = Date.now();

    return data.map((row) => {
      const extra = porId.get(row.code_id);
      return {
        codeId: row.code_id,
        code: row.code,
        label: row.label,
        promoterName: row.promoter_name,
        kind: row.kind as CodeKind,
        checkIns: Number(row.check_ins),
        stillInside: Number(row.still_inside),
        matches: Number(row.matches),
        active: Boolean(extra?.active) && (!extra?.expires_at || new Date(extra.expires_at).getTime() > ahora),
        uses: extra?.uses ?? Number(row.check_ins),
        maxUses: extra?.max_uses ?? null,
        expiresAt: extra?.expires_at ?? null,
      };
    });
  },

  createLabeledCode: async (
    eventId: string,
    kind: Exclude<CodeKind, 'general'>,
    label: string,
    promoterName?: string,
    maxUses?: number,
  ): Promise<{ id: string; code: string }> => {
    const { data, error } = await supabase.rpc('create_labeled_code', {
      p_event_id: eventId,
      p_kind: kind,
      p_label: label,
      p_promoter_name: promoterName ?? null,
      p_max_uses: maxUses ?? null,
    });

    if (error) throw venueError(error.message);
    const row = data?.[0];
    if (!row) throw new ApiError('CODE_FAILED', 'errors.generic');
    return { id: row.id, code: row.code };
  },

  deactivateCode: async (codeId: string): Promise<void> => {
    const { error } = await supabase.from('event_codes').update({ active: false }).eq('id', codeId);
    if (error) throw new ApiError('CODE_FAILED', 'errors.generic');
  },

  // ==========================================================================
  // PROMOCIONES
  // ==========================================================================

  getPromotions: async (eventId: string): Promise<Promotion[]> => {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      title: row.title,
      description: row.description,
      kind: row.kind as Promotion['kind'],
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      maxRedemptions: row.max_redemptions,
      maxPerPerson: row.max_per_person,
      premiumOnly: row.premium_only,
      active: row.active,
      templateKey: row.template_key,
      challengeType: row.challenge_type,
      challengeTarget: row.challenge_target,
      challengeDeadline: row.challenge_deadline,
    }));
  },

  createPromotion: async (
    venueId: string,
    input: {
      eventId: string;
      title: string;
      description?: string;
      kind: Promotion['kind'];
      startsAt?: string;
      endsAt?: string;
      maxRedemptions?: number;
      maxPerPerson?: number;
      premiumOnly?: boolean;
      templateKey?: string;
      challengeType?: string;
      challengeTarget?: number;
      challengeDeadline?: string;
    },
  ): Promise<void> => {
    const { error } = await supabase.from('promotions').insert({
      venue_id: venueId,
      event_id: input.eventId,
      title: input.title,
      description: input.description ?? null,
      kind: input.kind,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      max_redemptions: input.maxRedemptions ?? null,
      max_per_person: input.maxPerPerson ?? 1,
      premium_only: input.premiumOnly ?? false,
      template_key: input.templateKey ?? null,
      challenge_type: input.challengeType ?? null,
      challenge_target: input.challengeTarget ?? null,
      challenge_deadline: input.challengeDeadline ?? null,
    });

    if (error) throw venueError(error.message);
  },

  setPromotionActive: async (promotionId: string, active: boolean): Promise<void> => {
    const { error } = await supabase.from('promotions').update({ active }).eq('id', promotionId);
    if (error) throw new ApiError('PROMOTION_FAILED', 'errors.generic');
  },

  /** Cambiar texto y horas de una promoción o un reto (también los preestablecidos). */
  updatePromotion: async (
    promotionId: string,
    changes: {
      title?: string;
      description?: string | null;
      startsAt?: string | null;
      endsAt?: string | null;
      challengeDeadline?: string | null;
    },
  ): Promise<void> => {
    const payload: Record<string, string | null> = {};
    if (changes.title !== undefined) payload.title = changes.title;
    if (changes.description !== undefined) payload.description = changes.description;
    if (changes.startsAt !== undefined) payload.starts_at = changes.startsAt;
    if (changes.endsAt !== undefined) payload.ends_at = changes.endsAt;
    if (changes.challengeDeadline !== undefined) payload.challenge_deadline = changes.challengeDeadline;
    const { error } = await supabase.from('promotions').update(payload).eq('id', promotionId);
    if (error) throw venueError(error.message);
  },

  /** Programar (o activar ya) una promoción que ya existe. */
  schedulePromotion: async (promotionId: string, startsAt: string | null): Promise<void> => {
    const { error } = await supabase
      .from('promotions')
      .update({ starts_at: startsAt, active: true })
      .eq('id', promotionId);
    if (error) throw venueError(error.message);
  },

  /** Valida el vale que alguien enseña en barra. */
  validateTicket: async (
    ticketCode: string,
  ): Promise<{ title: string; holderName: string; claimedAt: string; alreadyUsed: boolean }> => {
    const { data, error } = await supabase.rpc('validate_promotion_ticket', {
      p_ticket_code: ticketCode,
    });

    if (error) throw venueError(error.message);
    const row = data?.[0];
    if (!row) throw new ApiError('TICKET_NOT_FOUND', 'venue.promotions.errors.ticketNotFound');

    return {
      title: row.title,
      holderName: row.holder_name,
      claimedAt: row.claimed_at,
      alreadyUsed: row.already_used,
    };
  },

  getPromotionStats: async (eventId: string): Promise<PromotionStats[]> => {
    const { data, error } = await supabase.rpc('get_promotion_stats', { p_event_id: eventId });
    if (error || !data) return [];

    return data.map((row) => ({
      promotionId: row.promotion_id,
      title: row.title,
      kind: row.kind,
      claimed: Number(row.claimed),
      validated: Number(row.validated),
      maxRedemptions: row.max_redemptions,
    }));
  },

  // ==========================================================================
  // SEGURIDAD Y PUERTA
  // ==========================================================================

  getSosAlerts: async (): Promise<VenueSosAlert[]> => {
    const { data, error } = await supabase.rpc('get_venue_sos_alerts');
    if (error || !data) return [];

    return data.map((row) => ({
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
  },

  acknowledgeSosAlert: async (alertId: string): Promise<void> => {
    const { error } = await supabase.rpc('acknowledge_sos_alert', { p_alert_id: alertId });
    if (error) throw venueError(error.message);
  },

  /** Cierra la alerta: deja de salir en el panel y en administración. */
  resolveSosAlert: async (alertId: string): Promise<void> => {
    const { error } = await supabase.rpc('resolve_sos_alert', { p_alert_id: alertId });
    if (error) throw venueError(error.message);
  },

  getReports: async (eventId: string): Promise<VenueReport[]> => {
    const { data, error } = await supabase.rpc('get_venue_reports', { p_event_id: eventId });
    if (error || !data) return [];

    return data.map((row) => ({
      reportId: row.report_id,
      reportedProfileId: row.reported_profile_id,
      reportedName: row.reported_name,
      reportedPhoto: row.reported_photo,
      reportType: row.report_type,
      description: row.description,
      createdAt: row.created_at,
      reportsTotal: Number(row.reports_total),
    }));
  },

  /** Retira el acceso al evento sin suspender la cuenta. */
  revokeCheckIn: async (eventId: string, profileId: string): Promise<void> => {
    const { error } = await supabase.rpc('revoke_event_checkin', {
      p_event_id: eventId,
      p_profile_id: profileId,
    });
    if (error) throw venueError(error.message);
  },

  // ==========================================================================
  // ANÁLISIS
  // ==========================================================================

  getDemographics: async (eventId: string): Promise<DemographicBucket[]> => {
    const { data, error } = await supabase.rpc('get_event_demographics', { p_event_id: eventId });
    if (error) throw venueError(error.message);

    return (data ?? []).map((row) => ({
      bucket: row.bucket,
      gender: row.gender,
      people: Number(row.people),
    }));
  },

  getWeekdayStats: async (venueId: string, since?: Date): Promise<WeekdayStats[]> => {
    const { data, error } = await supabase.rpc('get_venue_weekday_stats', {
      p_venue_id: venueId,
      p_since: since?.toISOString() ?? null,
    });
    if (error || !data) return [];

    return data.map((row) => ({
      weekday: Number(row.weekday),
      events: Number(row.events),
      avgCheckIns: Number(row.avg_check_ins),
      avgMatches: Number(row.avg_matches),
      bestTheme: row.best_theme,
    }));
  },

  getDropoff: async (eventId: string): Promise<DropoffPoint[]> => {
    const { data, error } = await supabase.rpc('get_event_dropoff', { p_event_id: eventId });
    if (error || !data) return [];

    return data.map((row) => ({
      hour: row.hour,
      present: Number(row.present),
      arrived: Number(row.arrived),
      left: Number(row.left_count),
    }));
  },

  // ==========================================================================
  // PLAN
  // ==========================================================================

  getPlanStatus: async (): Promise<VenuePlanStatus | null> => {
    const { data, error } = await supabase.rpc('get_venue_plan_status');
    if (error || !data?.[0]) return null;

    const row = data[0];
    return {
      plan: row.plan as VenuePlanStatus['plan'],
      status: row.status,
      expiresAt: row.expires_at,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      activeEvents: Number(row.active_events),
      maxActiveEvents: row.max_active_events,
      teamMembers: Number(row.team_members),
      maxTeamMembers: row.max_team_members,
      promoterCodes: row.promoter_codes,
      demographics: row.demographics,
      promotions: row.promotions,
      csvExport: row.csv_export,
    };
  },

  /**
   * Abre la pasarela para contratar un plan.
   *
   * El botón de «elegir plan» no hacía nada: los límites estaban puestos y se
   * aplicaban en la base de datos, pero no había forma de pagar, así que
   * cambiar de plan era una gestión manual.
   *
   * La suscripción no se activa aquí sino en el webhook, cuando Stripe confirma
   * el cobro: una sesión de pago abandonada no puede dejar el plan activado.
   *
   * Devuelve `null` si Stripe no está configurado todavía, para que la interfaz
   * pueda decirlo en lugar de quedarse esperando.
   */
  startPlanCheckout: async (plan: 'pro' | 'business'): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
      'stripe-checkout',
      {
        body: {
          plan: `venue_${plan}`,
          returnUrl: `${window.location.origin}/venue/dashboard`,
        },
      },
    );

    if (error) throw new ApiError('CHECKOUT_FAILED', 'venue.plan.checkoutFailed');
    if (data?.error === 'STRIPE_NOT_CONFIGURED') return null;
    if (!data?.url) throw new ApiError('CHECKOUT_FAILED', 'venue.plan.checkoutFailed');

    return data.url;
  },

  // ==========================================================================
  // AVISOS
  // ==========================================================================

  /**
   * Encola un aviso para quien está en el evento.
   *
   * Sin `eventId` va a toda la aplicación, y eso sólo lo puede hacer
   * administración: el servidor lo comprueba, no se confía en la interfaz.
   */
  queueBroadcast: async (
    title: string,
    body: string,
    eventId?: string,
    scheduledAt?: string | null,
  ): Promise<string> => {
    const { data, error } = await supabase.rpc('queue_broadcast', {
      p_title: title,
      p_body: body,
      p_event_id: eventId ?? null,
      p_url: null,
      p_scheduled_at: scheduledAt ?? null,
    });

    if (error) throw venueError(error.message);
    return data as string;
  },

  /** Anula un aviso programado que todavía no ha salido. */
  cancelBroadcast: async (broadcastId: string): Promise<void> => {
    const { error } = await supabase.rpc('cancel_broadcast', { p_broadcast_id: broadcastId });
    if (error) throw venueError(error.message);
  },

  /** Cuántos avisos programados puede tener el local a la vez. */
  getScheduledBroadcastLimit: async (venueId: string): Promise<number> => {
    const { data } = await supabase.rpc('venue_scheduled_broadcast_limit', { p_venue_id: venueId });
    return Number(data ?? 1);
  },

  getBroadcasts: async (eventId?: string): Promise<Broadcast[]> => {
    let query = supabase
      .from('broadcasts')
      .select('id, title, body, status, recipients, created_at, sent_at, scheduled_at, audience')
      .order('created_at', { ascending: false })
      .limit(20);

    if (eventId) query = query.eq('event_id', eventId);

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      status: row.status as Broadcast['status'],
      recipients: row.recipients,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      scheduledAt: row.scheduled_at,
      audience: (row.audience ?? 'inside') as BroadcastAudience,
    }));
  },

  /** Aviso a un público del local (Pro y Business salvo «inside»). */
  queueAudienceBroadcast: async (
    audience: BroadcastAudience,
    title: string,
    body: string,
    eventId: string,
    scheduledAt?: string | null,
  ): Promise<string> => {
    const { data, error } = await supabase.rpc('queue_audience_broadcast', {
      p_audience: audience,
      p_title: title,
      p_body: body,
      p_event_id: eventId,
      p_scheduled_at: scheduledAt ?? null,
    } as never);
    if (error) throw venueError(error.message);
    return data as string;
  },

  /** Cuántas personas recibirían un aviso a ese público. */
  countAudience: async (audience: BroadcastAudience, eventId: string): Promise<number | null> => {
    const { data, error } = await supabase.rpc('count_broadcast_audience', {
      p_audience: audience,
      p_event_id: eventId,
    });
    return error ? null : Number(data ?? 0);
  },

  /** Previsión de asistencia de un evento (todos los planes). */
  getForecast: async (eventId: string): Promise<EventForecast | null> => {
    const { data, error } = await supabase.rpc('get_event_forecast', { p_event_id: eventId });
    const row = !error && data?.[0];
    if (!row) return null;
    return {
      intents: row.intents,
      pastNights: row.past_nights,
      expectedCheckins: row.expected_checkins,
      expectedTotal: row.expected_total,
      low: row.low,
      high: row.high,
      capacity: row.capacity,
      confidence: row.confidence as EventForecast['confidence'],
      fullRisk: row.full_risk,
    };
  },

  setRotation: async (venueId: string, minutes: number | null): Promise<void> => {
    const { error } = await supabase
      .from('event_codes')
      .update({ rotates_every_minutes: minutes })
      .eq('venue_id', venueId)
      .eq('active', true);

    if (error) throw new ApiError('ROTATION_FAILED', 'errors.generic');
  },
};
