import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Armchair, Check, Crown, Download, Loader2, Pencil, Plus, Ticket, Undo2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import PanelTabs from '@/components/venue/panel-tabs';
import { ApiError } from '@/services/api';
import {
  euros,
  PromoterSettlement,
  TicketKind,
  TicketOrder,
  TicketSale,
  ticketsService,
} from '@/services/tickets';
import type { VenuePlanStatus } from '@/services/venue-service';
import { planHas } from '@/lib/venue-plans';
import { cn } from '@/lib/utils';
import { Event as VybeEvent } from '@/types/venue';

interface VenueSalesProps {
  events: VybeEvent[];
  plan: VenuePlanStatus | null;
  onUpgrade: () => void;
}

type Pestana = 'tickets' | 'promoters';

interface Borrador {
  id: string | null;
  kind: TicketKind;
  name: string;
  description: string;
  price: string;
  capacity: string;
  guests: string;
  minSpend: string;
  maxPerOrder: string;
  active: boolean;
}

const vacio = (kind: TicketKind): Borrador => ({
  id: null,
  kind,
  name: '',
  description: '',
  price: '',
  capacity: '',
  guests: kind === 'table' ? '6' : '',
  minSpend: '',
  maxPerOrder: '6',
  active: true,
});

const aCentimos = (texto: string): number | null => {
  const n = Number(texto.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

const entero = (texto: string): number | null => {
  const n = Number(texto);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * «Ventas» (locales Business): entradas y mesas que se venden en la app y la
 * liquidación de los relaciones públicas de cada noche.
 *
 * Las entradas y mesas se crean por evento; el público las compra en la ficha
 * de la fiesta y la puerta las valida en Puerta → «Validar entrada». Las
 * comisiones se calculan solas: por persona que entra con el código del RRPP o
 * un porcentaje de lo que esas personas compraron en entradas.
 */
const VenueSales = ({ events, plan, onUpgrade }: VenueSalesProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const disponible = planHas(plan?.plan, 'ticketSales');

  // En marcha y próximas primero; después las de los últimos 30 días.
  const lista = useMemo(() => {
    const ahora = Date.now();
    const abiertas = events
      .filter((e) => new Date(e.endDate).getTime() > ahora)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const pasadas = events
      .filter((e) => {
        const fin = new Date(e.endDate).getTime();
        return fin <= ahora && fin > ahora - 30 * 86_400_000;
      })
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    return [...abiertas, ...pasadas];
  }, [events]);

  const [eventId, setEventId] = useState<string | null>(null);
  const actual = eventId && lista.some((e) => e.id === eventId) ? eventId : (lista[0]?.id ?? null);
  const evento = lista.find((e) => e.id === actual) ?? null;
  const terminado = evento ? new Date(evento.endDate).getTime() <= Date.now() : false;

  const [pestana, setPestana] = useState<Pestana>('tickets');
  const [ventas, setVentas] = useState<TicketSale[]>([]);
  const [pedidos, setPedidos] = useState<TicketOrder[]>([]);
  const [liquidacion, setLiquidacion] = useState<PromoterSettlement[]>([]);
  const [cargando, setCargando] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [comisiones, setComisiones] = useState<Record<string, { type: string; value: string }>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const fail = useCallback(
    (error: unknown) => {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    },
    [t, toast],
  );

  const load = useCallback(async () => {
    if (!actual || !disponible) return;
    setCargando(true);
    try {
      const [v, p, l] = await Promise.all([
        ticketsService.getSales(actual),
        ticketsService.getOrders(actual),
        ticketsService.getSettlement(actual),
      ]);
      setVentas(v);
      setPedidos(p);
      setLiquidacion(l);
      setComisiones(
        Object.fromEntries(
          l.map((row) => [
            row.codeId,
            { type: row.commissionType ?? 'none', value: row.commissionValue !== null ? String(row.commissionValue) : '' },
          ]),
        ),
      );
    } catch (error) {
      fail(error);
    } finally {
      setCargando(false);
    }
  }, [actual, disponible, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!disponible) {
    return (
      <div className="surface-light mx-auto max-w-2xl rounded-2xl p-6 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-party-primary text-ink">
          <Crown size={22} />
        </span>
        <h2 className="font-display text-headline-md">{t('sales.locked.title')}</h2>
        <p className="mx-auto mt-2 max-w-md text-body-sm text-party-gray">{t('sales.locked.body')}</p>
        <button
          type="button"
          onClick={onUpgrade}
          className="press mt-4 h-11 rounded-xl bg-party-primary px-5 font-bold text-ink"
        >
          {t('sales.locked.cta')}
        </button>
      </div>
    );
  }

  if (lista.length === 0) {
    return <p className="surface-light rounded-2xl p-6 text-center text-body-sm text-party-gray">{t('sales.noEvents')}</p>;
  }

  const guardar = async () => {
    if (!borrador || !actual) return;
    const precio = aCentimos(borrador.price);
    const capacidad = borrador.capacity.trim() ? entero(borrador.capacity) : null;
    if (borrador.name.trim().length < 2 || !precio || (borrador.capacity.trim() && !capacidad)) {
      toast({ title: t('common.error'), description: t('sales.errors.form'), variant: 'destructive' });
      return;
    }
    setGuardando(true);
    try {
      await ticketsService.saveType({
        id: borrador.id,
        eventId: actual,
        kind: borrador.kind,
        name: borrador.name.trim(),
        description: borrador.description.trim() || null,
        priceCents: precio,
        capacity: capacidad,
        guests: borrador.kind === 'table' ? entero(borrador.guests) : null,
        minSpendCents: borrador.kind === 'table' ? aCentimos(borrador.minSpend) : null,
        maxPerOrder: entero(borrador.maxPerOrder) ?? 6,
        active: borrador.active,
      });
      setBorrador(null);
      toast({ title: t('sales.saved') });
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setGuardando(false);
    }
  };

  const editar = (venta: TicketSale) =>
    setBorrador({
      id: venta.id,
      kind: venta.kind,
      name: venta.name,
      description: venta.description ?? '',
      price: String(venta.priceCents / 100),
      capacity: venta.capacity ? String(venta.capacity) : '',
      guests: venta.guests ? String(venta.guests) : '',
      minSpend: venta.minSpendCents ? String(venta.minSpendCents / 100) : '',
      maxPerOrder: String(venta.maxPerOrder),
      active: venta.active,
    });

  const guardarComision = async (codeId: string) => {
    const c = comisiones[codeId];
    const valor = Number((c?.value ?? '').replace(',', '.'));
    setOcupado(codeId);
    try {
      if (!c || c.type === 'none') await ticketsService.setCommission(codeId, null, null);
      else await ticketsService.setCommission(codeId, c.type as 'per_person' | 'percent', valor);
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setOcupado(null);
    }
  };

  const pagar = async (codeId: string, pagado: boolean) => {
    setOcupado(codeId);
    try {
      await ticketsService.markPaid(codeId, pagado);
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setOcupado(null);
    }
  };

  const exportarCsv = () => {
    const filas = [
      ['RRPP', 'Codigo', 'Entradas', 'Gasto en entradas (EUR)', 'Comision', 'A pagar (EUR)', 'Pagada'],
      ...liquidacion.map((r) => [
        r.promoterName ?? r.label ?? '',
        r.code,
        String(r.checkIns),
        (r.ticketRevenueCents / 100).toFixed(2),
        r.commissionType === 'per_person'
          ? `${r.commissionValue} EUR/persona`
          : r.commissionType === 'percent'
            ? `${r.commissionValue} %`
            : '',
        (r.commissionCents / 100).toFixed(2),
        r.paidAt ? 'si' : 'no',
      ]),
    ];
    const csv = filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rrpp-${evento?.name ?? 'evento'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const vendidas = ventas.reduce((n, v) => n + v.sold, 0);
  const ingresos = ventas.reduce((n, v) => n + v.revenueCents, 0);
  const validadas = ventas.reduce((n, v) => n + v.used, 0);
  const aPagar = liquidacion.reduce((n, r) => n + r.commissionCents, 0);
  const pendiente = liquidacion.filter((r) => !r.paidAt).reduce((n, r) => n + r.commissionCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="hidden font-display text-headline-xl lg:block">{t('sales.title')}</h1>
        <Select value={actual ?? undefined} onValueChange={(v) => { setEventId(v); setBorrador(null); }}>
          <SelectTrigger className="h-11 w-full max-w-sm bg-card" aria-label={t('sales.event')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lista.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name} · {new Date(e.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PanelTabs
        tabs={[
          { id: 'tickets', label: t('sales.tabs.tickets') },
          { id: 'promoters', label: t('sales.tabs.promoters'), count: liquidacion.length },
        ]}
        value={pestana}
        onChange={(v) => setPestana(v as Pestana)}
      />

      {cargando && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
        </div>
      )}

      {/* -------------------------------------------------- entradas y mesas */}
      {pestana === 'tickets' && !cargando && (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t('sales.sold'), value: vendidas },
                { label: t('sales.revenue'), value: euros(ingresos) },
                { label: t('sales.validated'), value: validadas },
              ].map((item) => (
                <div key={item.label} className="surface-light rounded-2xl p-4">
                  <p className="font-display text-headline-md tabular">{item.value}</p>
                  <p className="mt-1 text-caption uppercase tracking-wide text-party-gray">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="surface-light rounded-2xl p-4">
              <h3 className="mb-3 font-display text-title-card uppercase tracking-wide">{t('sales.types')}</h3>
              {ventas.length === 0 && !borrador && (
                <p className="pb-2 text-body-sm text-party-gray">{t('sales.empty')}</p>
              )}
              <ul className="divide-y divide-black/[0.06]">
                {ventas.map((venta) => {
                  const Icono = venta.kind === 'table' ? Armchair : Ticket;
                  const pct = venta.capacity ? Math.min(Math.round((venta.sold / venta.capacity) * 100), 100) : null;
                  return (
                    <li key={venta.id} className={cn('py-3', !venta.active && 'opacity-50')}>
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-party-primary text-ink">
                          <Icono size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-md font-bold">
                            {venta.name}
                            {!venta.active && <span className="ml-2 text-caption font-normal">({t('sales.paused')})</span>}
                          </p>
                          <p className="text-caption text-party-gray">
                            {euros(venta.priceCents)}
                            {venta.kind === 'table' ? ` ${t('tickets.buy.deposit')}` : ''} ·{' '}
                            {venta.capacity
                              ? t('sales.soldOf', { sold: venta.sold, total: venta.capacity })
                              : t('sales.soldCount', { count: venta.sold })}{' '}
                            · {t('sales.usedCount', { count: venta.used })}
                          </p>
                          {pct !== null && (
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08]">
                              <div className="h-full rounded-full bg-party-primary" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-body-sm font-bold tabular">{euros(venta.revenueCents)}</p>
                          {!terminado && (
                            <button
                              type="button"
                              onClick={() => editar(venta)}
                              aria-label={t('common.edit')}
                              className="press mt-1 inline-flex items-center gap-1 text-caption text-party-gray hover:text-ink"
                            >
                              <Pencil size={12} />
                              {t('common.edit')}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {borrador ? (
                <div className="mt-3 space-y-3 rounded-xl bg-black/[0.03] p-3">
                  <p className="font-bold">
                    {t(borrador.id ? 'sales.form.edit' : borrador.kind === 'table' ? 'sales.form.newTable' : 'sales.form.newEntry')}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="tt-name" className="text-caption">{t('sales.form.name')}</Label>
                      <Input
                        id="tt-name"
                        value={borrador.name}
                        maxLength={60}
                        placeholder={t(borrador.kind === 'table' ? 'sales.form.tablePlaceholder' : 'sales.form.entryPlaceholder')}
                        onChange={(e) => setBorrador({ ...borrador, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="tt-desc" className="text-caption">{t('sales.form.description')}</Label>
                      <Input
                        id="tt-desc"
                        value={borrador.description}
                        maxLength={280}
                        onChange={(e) => setBorrador({ ...borrador, description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tt-price" className="text-caption">
                        {t(borrador.kind === 'table' ? 'sales.form.deposit' : 'sales.form.price')}
                      </Label>
                      <Input
                        id="tt-price"
                        inputMode="decimal"
                        value={borrador.price}
                        onChange={(e) => setBorrador({ ...borrador, price: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tt-cap" className="text-caption">
                        {t(borrador.kind === 'table' ? 'sales.form.tables' : 'sales.form.capacity')}
                      </Label>
                      <Input
                        id="tt-cap"
                        inputMode="numeric"
                        value={borrador.capacity}
                        placeholder={borrador.kind === 'table' ? '' : t('sales.form.unlimited')}
                        onChange={(e) => setBorrador({ ...borrador, capacity: e.target.value })}
                      />
                    </div>
                    {borrador.kind === 'table' ? (
                      <>
                        <div className="space-y-1">
                          <Label htmlFor="tt-guests" className="text-caption">{t('sales.form.guests')}</Label>
                          <Input
                            id="tt-guests"
                            inputMode="numeric"
                            value={borrador.guests}
                            onChange={(e) => setBorrador({ ...borrador, guests: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="tt-min" className="text-caption">{t('sales.form.minSpend')}</Label>
                          <Input
                            id="tt-min"
                            inputMode="decimal"
                            value={borrador.minSpend}
                            onChange={(e) => setBorrador({ ...borrador, minSpend: e.target.value })}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1">
                        <Label htmlFor="tt-max" className="text-caption">{t('sales.form.maxPerOrder')}</Label>
                        <Input
                          id="tt-max"
                          inputMode="numeric"
                          value={borrador.maxPerOrder}
                          onChange={(e) => setBorrador({ ...borrador, maxPerOrder: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                  <label className="flex items-center justify-between gap-3 text-body-sm">
                    {t('sales.form.onSale')}
                    <Switch checked={borrador.active} onCheckedChange={(v) => setBorrador({ ...borrador, active: v })} />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBorrador(null)}
                      className="press flex h-10 items-center gap-1 rounded-lg border border-black/15 px-3 text-caption font-bold"
                    >
                      <X size={14} />
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => void guardar()}
                      className="press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-party-primary font-bold text-ink disabled:opacity-50"
                    >
                      {guardando && <Loader2 size={14} className="animate-spin" />}
                      {t('common.save')}
                    </button>
                  </div>
                </div>
              ) : terminado ? (
                <p className="mt-3 text-caption text-party-gray">{t('sales.ended')}</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(['entry', 'table'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setBorrador(vacio(kind))}
                      className="press flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/15 text-body-sm font-bold hover:bg-black/[0.03]"
                    >
                      <Plus size={16} />
                      {t(kind === 'table' ? 'sales.addTable' : 'sales.addEntry')}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-caption text-party-gray">{t('sales.note')}</p>
          </div>

          <div className="space-y-4 lg:col-span-5">
            <div className="surface-light rounded-2xl p-4">
              <h3 className="mb-3 font-display text-title-card uppercase tracking-wide">{t('sales.orders')}</h3>
              {pedidos.length === 0 ? (
                <p className="text-body-sm text-party-gray">{t('sales.noOrders')}</p>
              ) : (
                <ul className="divide-y divide-black/[0.06]">
                  {pedidos.map((pedido) => (
                    <li key={pedido.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-body-sm font-bold">
                          {pedido.buyer || '—'} · {pedido.quantity} × {pedido.typeName}
                        </p>
                        <p className="text-caption text-party-gray">
                          {pedido.paidAt
                            ? new Date(pedido.paidAt).toLocaleString(undefined, {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </p>
                      </div>
                      <p className="shrink-0 text-body-sm font-bold tabular">{euros(pedido.amountCents)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- comisiones RRPP */}
      {pestana === 'promoters' && !cargando && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="surface-light rounded-2xl p-4">
              <p className="font-display text-headline-md tabular">{euros(aPagar)}</p>
              <p className="mt-1 text-caption uppercase tracking-wide text-party-gray">{t('sales.promoters.total')}</p>
            </div>
            <div className="surface-light rounded-2xl p-4">
              <p className={cn('font-display text-headline-md tabular', pendiente > 0 && 'text-destructive')}>
                {euros(pendiente)}
              </p>
              <p className="mt-1 text-caption uppercase tracking-wide text-party-gray">{t('sales.promoters.pending')}</p>
            </div>
          </div>

          <div className="surface-light rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-display text-title-card uppercase tracking-wide">{t('sales.promoters.title')}</h3>
              {liquidacion.length > 0 && (
                <button
                  type="button"
                  onClick={exportarCsv}
                  className="press flex h-9 items-center gap-1.5 rounded-lg border border-black/15 px-3 text-caption font-bold"
                >
                  <Download size={14} />
                  CSV
                </button>
              )}
            </div>
            <p className="-mt-1 mb-3 text-caption text-party-gray">{t('sales.promoters.help')}</p>

            {liquidacion.length === 0 ? (
              <p className="text-body-sm text-party-gray">{t('sales.promoters.empty')}</p>
            ) : (
              <ul className="space-y-3">
                {liquidacion.map((row) => {
                  const c = comisiones[row.codeId] ?? { type: 'none', value: '' };
                  const cambiado =
                    c.type !== (row.commissionType ?? 'none') ||
                    (c.type !== 'none' && Number(c.value.replace(',', '.')) !== row.commissionValue);
                  return (
                    <li key={row.codeId} className="rounded-xl bg-black/[0.03] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-body-md font-bold">{row.promoterName ?? row.label ?? row.code}</p>
                          <p className="text-caption text-party-gray">
                            <span className="font-mono tracking-wider">{row.code}</span> ·{' '}
                            {t('sales.promoters.checkIns', { count: row.checkIns })} ·{' '}
                            {t('sales.promoters.spent', { amount: euros(row.ticketRevenueCents) })}
                          </p>
                        </div>
                        <p className="shrink-0 font-display text-title-card tabular">{euros(row.commissionCents)}</p>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Select
                          value={c.type}
                          onValueChange={(v) => setComisiones((prev) => ({ ...prev, [row.codeId]: { ...c, type: v } }))}
                        >
                          <SelectTrigger className="h-10 w-[170px]" aria-label={t('sales.promoters.type')}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('sales.promoters.none')}</SelectItem>
                            <SelectItem value="per_person">{t('sales.promoters.perPerson')}</SelectItem>
                            <SelectItem value="percent">{t('sales.promoters.percent')}</SelectItem>
                          </SelectContent>
                        </Select>
                        {c.type !== 'none' && (
                          <Input
                            inputMode="decimal"
                            value={c.value}
                            onChange={(e) =>
                              setComisiones((prev) => ({ ...prev, [row.codeId]: { ...c, value: e.target.value } }))
                            }
                            placeholder={c.type === 'percent' ? '%' : '€'}
                            aria-label={t('sales.promoters.value')}
                            className="h-10 w-24"
                          />
                        )}
                        {cambiado && (
                          <button
                            type="button"
                            disabled={ocupado === row.codeId}
                            onClick={() => void guardarComision(row.codeId)}
                            className="press h-10 rounded-lg bg-party-primary px-3 text-caption font-bold text-ink disabled:opacity-50"
                          >
                            {t('common.save')}
                          </button>
                        )}
                        <span className="flex-1" />
                        {row.paidAt ? (
                          <button
                            type="button"
                            disabled={ocupado === row.codeId}
                            onClick={() => void pagar(row.codeId, false)}
                            className="press flex h-10 items-center gap-1.5 rounded-lg bg-emerald-100 px-3 text-caption font-bold text-emerald-800"
                          >
                            <Check size={14} />
                            {t('sales.promoters.paid', { amount: euros(row.paidCents ?? 0) })}
                            <Undo2 size={13} className="opacity-60" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={ocupado === row.codeId || row.commissionCents === 0}
                            onClick={() => void pagar(row.codeId, true)}
                            className="press h-10 rounded-lg border border-black/15 px-3 text-caption font-bold disabled:opacity-40"
                          >
                            {t('sales.promoters.markPaid')}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VenueSales;
