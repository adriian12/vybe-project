import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Loader2, Users } from 'lucide-react';
import { periodFrom, PromoterRankingRow, PromoterTeam, promotersService, RankingPeriod, TEAM_DOT } from '@/services/promoters';
import { euros } from '@/services/tickets';
import { cn } from '@/lib/utils';

const PERIODOS: RankingPeriod[] = ['week', 'month', 'quarter', 'year', 'all'];

interface Bloque {
  key: string;
  name: string;
  team: PromoterTeam | null;
  rows: PromoterRankingRow[];
}

const suma = (rows: PromoterRankingRow[]) =>
  rows.reduce(
    (a, r) => ({
      revenue: a.revenue + r.revenueCents,
      commission: a.commission + r.commissionCents,
      paid: a.paid + r.paidCents,
      entered: a.entered + r.entered,
    }),
    { revenue: 0, commission: 0, paid: 0, entered: 0 },
  );

/**
 * Dinero de los RRPP por equipos (Ventas → Comisiones RRPP): lo recaudado, la
 * comisión, lo pagado y lo pendiente de cada equipo, con el desglose de sus
 * RRPP. Un RRPP que está en dos equipos suma en los dos; el total de arriba
 * cuenta a cada uno una sola vez.
 */
const PromoterTeamMoney = () => {
  const { t } = useTranslation();
  const [periodo, setPeriodo] = useState<RankingPeriod>('month');
  const [teams, setTeams] = useState<PromoterTeam[]>([]);
  const [filas, setFilas] = useState<PromoterRankingRow[] | null>(null);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void promotersService.getTeams().then(setTeams);
  }, []);

  useEffect(() => {
    let vivo = true;
    setFilas(null);
    void promotersService.getRanking({ from: periodFrom(periodo) }).then((r) => vivo && setFilas(r));
    return () => {
      vivo = false;
    };
  }, [periodo]);

  const activos = useMemo(() => (filas ?? []).filter((r) => r.entered > 0 || r.revenueCents > 0 || r.commissionCents > 0), [filas]);

  const bloques = useMemo<Bloque[]>(() => {
    const out: Bloque[] = teams
      .map((team) => ({ key: team.id, name: team.name, team, rows: activos.filter((r) => r.teamIds.includes(team.id)) }))
      .filter((b) => b.rows.length > 0);
    const sueltos = activos.filter((r) => r.teamIds.length === 0);
    if (sueltos.length) out.push({ key: 'none', name: t('venue.promoters.noTeam'), team: null, rows: sueltos });
    return out.sort((a, b) => suma(b.rows).revenue - suma(a.rows).revenue);
  }, [teams, activos, t]);

  const total = suma(activos);

  return (
    <section className="surface-light space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
          <Users size={17} className="text-party-primary" />
          {t('venue.promoters.byTeam')}
        </h3>
        <div className="flex flex-wrap gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              className={cn(
                'press h-8 rounded-full px-3 text-caption font-bold',
                periodo === p ? 'bg-ink text-white' : 'bg-black/[0.05] text-ink/70',
              )}
            >
              {t(`venue.promoters.periodShort.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {filas === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-party-gray" />
        </div>
      ) : activos.length === 0 ? (
        <p className="py-3 text-center text-body-sm text-party-gray">{t('venue.promoters.empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [t('venue.promoters.colRevenue'), euros(total.revenue)],
              [t('venue.promoters.colCommission'), euros(total.commission)],
              [t('venue.promoters.colPaid'), euros(total.paid)],
              [t('venue.promoters.colPending'), euros(Math.max(0, total.commission - total.paid))],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-black/[0.04] p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink/50">{k}</p>
                <p className="font-display text-title-card tabular">{v}</p>
              </div>
            ))}
          </div>

          <ul className="space-y-2">
            {bloques.map((b) => {
              const s = suma(b.rows);
              const abierto = abiertos[b.key];
              return (
                <li key={b.key} className="overflow-hidden rounded-xl border border-black/[0.08]">
                  <button
                    type="button"
                    aria-expanded={abierto}
                    onClick={() => setAbiertos((a) => ({ ...a, [b.key]: !a[b.key] }))}
                    className="press flex w-full items-center gap-2 px-3 py-3 text-left"
                  >
                    <span className={cn('h-3 w-3 shrink-0 rounded-full', b.team ? TEAM_DOT[b.team.color] : 'bg-zinc-300')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{b.team ? `#${b.name}` : b.name}</span>
                      <span className="block text-caption text-party-gray">
                        {t('venue.promoters.rrppCount', { count: b.rows.length })} · {t('venue.promoters.enteredCount', { count: s.entered })}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-display text-title-card tabular">{euros(s.revenue)}</span>
                      <span className="block text-caption text-party-gray tabular">
                        {t('venue.promoters.commissionShort', { amount: euros(s.commission) })}
                      </span>
                    </span>
                    <ChevronDown size={16} className={cn('shrink-0 transition-transform', abierto && 'rotate-180')} />
                  </button>
                  {abierto && (
                    <ul className="divide-y divide-black/[0.05] border-t border-black/[0.06] bg-black/[0.02]">
                      {b.rows.map((r) => (
                        <li key={r.linkId ?? r.name} className="flex items-center gap-3 px-3 py-2 text-body-sm">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold">{r.name}</span>
                            <span className="block text-caption text-party-gray">
                              {t('venue.promoters.enteredCount', { count: r.entered })}
                            </span>
                          </span>
                          <span className="text-right tabular">
                            <span className="block font-bold">{euros(r.revenueCents)}</span>
                            <span className="block text-caption text-party-gray">
                              {t('venue.promoters.commissionShort', { amount: euros(r.commissionCents) })}
                            </span>
                            {r.commissionCents > r.paidCents && (
                              <span className="block text-[11px] font-bold text-destructive">
                                {t('venue.promoters.pendingShort', { amount: euros(r.commissionCents - r.paidCents) })}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-caption text-party-gray">{t('venue.promoters.byTeamHelp')}</p>
        </>
      )}
    </section>
  );
};

export default PromoterTeamMoney;
