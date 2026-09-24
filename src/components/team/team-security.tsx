import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, DoorClosed, DoorOpen, Flag, Loader2, ScanLine, ShieldCheck, UserMinus } from 'lucide-react';
import DoorCounter from '@/components/venue/door-counter';
import TicketValidator from '@/components/venue/ticket-validator';
import VenueGuestLists, { GuestListDoor } from '@/components/venue/venue-guest-lists';
import VenueSosAlerts from '@/components/venue/venue-sos-alerts';
import VenueSosAlarm from '@/components/venue/venue-sos-alarm';
import { useToast } from '@/components/ui/use-toast';
import { TeamTab, TeamTabs, useTeamSos } from '@/components/team/team-bits';
import { CounterError, CounterState, CounterTransport } from '@/services/door-counter';
import { ApiError } from '@/services/api';
import { TeamLinkClient, TeamLinkError, TeamLinkState } from '@/services/team';
import type { GuestEntry, GuestList } from '@/services/guest-lists';
import type { TicketKind, ValidatedTicket } from '@/services/tickets';
import { cn } from '@/lib/utils';

const FALLBACK_AVATAR = '/placeholder.svg';

/** Errores del contador que no se arreglan reintentando. */
const FINALES = ['EVENT_NOT_LIVE', 'CAPACITY_REQUIRED', 'INVALID_TOTAL', 'INVALID_DELTA'];

interface Occupancy {
  inside: number;
  capacity: number | null;
  headcount: number | null;
  headcount_at: string | null;
}

interface ListRow {
  id: string;
  name: string;
  kind: 'app' | 'promoter';
  entries: number;
  people: number;
  admitted: number;
}

interface EntryRow {
  id: string;
  list_id: string;
  name: string;
  companions: number;
  admitted: number;
  from_app: boolean;
  created_at: string;
}

interface ReportRow {
  report_id: string;
  reported_profile_id: string;
  reported_name: string;
  reported_photo: string | null;
  report_type: string;
  reports_total: number;
}

type Tab = 'door' | 'lists' | 'tickets' | 'reports';

/**
 * Seguridad con su enlace de la noche: alertas de ayuda con sirena, aforo,
 * abrir y cerrar la puerta, listas de invitados (buscar y dar entrada),
 * entradas compradas y denuncias. Nada de dinero ni estadísticas.
 */
