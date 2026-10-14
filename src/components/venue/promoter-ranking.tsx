import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Check, ChevronDown, Loader2, PartyPopper, Trophy } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { periodFrom, PromoterRankingRow, PromoterTeam, promotersService, RankingPeriod, TEAM_CHIP } from '@/services/promoters';
import { euros } from '@/services/tickets';
import { artistInitials } from '@/lib/lineup';
import type { Event } from '@/types/venue';
import { cn } from '@/lib/utils';
import { TeamTag } from './promoter-teams';

const PERIODOS: RankingPeriod[] = ['week', 'month', 'quarter', 'year', 'all'];
const MEDALLAS = ['text-amber-500', 'text-zinc-400', 'text-orange-600'];

interface PromoterRankingProps {
  events: Event[];
  teams: PromoterTeam[];
  /** Columna «Recaudado»: sólo con venta de entradas (Business). */
  showMoney: boolean;
  /** Se vuelve a pedir cuando cambian los equipos. */
  version?: number;
}

/**
 * Ranking de RRPP (migración 106), según el diseño «Recount»: quién mete más
 * gente, con filtros de fecha, eventos y equipo, y la fila de totales arriba.
 */
const PromoterRanking = ({ events, teams, showMoney, version = 0 }: PromoterRankingProps) => {
  const { t } = useTranslation();
  const [periodo, setPeriodo] = useState<RankingPeriod>('month');
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [equipo, setEquipo] = useState<string | null>(null);
  const [filas, setFilas] = useState<PromoterRankingRow[] | null>(null);

  const delPeriodo = useMemo(() => {
    const desde = periodFrom(periodo);
    return events
      .filter((e) => !desde || new Date(e.startDate) >= desde)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [events, periodo]);

  useEffect(() => {
    let vivo = true;
    setFilas(null);
    void promotersService
      .getRanking({ from: periodFrom(periodo), eventIds: elegidos, teamId: equipo })
      .then((r) => vivo && setFilas(r));
    return () => {
      vivo = false;
    };
  }, [periodo, elegidos, equipo, version]);

  const total = useMemo(
    () =>
      (filas ?? []).reduce(
        (acc, f) => ({ entered: acc.entered + f.entered, listed: acc.listed + f.listed, revenue: acc.revenue + f.revenueCents }),
        { entered: 0, listed: 0, revenue: 0 },
      ),
    [filas],
  );
  const conDatos = (filas ?? []).filter((f) => f.entered > 0 || f.listed > 0 || f.revenueCents > 0);
  const sinDatos = (filas ?? []).filter((f) => !(f.entered > 0 || f.listed > 0 || f.revenueCents > 0));
  // En el móvil «Apuntados» va debajo del nombre y no hay avatar: si no, el nombre no cabe.
  const columnas = showMoney
    ? 'grid-cols-[1.25rem_minmax(0,1fr)_2.75rem_4.5rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_3.5rem_4.5rem_5rem]'
    : 'grid-cols-[1.25rem_minmax(0,1fr)_2.75rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_3.5rem_4.5rem]';
  const fecha = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <section className="surface-light space-y-3 rounded-2xl p-4">
      <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
        <Trophy size={17} className="text-party-primary" />
        {t('venue.promoters.rankingTitle')}
      </h3>

      {/* ---------------------------------------------------------- filtros */}
      <div className="flex flex-wrap gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="press flex h-10 items-center gap-1.5 rounded-full bg-black/[0.05] px-3.5 text-caption font-bold">
              <CalendarDays size={15} />
              {t(`venue.promoters.period.${periodo}`)}
              <ChevronDown size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-1">
            {PERIODOS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPeriodo(p);
                  setElegidos([]);
                }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-body-sm hover:bg-accent"
              >
                {t(`venue.promoters.period.${p}`)}
                {periodo === p && <Check size={14} />}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="press flex h-10 items-center gap-1.5 rounded-full bg-black/[0.05] px-3.5 text-caption font-bold">
              <PartyPopper size={15} />
              {elegidos.length ? t('venue.promoters.eventsSelected', { count: elegidos.length }) : t('venue.promoters.allEvents')}
              <ChevronDown size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-72 w-72 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => setElegidos([])}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-body-sm font-bold hover:bg-accent"
            >
              {t('venue.promoters.allEvents')}
              {elegidos.length === 0 && <Check size={14} />}
            </button>
            {delPeriodo.map((e) => {
              const dentro = elegidos.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setElegidos((l) => (dentro ? l.filter((x) => x !== e.id) : [...l, e.id]))}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-body-sm hover:bg-accent"
                >
                  <span className="min-w-0 truncate">
                    {e.name} <span className="text-muted-foreground">· {fecha(e.startDate)}</span>
                  </span>
                  {dentro && <Check size={14} className="shrink-0" />}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>

        {teams.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setEquipo(null)}
              className={cn('press h-10 rounded-full px-3.5 text-caption font-bold', equipo === null ? 'bg-ink text-white' : 'bg-black/[0.05]')}
            >
              {t('venue.promoters.allTeams')}
            </button>
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => setEquipo(equipo === team.id ? null : team.id)}
                className={cn(
                  'press h-10 rounded-full px-3.5 text-caption font-bold',
                  equipo === team.id ? 'bg-ink text-white' : TEAM_CHIP[team.color],
                )}
              >
                #{team.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------- tabla */}
      {filas === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-party-gray" />
        </div>
      ) : conDatos.length === 0 && sinDatos.length === 0 ? (
        <p className="py-4 text-center text-body-sm text-party-gray">{t('venue.promoters.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/[0.06]">
          <div className={cn('grid items-center gap-1.5 bg-black/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink/50 sm:gap-2 sm:text-[11px]', columnas)}>
            <span />
            <span>{t('venue.promoters.colName')}</span>
            <span className="text-right">{t('venue.promoters.colEntered')}</span>
            <span className="hidden text-right sm:block">{t('venue.promoters.colListed')}</span>
            {showMoney && <span className="text-right">{t('venue.promoters.colRevenue')}</span>}
          </div>
          {/* Totales */}
          <div className={cn('grid items-center gap-1.5 border-b border-black/[0.06] bg-black/[0.06] px-3 py-2.5 font-display text-title-card sm:gap-2', columnas)}>
            <span />
            <span className="min-w-0">
              <span className="block text-caption font-bold uppercase tracking-wide text-ink/60">{t('venue.promoters.total')}</span>
              <span className="block font-sans text-caption text-party-gray sm:hidden">
                {t('venue.promoters.listedCount', { count: total.listed })}
              </span>
            </span>
            <span className="text-right tabular">{total.entered}</span>
            <span className="hidden text-right tabular sm:block">{total.listed}</span>
            {showMoney && <span className="text-right tabular">{euros(total.revenue)}</span>}
          </div>
          <ol>
            {[...conDatos, ...sinDatos].map((f, i) => (
              <li
                key={f.linkId ?? `n-${f.name}`}
                className={cn(
                  'grid items-center gap-1.5 border-b border-black/[0.04] px-3 py-2.5 last:border-0 sm:gap-2',
                  columnas,
                  i >= conDatos.length && 'opacity-50',
                )}
              >
                <span className={cn('font-display text-title-card', MEDALLAS[i] ?? 'text-ink/40', i >= conDatos.length && 'invisible')}>
                  {i + 1}.
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-party-primary sm:flex">
                    {artistInitials(f.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-bold">{f.name}</span>
                    <span className="block text-caption text-party-gray sm:hidden">
                      {t('venue.promoters.listedCount', { count: f.listed })}
                    </span>
                    {f.teamIds.length > 0 && (
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {teams
                          .filter((x) => f.teamIds.includes(x.id))
                          .map((x) => (
                            <TeamTag key={x.id} team={x} />
                          ))}
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-right font-display text-title-card tabular">{f.entered}</span>
                <span className="hidden text-right tabular text-ink/70 sm:block">{f.listed}</span>
                {showMoney && <span className="text-right text-body-sm font-bold tabular">{euros(f.revenueCents)}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="text-caption text-party-gray">{t('venue.promoters.rankingHelp')}</p>
    </section>
  );
};

export default PromoterRanking;
