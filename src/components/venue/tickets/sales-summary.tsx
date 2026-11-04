import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { euros } from '@/services/tickets';
import { SalesDashboard, salesDashboardService } from '@/services/sales-dashboard';
import { cn } from '@/lib/utils';

/**
 * Ventas → Resumen (Business, migración 131): todo el local en un periodo, o
 * sólo la fiesta elegida arriba. Facturación por fecha en barras apiladas
 * (General / VIP / Mesas), mejores días y una fila por fiesta.
 */

type Periodo = 'd7' | 'd30' | 'd90' | 'year';
const DIAS: Record<Periodo, number> = { d7: 7, d30: 30, d90: 90, year: 365 };

const COLORES = { entry: 'bg-party-primary', vip: 'bg-amber-500', table: 'bg-ink/70' } as const;

interface Props {
  eventId: string | null;
  eventName?: string | null;
  canExport: boolean;
}

const fecha = (day: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, opts);

const SalesSummary = ({ eventId, eventName, canExport }: Props) => {
  const { t } = useTranslation();
  const [periodo, setPeriodo] = useState<Periodo>('d30');
  const [soloFiesta, setSoloFiesta] = useState(false);
  const [datos, setDatos] = useState<SalesDashboard | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    const hasta = new Date(Date.now() + 60_000);
    // Con una fiesta elegida, todo su historial de ventas (hasta 400 días).
    const desde = new Date(hasta.getTime() - (soloFiesta ? 399 : DIAS[periodo]) * 86_400_000);
    setCargando(true);
    setError(false);
    salesDashboardService
      .get(desde, hasta, soloFiesta ? eventId : null)
      .then((d) => vivo && setDatos(d))
      .catch(() => vivo && setError(true))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [periodo, soloFiesta, eventId]);

  const dias = useMemo(() => datos?.by_day ?? [], [datos]);
  const maxDia = Math.max(1, ...dias.map((d) => d.entry + d.vip + d.table));
  const mejores = useMemo(
    () => [...dias].sort((a, b) => b.entry + b.vip + b.table - (a.entry + a.vip + a.table)).slice(0, 5),
    [dias],
  );

  const exportar = () => {
    if (!datos) return;
    const filas = [
      ['fecha', 'general_eur', 'vip_eur', 'mesas_eur', 'entradas'],
      ...dias.map((d) => [d.day, (d.entry / 100).toFixed(2), (d.vip / 100).toFixed(2), (d.table / 100).toFixed(2), String(d.tickets)]),
    ];
    const csv = filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas-${soloFiesta && eventName ? eventName : periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const k = datos?.kpis;
  const kpis = k
    ? [
        { label: t('sales.summary.revenue'), value: euros(k.revenue_cents), hint: t('sales.summary.orders', { count: k.orders }) },
        { label: t('sales.summary.tickets'), value: String(k.tickets), hint: k.comps > 0 ? `${t('sales.summary.comps')}: ${k.comps}` : '' },
        { label: t('sales.summary.avg'), value: euros(k.orders ? Math.round(k.revenue_cents / k.orders) : 0), hint: '' },
        {
          label: t('sales.summary.entered'),
          value: String(k.entered),
          hint: k.tickets + k.comps > 0 ? t('sales.summary.enteredHint', { pct: Math.round((k.entered / (k.tickets + k.comps)) * 100) }) : '',
        },
        {
          label: t('sales.summary.refunds'),
          value: String(k.refunded_orders),
          hint: k.refunded_orders > 0 ? euros(k.refunded_cents) : t('sales.summary.noRefunds'),
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn('flex rounded-xl bg-black/[0.05] p-1', soloFiesta && 'opacity-40')} role="group">
          {(Object.keys(DIAS) as Periodo[]).map((p) => (
            <button
              key={p}
              type="button"
              disabled={soloFiesta}
              aria-pressed={periodo === p}
              onClick={() => setPeriodo(p)}
              className={cn(
                'press h-9 rounded-lg px-3 text-caption font-bold',
                periodo === p ? 'bg-white text-ink shadow-sm' : 'text-party-gray',
              )}
            >
              {t(`sales.summary.period.${p}`)}
            </button>
          ))}
        </div>
        {eventId && (
          <label className="flex items-center gap-2 text-body-sm font-semibold">
            <Switch checked={soloFiesta} onCheckedChange={setSoloFiesta} />
            {t('sales.summary.onlyEvent')}
          </label>
        )}
        {canExport && datos && dias.length > 0 && (
          <button
            type="button"
            onClick={exportar}
            className="press ml-auto flex h-9 items-center gap-1.5 rounded-lg border border-black/15 px-3 text-caption font-bold"
          >
            <Download size={14} />
            {t('sales.summary.csv')}
          </button>
        )}
      </div>

      {cargando && !datos && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
        </div>
      )}
      {error && <p className="text-body-sm text-destructive">{t('sales.summary.error')}</p>}

      {datos && (
        <div className={cn('space-y-4 transition-opacity', cargando && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="surface-light rounded-2xl p-4">
                <p className="text-caption uppercase tracking-wide text-party-gray">{kpi.label}</p>
                <p className="mt-1 font-display text-headline-md tabular">{kpi.value}</p>
                <p className="mt-0.5 truncate text-caption text-party-gray">{kpi.hint || ' '}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <div className="surface-light rounded-2xl p-4 lg:col-span-8">
              <h3 className="font-display text-title-card uppercase tracking-wide">{t('sales.summary.byDay')}</h3>
              {dias.length === 0 ? (
                <p className="mt-3 text-body-sm text-party-gray">{t('sales.summary.empty')}</p>
              ) : (
                <>
                  <div className="mt-4 flex h-44 items-end gap-1" role="img" aria-label={t('sales.summary.byDay')}>
                    {dias.map((d) => {
                      const total = d.entry + d.vip + d.table;
                      return (
                        <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
                          <div
                            className="flex w-full flex-col-reverse overflow-hidden rounded-t-md"
                            style={{ height: `${Math.max((total / maxDia) * 100, 4)}%` }}
                          >
                            {(['entry', 'vip', 'table'] as const).map((kind) =>
                              d[kind] > 0 ? (
                                <div key={kind} className={COLORES[kind]} style={{ height: `${(d[kind] / total) * 100}%` }} />
                              ) : null,
                            )}
                          </div>
                          <span className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-caption text-white group-hover:block">
                            {fecha(d.day)} · {euros(total)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-between text-caption text-party-gray">
                    <span>{fecha(dias[0].day)}</span>
                    <span>{fecha(dias[dias.length - 1].day)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-party-gray">
                    {(['entry', 'vip', 'table'] as const).map((kind) => (
                      <span key={kind} className="inline-flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', COLORES[kind])} />
                        {t(`sales.summary.${kind}`)}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="surface-light rounded-2xl p-4 lg:col-span-4">
              <h3 className="font-display text-title-card uppercase tracking-wide">{t('sales.summary.topDays')}</h3>
              {mejores.length === 0 ? (
                <p className="mt-3 text-body-sm text-party-gray">{t('sales.summary.empty')}</p>
              ) : (
                <ol className="mt-2 divide-y divide-black/[0.06]">
                  {mejores.map((d, i) => (
                    <li key={d.day} className="flex items-center justify-between gap-3 py-2 text-body-sm">
                      <span className="capitalize">
                        <span className="mr-2 font-bold text-party-gray">{i + 1}</span>
                        {fecha(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span className="font-bold tabular">{euros(d.entry + d.vip + d.table)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {datos.events.length > 0 && (
            <div className="surface-light overflow-x-auto rounded-2xl p-4">
              <h3 className="font-display text-title-card uppercase tracking-wide">{t('sales.summary.events')}</h3>
              <table className="mt-2 w-full min-w-[520px] text-left text-body-sm">
                <thead className="text-caption uppercase tracking-wide text-party-gray">
                  <tr>
                    <th className="py-2 font-semibold">{t('sales.summary.eventCol')}</th>
                    <th className="py-2 text-right font-semibold">{t('sales.summary.revenue')}</th>
                    <th className="py-2 text-right font-semibold">{t('sales.summary.capacityCol')}</th>
                    <th className="py-2 text-right font-semibold">{t('sales.summary.entered')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {datos.events.map((e) => (
                    <tr key={e.event_id}>
                      <td className="max-w-[240px] truncate py-2 font-semibold">
                        {e.name}
                        <span className="ml-2 font-normal text-party-gray">
                          {new Date(e.start_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular">{euros(e.revenue_cents)}</td>
                      <td className="py-2 text-right tabular">{e.capacity ? `${e.tickets} / ${e.capacity}` : e.tickets}</td>
                      <td className="py-2 text-right tabular">{e.entered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SalesSummary;
