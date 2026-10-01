import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Download, Gift, Loader2, Mail, Search, Undo2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { euros, TicketOrder } from '@/services/tickets';
import { downloadCsv, slugFichero } from '@/lib/csv';
import { cn } from '@/lib/utils';

/**
 * Ventas → Gestión de entradas → Pedidos: todos los pedidos de la fiesta, con
 * búsqueda por nombre, correo o número, filtros, el detalle de cada uno,
 * reenviar el correo con las entradas, devolver y exportar a CSV.
 */

type Filtro = 'all' | 'paid' | 'comp' | 'refunded';

interface Props {
  pedidos: TicketOrder[];
  eventName: string;
  busy: string | null;
  onRefund: (pedido: TicketOrder) => void;
  onResend: (pedido: TicketOrder) => void;
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const TicketOrders = ({ pedidos, eventName, busy, onRefund, onResend }: Props) => {
  const { t } = useTranslation();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('all');
  const [abierto, setAbierto] = useState<string | null>(null);

  const cuenta = useMemo(
    () => ({
      all: pedidos.length,
      paid: pedidos.filter((p) => p.status === 'paid' && p.source !== 'comp').length,
      comp: pedidos.filter((p) => p.source === 'comp').length,
      refunded: pedidos.filter((p) => p.status === 'refunded').length,
    }),
    [pedidos],
  );

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (filtro === 'paid' && (p.status !== 'paid' || p.source === 'comp')) return false;
      if (filtro === 'comp' && p.source !== 'comp') return false;
      if (filtro === 'refunded' && p.status !== 'refunded') return false;
      if (!q) return true;
      return [p.buyer, p.buyerEmail, p.id, p.typeName, p.note].some((v) => v?.toLowerCase().includes(q));
    });
  }, [pedidos, busqueda, filtro]);

  const exportar = () =>
    downloadCsv(`pedidos-${slugFichero(eventName)}`, [
      ['Pedido', 'Fecha', 'Comprador', 'Correo', 'Tipo', 'Cantidad', 'Importe (EUR)', 'Neto (EUR)', 'Estado', 'Origen', 'Validadas', 'Nota'],
      ...lista.map((p) => [
        p.id.slice(0, 8).toUpperCase(),
        p.paidAt ? new Date(p.paidAt).toLocaleString() : '',
        p.buyer,
        p.buyerEmail ?? '',
        p.typeName,
        p.quantity,
        (p.amountCents / 100).toFixed(2),
        (p.netCents / 100).toFixed(2),
        p.status === 'refunded' ? 'Devuelto' : 'Pagado',
        p.source === 'comp' ? 'Invitación' : 'Online',
        p.used,
        p.note ?? '',
      ]),
    ]);

  const filtros: { id: Filtro; label: string }[] = [
    { id: 'all', label: t('sales.manage.filters.all') },
    { id: 'paid', label: t('sales.manage.filters.paid') },
    { id: 'comp', label: t('sales.manage.filters.comp') },
    { id: 'refunded', label: t('sales.manage.filters.refunded') },
  ];

  return (
    <div className="surface-light space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-party-gray" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t('sales.manage.searchOrders')}
            className="h-10 pl-9"
            aria-label={t('sales.manage.searchOrders')}
          />
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={lista.length === 0}
          className="press flex h-10 items-center gap-1.5 rounded-lg border border-black/15 px-3 text-caption font-bold disabled:opacity-40"
        >
          <Download size={14} />
          CSV
        </button>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {filtros.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={cn(
              'press h-8 shrink-0 rounded-full px-3 text-caption font-bold',
              filtro === f.id ? 'bg-ink text-white' : 'bg-black/[0.06] text-foreground',
            )}
          >
            {f.label} · {cuenta[f.id]}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-party-gray">
          {pedidos.length === 0 ? t('sales.noOrders') : t('sales.manage.noMatches')}
        </p>
      ) : (
        <ul className="divide-y divide-black/[0.06]">
          {lista.map((p) => {
            const open = abierto === p.id;
            const comp = p.source === 'comp';
            return (
              <li key={p.id} className={cn(p.status === 'refunded' && 'opacity-60')}>
                <button
                  type="button"
                  onClick={() => setAbierto(open ? null : p.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-bold">
                      {p.buyer || p.buyerEmail || '—'}
                      {comp && <Gift size={12} className="ml-1.5 inline text-amber-600" aria-label={t('sales.manage.comp')} />}
                    </p>
                    <p className="truncate text-caption text-party-gray">
                      {p.quantity} × {p.typeName} · {fecha(p.paidAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-body-sm font-bold tabular">{comp ? t('sales.manage.comp') : euros(p.amountCents)}</p>
                    {p.status === 'refunded' ? (
                      <p className="text-caption font-bold text-destructive">{t('sales.payments.refundedTag')}</p>
                    ) : (
                      <p className="text-caption text-party-gray">{t('sales.manage.usedOf', { used: p.used, total: p.quantity })}</p>
                    )}
                  </div>
                  <ChevronDown size={16} className={cn('shrink-0 text-party-gray transition-transform', open && 'rotate-180')} />
                </button>

                {open && (
                  <div className="mb-3 space-y-3 rounded-xl bg-black/[0.03] p-3">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-caption sm:grid-cols-3">
                      <div>
                        <dt className="text-party-gray">{t('sales.manage.detail.order')}</dt>
                        <dd className="font-bold tabular">{p.id.slice(0, 8).toUpperCase()}</dd>
                      </div>
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <dt className="text-party-gray">{t('sales.manage.detail.email')}</dt>
                        <dd className="truncate font-bold">{p.buyerEmail ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-party-gray">{t('sales.manage.detail.source')}</dt>
                        <dd className="font-bold">{comp ? t('sales.manage.comp') : t('sales.manage.online')}</dd>
                      </div>
                      {!comp && (
                        <>
                          <div>
                            <dt className="text-party-gray">{t('sales.manage.detail.amount')}</dt>
                            <dd className="font-bold tabular">{euros(p.amountCents)}</dd>
                          </div>
                          <div>
                            <dt className="text-party-gray">{t('sales.manage.detail.net')}</dt>
                            <dd className="font-bold tabular">{euros(p.netCents)}</dd>
                          </div>
                        </>
                      )}
                      {p.refundedAt && (
                        <div>
                          <dt className="text-party-gray">{t('sales.manage.detail.refunded')}</dt>
                          <dd className="font-bold">{fecha(p.refundedAt)}</dd>
                        </div>
                      )}
                      {p.note && (
                        <div className="col-span-2 sm:col-span-3">
                          <dt className="text-party-gray">{t('sales.manage.detail.note')}</dt>
                          <dd className="font-bold">{p.note}</dd>
                        </div>
                      )}
                    </dl>
                    {p.status === 'paid' && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy === p.id || !p.buyerEmail}
                          onClick={() => onResend(p)}
                          className="press flex h-9 items-center gap-1.5 rounded-lg border border-black/15 bg-white px-3 text-caption font-bold disabled:opacity-40"
                        >
                          {busy === p.id ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                          {t('sales.manage.resend')}
                        </button>
                        {p.refundable && (
                          <button
                            type="button"
                            disabled={busy === p.id}
                            onClick={() => onRefund(p)}
                            className="press flex h-9 items-center gap-1.5 rounded-lg border border-destructive/30 bg-white px-3 text-caption font-bold text-destructive disabled:opacity-40"
                          >
                            <Undo2 size={13} />
                            {t('sales.payments.refund')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default TicketOrders;
