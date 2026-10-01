import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Armchair, Check, Crown, Download, Loader2, Pencil, Plus, Ticket, Trash2, Undo2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import PanelTabs from '@/components/venue/panel-tabs';
import VenuePayments from '@/components/venue/venue-payments';
import TicketOverview from '@/components/venue/tickets/ticket-overview';
import TicketOrders from '@/components/venue/tickets/ticket-orders';
import TicketAttendees from '@/components/venue/tickets/ticket-attendees';
import TicketComps from '@/components/venue/tickets/ticket-comps';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ApiError } from '@/services/api';
import {
  euros,
  PaymentsStatus,
  PromoterSettlement,
  TicketKind,
  TicketOrder,
  TicketSale,
  ticketsService,
} from '@/services/tickets';
import type { VenuePlanStatus } from '@/services/venue-service';
import { planHas } from '@/lib/venue-plans';
import { SALE_STATE_CLASS, saleState } from '@/lib/ticket-stats';
import { cn } from '@/lib/utils';
import { Event as VybeEvent } from '@/types/venue';

interface VenueSalesProps {
  events: VybeEvent[];
  plan: VenuePlanStatus | null;
}

type Pestana = 'manage' | 'promoters';
/** Gestión de entradas: cada parte de una plataforma de venta de entradas. */
type Vista = 'overview' | 'types' | 'orders' | 'attendees' | 'comps';

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
  /** Vacíos: valen los de la fiesta. */
  minAge: string;
  dressCode: string;
  /** `datetime-local` (hora del navegador); vacíos: sin límite. */
  salesStart: string;
  salesEnd: string;
}

/** ISO → valor de `<input type="datetime-local">` en la hora local. */
const aLocal = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Valor de `datetime-local` → ISO (o null si está vacío o mal). */
const aIso = (local: string): string | null => {
  if (!local.trim()) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

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
  minAge: '',
  dressCode: '',
  salesStart: '',
  salesEnd: '',
});