const TeamSecurity = ({
  client,
  state,
  onInvalid,
}: {
  client: TeamLinkClient;
  state: TeamLinkState;
  onInvalid: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const eventId = state.event?.id ?? '';
  const sos = useTeamSos(client, eventId);

  const [tab, setTab] = useState<Tab>('door');
  const [cerrada, setCerrada] = useState<string | null>(state.event?.entryClosedAt ?? null);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof TeamLinkError) {
        onInvalid();
        return;
      }
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    },
    [onInvalid, t, toast],
  );

  // ---------------------------------------------------------------- aforo
  const transport = useMemo<CounterTransport>(() => {
    const final = (error: unknown): never => {
      if (error instanceof TeamLinkError) throw new CounterError('INVALID_LINK');
      if (error instanceof ApiError && FINALES.includes(error.code)) throw new CounterError(error.code);
      throw error;
    };
    return {
      key: `team:${eventId}`,
      load: async (): Promise<CounterState> => {
        try {
          const o = await client.call<Occupancy>('occupancy');
          return {
            total: o.headcount ?? 0,
            capacity: o.capacity,
            inside: Number(o.inside ?? 0),
            updatedAt: o.headcount_at,
          };
        } catch (error) {
          return final(error);
        }
      },
      adjust: async (delta) => {
        try {
          return await client.call<{ total: number }>('count', { delta });
        } catch (error) {
          return final(error);
        }
      },
      set: async (total) => {
        try {
          return await client.call<{ total: number }>('count', { total });
        } catch (error) {
          return final(error);
        }
      },
    };
  }, [client, eventId]);

  const puerta = async () => {
    setBusy(true);
    try {
      const r = await client.call<{ entryClosedAt: string | null }>('entry', { open: Boolean(cerrada) });
      setCerrada(r.entryClosedAt);
      toast({ title: t(r.entryClosedAt ? 'team.security.closed' : 'team.security.opened') });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  // --------------------------------------------------------------- listas
  const door = useMemo<GuestListDoor>(
    () => ({
      load: async () => {
        const r = await client.call<{ lists: ListRow[]; entries: EntryRow[] }>('guests');
        const lists: GuestList[] = (r.lists ?? []).map((l) => ({
          id: l.id,
          name: l.name,
          kind: l.kind,
          entries: l.entries,
          people: l.people,
          admitted: l.admitted,
        }));
        const entries: GuestEntry[] = (r.entries ?? []).map((e) => ({
          id: e.id,
          listId: e.list_id,
          name: e.name,
          companions: e.companions,
          admitted: e.admitted,
          fromApp: e.from_app,
          createdAt: e.created_at,
        }));
        return { lists, entries };
      },
      admit: async (entryId, count) => {
        await client.call('admit', { entryId, count });
      },
    }),
    [client],
  );

  // -------------------------------------------------------------- entradas
  const validarEntrada = useCallback(
    async (code: string): Promise<ValidatedTicket> => {
      const r = await client.call<{
        kind: TicketKind;
        type_name: string;
        holder_name: string;
        event_name: string;
        guests: number | null;
        already_used: boolean;
        used_at: string | null;
      }>('ticket', { code });
      return {
        kind: r.kind,
        typeName: r.type_name,
        holderName: r.holder_name,
        eventName: r.event_name,
        guests: r.guests,
        alreadyUsed: r.already_used,
        usedAt: r.used_at,
      };
    },
    [client],
  );

  // ------------------------------------------------------------- denuncias
  const cargarDenuncias = useCallback(async () => {
    try {
      setReports(await client.call<ReportRow[]>('reports'));
    } catch (error) {
      fail(error);
    }
  }, [client, fail]);

  useEffect(() => {
    void cargarDenuncias();
    const interval = setInterval(() => void cargarDenuncias(), 30_000);
    return () => clearInterval(interval);
  }, [cargarDenuncias]);

  const retirar = async (report: ReportRow) => {
    if (!window.confirm(t('team.security.revokeConfirm', { name: report.reported_name }))) return;
    setBusy(true);
    try {
      await client.call('revoke', { profileId: report.reported_profile_id });
      toast({ title: t('venue.door.revoked', { name: report.reported_name }) });
      await cargarDenuncias();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const abiertas = sos.alerts.filter((a) => !a.handledAt).length;
  const tabs: TeamTab<Tab>[] = [
    { id: 'door', label: t('team.tabs.door'), icon: ShieldCheck, badge: abiertas },
    { id: 'lists', label: t('team.tabs.lists'), icon: ClipboardList },
    ...(state.features.tickets ? [{ id: 'tickets' as const, label: t('team.tabs.tickets'), icon: ScanLine }] : []),
    { id: 'reports', label: t('team.tabs.reports'), icon: Flag, badge: reports?.length ?? 0 },
  ];

  return (
    <>
      <VenueSosAlarm sos={sos} onOpenDoor={() => setTab('door')} />
      <TeamTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as Tab)} />

      {tab === 'door' && (
        <div className="space-y-4">
          <VenueSosAlerts sos={sos} />

          <div className="surface-light flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <p className="flex items-center gap-2 font-bold">
              {cerrada ? <DoorClosed size={18} className="text-destructive" /> : <DoorOpen size={18} className="text-emerald-600" />}
              {t(cerrada ? 'team.security.entryClosed' : 'team.security.entryOpen')}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void puerta()}
              className={cn(
                'press h-10 rounded-xl px-4 text-caption font-extrabold uppercase disabled:opacity-50',
                cerrada ? 'bg-emerald-600 text-white' : 'bg-destructive text-white',
              )}
            >
              {t(cerrada ? 'team.security.openEntry' : 'team.security.closeEntry')}
            </button>
          </div>

          <DoorCounter transport={transport} variant="full" onFatal={(code) => code === 'INVALID_LINK' && onInvalid()} />
        </div>
      )}

      {tab === 'lists' && <VenueGuestLists eventId={eventId} door={door} />}

      {tab === 'tickets' && <TicketValidator validate={validarEntrada} />}

      {tab === 'reports' && (
        <div className="surface-light rounded-2xl p-4">
          <h3 className="mb-1 font-display text-title-card uppercase tracking-wide">{t('venue.door.reportsTitle')}</h3>
          <p className="mb-3 text-caption text-party-gray">{t('venue.door.reportsSubtitle')}</p>
          {reports === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
            </div>
          ) : reports.length === 0 ? (
            <p className="py-4 text-center text-body-sm text-party-gray">{t('team.security.noReports')}</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((report) => (
                <li key={report.report_id} className="flex items-center gap-3 rounded-xl bg-black/[0.03] p-3">
                  <img
                    src={report.reported_photo || FALLBACK_AVATAR}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-md font-bold">{report.reported_name}</p>
                    <p className="truncate text-caption text-party-gray">
                      {t(`report.reasons.${report.report_type}`, { defaultValue: report.report_type })}
                      {report.reports_total > 1 ? ` · ${t('venue.door.reportsTotal', { count: report.reports_total })}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void retirar(report)}
                    className="press flex h-9 shrink-0 items-center gap-1 rounded-lg border border-destructive px-2.5 text-caption font-bold text-destructive disabled:opacity-50"
                  >
                    <UserMinus size={13} />
                    {t('venue.door.revokeAccess')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
};

export default TeamSecurity;
