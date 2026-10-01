import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Armchair, Crown, Gift, Ticket } from 'lucide-react';
import { euros, TicketKind, TicketOrder, TicketSale } from '@/services/tickets';
import { dailySales, SALE_STATE_CLASS, saleState, ticketStats } from '@/lib/ticket-stats';
import { cn } from '@/lib/utils';

/**
 * Ventas → Gestión de entradas → Resumen: lo que un negocio mira primero en
 * cualquier plataforma de venta de entradas. Cuánto ha cobrado y cuánto le
 * queda, cuánto aforo lleva vendido, cómo van las ventas día a día, cada tipo
 * de entrada en qué punto está y los últimos pedidos.
 */

interface Props {
  ventas: TicketSale[];
  pedidos: TicketOrder[];
  eventEnded: boolean;
  onOpenOrders: () => void;
}

const ICONOS: Record<TicketKind, typeof Ticket> = { entry: Ticket, vip: Crown, table: Armchair };

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const TicketOverview = ({ ventas, pedidos, eventEnded, onOpenOrders }: Props) => {
  const { t } = useTranslation();
  const s = useMemo(() => ticketStats(ventas, pedidos), [ventas, pedidos]);
  const dias = useMemo(() => dailySales(pedidos), [pedidos]);
  const maxDia = Math.max(1, ...dias.map((d) => d.tickets));
  const ultimos = pedidos.filter((p) => p.status === 'paid').slice(0, 6);
  const ocupacion = s.capacity ? Math.min((s.sold + s.comps) / s.capacity, 1) : null;

  const kpis = [
    { label: t('sales.manage.kpi.gross'), value: euros(s.grossCents), hint: t('sales.manage.kpi.orders', { count: s.paidOrders }) },
    { label: t('sales.manage.kpi.net'), value: euros(s.netCents), hint: t('sales.manage.kpi.netHint') },
    {
      label: t('sales.manage.kpi.sold'),
      value: s.capacity ? `${s.sold + s.comps} / ${s.capacity}` : String(s.sold + s.comps),
      hint: s.comps > 0 ? t('sales.manage.kpi.withComps', { count: s.comps }) : t('sales.manage.kpi.noComps'),
    },
    {
      label: t('sales.manage.kpi.checkIn'),
      value: `${Math.round(s.checkInRate * 100)} %`,
      hint: t('sales.manage.kpi.validated', { count: s.validated }),
    },
    { label: t('sales.manage.kpi.avgOrder'), value: euros(s.avgOrderCents), hint: t('sales.manage.kpi.avgOrderHint') },
    {
      label: t('sales.manage.kpi.refunds'),
      value: String(s.refundedOrders),
      hint: s.refundedOrders > 0 ? euros(s.refundedCents) : t('sales.manage.kpi.noRefunds'),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="surface-light rounded-2xl p-4">
            <p className="text-caption uppercase tracking-wide text-party-gray">{k.label}</p>
            <p className="mt-1 font-display text-headline-md tabular">{k.value}</p>
            <p className="mt-0.5 truncate text-caption text-party-gray">{k.hint}</p>
          </div>
        ))}
      </div>

      {ocupacion !== null && (
        <div className="surface-light rounded-2xl p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-title-card uppercase tracking-wide">{t('sales.manage.capacity')}</h3>
            <p className="text-body-sm font-bold tabular">{Math.round(ocupacion * 100)} %</p>
          </div>
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-black/[0.08]">
            <div className="h-full bg-party-primary" style={{ width: `${(s.sold / (s.capacity ?? 1)) * 100}%` }} />
            <div className="h-full bg-amber-300" style={{ width: `${(s.comps / (s.capacity ?? 1)) * 100}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-party-gray">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-party-primary" />
              {t('sales.manage.legend.sold', { count: s.sold })}
            </span>
            {s.comps > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                {t('sales.manage.legend.comps', { count: s.comps })}
              </span>
            )}
            <span>{t('sales.manage.legend.left', { count: Math.max((s.capacity ?? 0) - s.sold - s.comps, 0) })}</span>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="surface-light rounded-2xl p-4 lg:col-span-7">
          <h3 className="font-display text-title-card uppercase tracking-wide">{t('sales.manage.daily')}</h3>
          {dias.length === 0 ? (
            <p className="mt-3 text-body-sm text-party-gray">{t('sales.manage.noSalesYet')}</p>
          ) : (
            <>
              <div className="mt-4 flex h-40 items-end gap-1" role="img" aria-label={t('sales.manage.daily')}>
                {dias.map((d) => (
                  <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
                    <div
                      className={cn('w-full rounded-t-md', d.tickets > 0 ? 'bg-party-primary' : 'bg-black/[0.06]')}
                      style={{ height: `${Math.max((d.tickets / maxDia) * 100, d.tickets > 0 ? 6 : 2)}%` }}
                    />
                    <span className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-caption text-white group-hover:block">
                      {new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ·{' '}
                      {t('sales.manage.tickets', { count: d.tickets })} · {euros(d.cents)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-caption text-party-gray">
                <span>{new Date(`${dias[0].day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                <span>
                  {new Date(`${dias[dias.length - 1].day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="surface-light rounded-2xl p-4 lg:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-title-card uppercase tracking-wide">{t('sales.manage.latest')}</h3>
            {ultimos.length > 0 && (
              <button type="button" onClick={onOpenOrders} className="text-caption font-bold underline">
                {t('sales.manage.seeAll')}
              </button>
            )}
          </div>
          {ultimos.length === 0 ? (
            <p className="mt-3 text-body-sm text-party-gray">{t('sales.noOrders')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-black/[0.06]">
              {ultimos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-bold">
                      {p.buyer || p.buyerEmail || '—'}
                      {p.source === 'comp' && <Gift size={12} className="ml-1.5 inline text-amber-600" />}
                    </p>
                    <p className="truncate text-caption text-party-gray">
                      {p.quantity} × {p.typeName} · {p.paidAt ? fechaCorta(p.paidAt) : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-body-sm font-bold tabular">
                    {p.source === 'comp' ? t('sales.manage.comp') : euros(p.amountCents)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="surface-light rounded-2xl p-4">
        <h3 className="mb-3 font-display text-title-card uppercase tracking-wide">{t('sales.manage.byType')}</h3>
        {ventas.length === 0 ? (
          <p className="text-body-sm text-party-gray">{t('sales.empty')}</p>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {ventas.map((v) => {
              const Icono = ICONOS[v.kind] ?? Ticket;
              const estado = saleState(v, eventEnded);
              const pct = v.capacity ? Math.min((v.sold / v.capacity) * 100, 100) : null;
              const parte = s.grossCents > 0 ? Math.round((v.revenueCents / s.grossCents) * 100) : 0;
              return (
                <li key={v.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-party-primary text-ink">
                    <Icono size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-body-md font-bold">{v.name}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-caption font-bold', SALE_STATE_CLASS[estado])}>
                        {t(`sales.manage.state.${estado}`)}
                      </span>
                    </div>
                    <p className="text-caption text-party-gray">
                      {v.priceCents ? euros(v.priceCents) : t('tickets.buy.free')} ·{' '}
                      {v.capacity ? t('sales.soldOf', { sold: v.sold, total: v.capacity }) : t('sales.soldCount', { count: v.sold })}
                      {v.comps > 0 ? ` · ${t('sales.manage.compsCount', { count: v.comps })}` : ''}
                      {estado === 'scheduled' && v.salesStartAt ? ` · ${t('sales.manage.startsAt', { date: fechaCorta(v.salesStartAt) })}` : ''}
                      {estado === 'onSale' && v.salesEndAt ? ` · ${t('sales.manage.endsAt', { date: fechaCorta(v.salesEndAt) })}` : ''}
                    </p>
                    {pct !== null && (
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08]">
                        <div className="h-full rounded-full bg-party-primary" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-body-sm font-bold tabular">{euros(v.revenueCents)}</p>
                    <p className="text-caption text-party-gray tabular">{parte} %</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TicketOverview;