const aCentimos = (texto: string): number | null => {
  const n = Number(texto.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

/** Precio de venta: 0 (gratis) o desde 0,50 €, que es lo mínimo que cobra Stripe. */
const aPrecio = (texto: string): number | null => {
  if (!texto.trim()) return null;
  const n = Number(texto.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  const cents = Math.round(n * 100);
  return cents === 0 || cents >= 50 ? cents : null;
};

const ICONOS: Record<TicketKind, typeof Ticket> = { entry: Ticket, vip: Crown, table: Armchair };

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
const VenueSales = ({ events, plan }: VenueSalesProps) => {
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

  const [pestana, setPestana] = useState<Pestana>('manage');
  const [vista, setVista] = useState<Vista>('overview');
  /** Sube cuando cambia algo que la lista de asistentes debe recargar. */
  const [version, setVersion] = useState(0);
  const [ventas, setVentas] = useState<TicketSale[]>([]);
  const [pedidos, setPedidos] = useState<TicketOrder[]>([]);
  const [liquidacion, setLiquidacion] = useState<PromoterSettlement[]>([]);
  const [cargando, setCargando] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [comisiones, setComisiones] = useState<Record<string, { type: string; value: string }>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pagos, setPagos] = useState<PaymentsStatus | null>(null);
  const [aDevolver, setADevolver] = useState<TicketOrder | null>(null);
  const [aEliminar, setAEliminar] = useState<TicketSale | null>(null);

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

  // Sin Business la sección ni siquiera sale en el menú; por si acaso, nada.
  if (!disponible) return null;

  if (lista.length === 0) {
    return <p className="surface-light rounded-2xl p-6 text-center text-body-sm text-party-gray">{t('sales.noEvents')}</p>;
  }

  const guardar = async () => {
    if (!borrador || !actual) return;
    const precio = aPrecio(borrador.price);
    const capacidad = borrador.capacity.trim() ? entero(borrador.capacity) : null;
    if (borrador.name.trim().length < 2 || precio === null || (borrador.capacity.trim() && !capacidad)) {
      toast({ title: t('common.error'), description: t('sales.errors.form'), variant: 'destructive' });
      return;
    }
    const inicio = aIso(borrador.salesStart);
    const fin = aIso(borrador.salesEnd);
    if (inicio && fin && new Date(fin) <= new Date(inicio)) {
      toast({ title: t('common.error'), description: t('sales.errors.salesWindow'), variant: 'destructive' });
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
        minAge: borrador.minAge.trim() ? entero(borrador.minAge) : null,
        dressCode: borrador.dressCode.trim() || null,
        salesStartAt: inicio,
        salesEndAt: fin,
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

  // Sin ventas se borra; con ventas se retira (las entradas vendidas siguen valiendo).
  const eliminar = async (venta: TicketSale) => {
    setAEliminar(null);
    try {
      const resultado = await ticketsService.deleteType(venta.id);
      if (borrador?.id === venta.id) setBorrador(null);
      toast({ title: t(resultado === 'archived' ? 'sales.archivedType' : 'sales.deletedType') });
      await load();
    } catch (error) {
      fail(error);
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
      minAge: venta.minAge !== null ? String(venta.minAge) : '',
      dressCode: venta.dressCode ?? '',
      salesStart: aLocal(venta.salesStartAt),
      salesEnd: aLocal(venta.salesEndAt),
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

  const devolver = async (pedido: TicketOrder) => {
    setADevolver(null);
    setOcupado(pedido.id);
    try {
      await ticketsService.refundOrder(pedido.id);
      toast({ title: t('sales.payments.refunded') });
      await load();
      setVersion((v) => v + 1);
    } catch (error) {
      fail(error);
    } finally {
      setOcupado(null);
    }
  };

  const reenviar = async (pedido: TicketOrder) => {
    setOcupado(pedido.id);
    try {
      await ticketsService.resendOrder(pedido.id);
      toast({ title: t('sales.manage.resent', { email: pedido.buyerEmail ?? '' }) });
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
          { id: 'manage', label: t('sales.tabs.manage') },
          { id: 'promoters', label: t('sales.tabs.promoters'), count: liquidacion.length },
        ]}
        value={pestana}
        onChange={(v) => setPestana(v as Pestana)}
      />

      {pestana === 'manage' && (
        <nav className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-black/10 px-1" aria-label={t('sales.tabs.manage')}>
          {(
            [
              ['overview', t('sales.manage.views.overview')],
              ['types', t('sales.manage.views.types')],
              ['orders', t('sales.manage.views.orders')],
              ['attendees', t('sales.manage.views.attendees')],
              ['comps', t('sales.manage.views.comps')],
            ] as [Vista, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={vista === id ? 'page' : undefined}
              onClick={() => setVista(id)}
              className={cn(
                'press -mb-px shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-body-sm font-bold transition-colors',
                vista === id ? 'border-party-primary text-foreground' : 'border-transparent text-party-gray hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {cargando && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
        </div>
      )}

      {/* ------------------------------------------- gestión de entradas */}
      {pestana === 'manage' && !cargando && vista === 'overview' && (
        <div className="space-y-4">
          <VenuePayments onStatus={setPagos} />
          <TicketOverview ventas={ventas} pedidos={pedidos} eventEnded={terminado} onOpenOrders={() => setVista('orders')} />
        </div>
      )}
      {pestana === 'manage' && !cargando && vista === 'orders' && (
        <TicketOrders
          pedidos={pedidos}
          eventName={evento?.name ?? ''}
          busy={ocupado}
          onRefund={setADevolver}
          onResend={(p) => void reenviar(p)}
        />
      )}
      {pestana === 'manage' && vista === 'attendees' && actual && (
        <TicketAttendees eventId={actual} eventName={evento?.name ?? ''} version={version} onChanged={() => void load()} />
      )}
      {pestana === 'manage' && !cargando && vista === 'comps' && (
        <TicketComps
          ventas={ventas}
          pedidos={pedidos}
          eventEnded={terminado}
          busy={ocupado}
          onIssued={() => {
            void load();
            setVersion((v) => v + 1);
          }}
          onResend={(p) => void reenviar(p)}
        />
      )}

      {/* -------------------------------------------------- tipos de entrada */}
      {pestana === 'manage' && !cargando && vista === 'types' && (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="surface-light rounded-2xl p-4">
              <h3 className="mb-3 font-display text-title-card uppercase tracking-wide">{t('sales.types')}</h3>
              {ventas.length > 0 && pagos && !pagos.chargesEnabled && (
                <p className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-caption font-bold text-amber-900">
                  {t('sales.payments.hidden')}
                </p>
              )}
              {ventas.length === 0 && !borrador && (
                <p className="pb-2 text-body-sm text-party-gray">{t('sales.empty')}</p>
              )}
              <ul className="divide-y divide-black/[0.06]">
                {ventas.map((venta) => {
                  const Icono = ICONOS[venta.kind] ?? Ticket;
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
                            <span
                              className={cn(
                                'ml-2 rounded-full px-2 py-0.5 align-middle text-caption font-bold',
                                SALE_STATE_CLASS[saleState(venta, terminado)],
                              )}
                            >
                              {t(`sales.manage.state.${saleState(venta, terminado)}`)}
                            </span>
                          </p>
                          <p className="text-caption text-party-gray">
                            {venta.priceCents ? euros(venta.priceCents) : t('tickets.buy.free')}
                            {venta.kind === 'table' && venta.priceCents ? ` ${t('tickets.buy.deposit')}` : ''} ·{' '}
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
                            <div className="mt-1 flex items-center justify-end gap-3">
                              <button
                                type="button"
                                onClick={() => editar(venta)}
                                aria-label={t('common.edit')}
                                className="press inline-flex items-center gap-1 text-caption text-party-gray hover:text-ink"
                              >
                                <Pencil size={12} />
                                {t('common.edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setAEliminar(venta)}
                                aria-label={t('common.delete')}
                                className="press inline-flex items-center gap-1 text-caption text-destructive hover:opacity-80"
                              >
                                <Trash2 size={12} />
                                {t('common.delete')}
                              </button>
                            </div>
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
                    {t(
                      borrador.id
                        ? 'sales.form.edit'
                        : borrador.kind === 'table'
                          ? 'sales.form.newTable'
                          : borrador.kind === 'vip'
                            ? 'sales.form.newVip'
                            : 'sales.form.newEntry',
                    )}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="tt-name" className="text-caption">{t('sales.form.name')}</Label>
                      <Input
                        id="tt-name"
                        value={borrador.name}
                        maxLength={60}
                        placeholder={t(
                          borrador.kind === 'table'
                            ? 'sales.form.tablePlaceholder'
                            : borrador.kind === 'vip'
                              ? 'sales.form.vipPlaceholder'
                              : 'sales.form.entryPlaceholder',
                        )}
                        onChange={(e) => setBorrador({ ...borrador, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="tt-desc" className="text-caption">{t('sales.form.includes')}</Label>
                      <Textarea
                        id="tt-desc"
                        value={borrador.description}
                        maxLength={1500}
                        rows={4}
                        placeholder={t('sales.form.includesPlaceholder')}
                        onChange={(e) => setBorrador({ ...borrador, description: e.target.value })}
                      />
                      <p className="text-right text-caption text-party-gray tabular">{borrador.description.length}/1500</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tt-price" className="text-caption">
                        {t(borrador.kind === 'table' ? 'sales.form.deposit' : 'sales.form.price')}
                      </Label>
                      <Input
                        id="tt-price"
                        inputMode="decimal"
                        value={borrador.price}
                        placeholder="0"
                        onChange={(e) => setBorrador({ ...borrador, price: e.target.value })}
                      />
                      <p className="text-caption text-party-gray">{t('sales.form.priceHelp')}</p>
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
                    <div className="space-y-1">
                      <Label htmlFor="tt-age" className="text-caption">{t('sales.form.minAge')}</Label>
                      <Input
                        id="tt-age"
                        inputMode="numeric"
                        placeholder={t('sales.form.fromEvent')}
                        value={borrador.minAge}
                        onChange={(e) => setBorrador({ ...borrador, minAge: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tt-dress" className="text-caption">{t('sales.form.dressCode')}</Label>
                      <Input
                        id="tt-dress"
                        maxLength={40}
                        placeholder={t('sales.form.fromEvent')}
                        value={borrador.dressCode}
                        onChange={(e) => setBorrador({ ...borrador, dressCode: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tt-start" className="text-caption">{t('sales.form.salesStart')}</Label>
                      <Input
                        id="tt-start"
                        type="datetime-local"
                        value={borrador.salesStart}
                        onChange={(e) => setBorrador({ ...borrador, salesStart: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tt-end" className="text-caption">{t('sales.form.salesEnd')}</Label>
                      <Input
                        id="tt-end"
                        type="datetime-local"
                        value={borrador.salesEnd}
                        onChange={(e) => setBorrador({ ...borrador, salesEnd: e.target.value })}
                      />
                    </div>
                    <p className="text-caption text-party-gray sm:col-span-2">{t('sales.form.salesWindowHelp')}</p>
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
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {(['entry', 'vip', 'table'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setBorrador(vacio(kind))}
                      className="press flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/15 text-body-sm font-bold hover:bg-black/[0.03]"
                    >
                      <Plus size={16} />
                      {t(kind === 'table' ? 'sales.addTable' : kind === 'vip' ? 'sales.addVip' : 'sales.addEntry')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 lg:col-span-5">
            {/* Cobros: sin cuenta de Stripe activa no se vende. */}
            <VenuePayments onStatus={setPagos} />
            <p className="text-caption text-party-gray">{t('sales.note')}</p>
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
      <AlertDialog open={Boolean(aEliminar)} onOpenChange={(open) => !open && setAEliminar(null)}>
        <AlertDialogContent className="surface-light !bg-white text-ink">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sales.deleteTitle', { name: aEliminar?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription className="text-ink/70">
              {aEliminar && aEliminar.sold > 0 ? t('sales.deleteBodySold', { count: aEliminar.sold }) : t('sales.deleteBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => aEliminar && void eliminar(aEliminar)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(aDevolver)} onOpenChange={(open) => !open && setADevolver(null)}>
        <AlertDialogContent className="surface-light !bg-white text-ink">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('sales.payments.refundTitle', { amount: aDevolver ? euros(aDevolver.amountCents) : '' })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ink/70">
              {t('sales.payments.refundBody', { buyer: aDevolver?.buyer ?? '' })}
              {aDevolver && aDevolver.used > 0 ? ` ${t('sales.payments.refundUsed', { count: aDevolver.used })}` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => aDevolver && void devolver(aDevolver)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('sales.payments.refund')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VenueSales;
