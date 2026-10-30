import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Ticket } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { TicketOrder, TicketSale, ticketsService } from '@/services/tickets';
import TicketComps from '@/components/venue/tickets/ticket-comps';
import { Event } from '@/types/venue';

/**
 * Entradas gratis de una fiesta, desde administración: sobre todo para las de
 * Fiestea, que no tienen panel de negocio.
 *
 *   · La entrada gratuita la reserva cualquiera desde la app y le llega con su
 *     QR y su PDF, como las de pago (`save_ticket_type` a 0 €).
 *   · Las invitaciones van a nombre de alguien y se mandan por correo
 *     (`issue_comp_tickets`, el mismo componente que usa el negocio).
 *
 * Las funciones de la base de datos ya dejan al admin en cualquier fiesta. Sin
 * cobros de Stripe sólo hay entradas de 0 €, y aquí no se ofrecen de pago.
 */
const AdminEventTickets = ({ event }: { event: Event }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [ventas, setVentas] = useState<TicketSale[]>([]);
  const [pedidos, setPedidos] = useState<TicketOrder[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [nombre, setNombre] = useState(t('admin.tickets.defaultName'));
  const [aforo, setAforo] = useState(event.maxCapacity ? String(event.maxCapacity) : '');
  const [porPersona, setPorPersona] = useState('4');
  const [creando, setCreando] = useState(false);
  const terminada = new Date(event.endDate).getTime() <= Date.now();

  const cargar = useCallback(async () => {
    try {
      const [v, p] = await Promise.all([ticketsService.getSales(event.id), ticketsService.getOrders(event.id)]);
      setVentas(v);
      setPedidos(p);
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setCargando(false);
    }
  }, [event.id, t, toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const error = (e: unknown) =>
    toast({
      title: t('common.error'),
      description: t(e instanceof ApiError ? e.message : 'errors.generic'),
      variant: 'destructive',
    });

  const crear = async () => {
    if (nombre.trim().length < 2) return;
    setCreando(true);
    try {
      await ticketsService.saveType({
        eventId: event.id,
        kind: 'entry',
        name: nombre.trim(),
        priceCents: 0,
        capacity: aforo ? Math.max(1, Number(aforo)) : null,
        maxPerOrder: Math.min(Math.max(Number(porPersona) || 1, 1), 20),
      });
      toast({ title: t('admin.tickets.created') });
      await cargar();
    } catch (e) {
      error(e);
    } finally {
      setCreando(false);
    }
  };

  const retirar = async (venta: TicketSale) => {
    setBusy(venta.id);
    try {
      const r = await ticketsService.deleteType(venta.id);
      toast({ title: t(r === 'archived' ? 'admin.tickets.archived' : 'admin.tickets.removed') });
      await cargar();
    } catch (e) {
      error(e);
    } finally {
      setBusy(null);
    }
  };

  const reenviar = async (pedido: TicketOrder) => {
    setBusy(pedido.id);
    try {
      await ticketsService.resendOrder(pedido.id);
      toast({ title: t('admin.tickets.resent') });
    } catch (e) {
      error(e);
    } finally {
      setBusy(null);
    }
  };

  if (cargando) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const activas = ventas.filter((v) => v.active);

  return (
    <div className="space-y-5 text-ink">
      {/* Las que ya tiene la fiesta. */}
      <section className="space-y-2">
        <h3 className="font-display text-title-card uppercase tracking-wide">{t('admin.tickets.current')}</h3>
        {activas.length === 0 ? (
          <p className="text-body-sm text-ink/60">{t('admin.tickets.none')}</p>
        ) : (
          <ul className="divide-y divide-black/10 rounded-xl border border-black/10">
            {activas.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
                <Ticket size={16} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-bold">{v.name}</p>
                  <p className="text-caption text-ink/60">
                    {v.priceCents === 0 ? t('admin.tickets.free') : `${(v.priceCents / 100).toFixed(2)} €`}
                    {' · '}
                    {v.capacity !== null
                      ? t('admin.tickets.soldOf', { sold: v.sold, capacity: v.capacity })
                      : t('admin.tickets.sold', { count: v.sold })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === v.id}
                  onClick={() => void retirar(v)}
                  className="press h-8 rounded-lg border border-destructive/40 px-2.5 text-caption font-bold text-destructive disabled:opacity-50"
                >
                  {t('admin.tickets.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Una entrada gratuita que la gente reserva desde la app. */}
      {!terminada && (
        <section className="space-y-3 rounded-2xl bg-[#F5F5F7] p-4">
          <div>
            <h3 className="font-display text-title-card uppercase tracking-wide">{t('admin.tickets.freeTitle')}</h3>
            <p className="text-caption text-ink/60">{t('admin.tickets.freeHelp')}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`free-name-${event.id}`} className="text-caption">
              {t('admin.tickets.name')}
            </Label>
            <Input id={`free-name-${event.id}`} value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`free-cap-${event.id}`} className="text-caption">
                {t('admin.tickets.capacity')}
              </Label>
              <Input
                id={`free-cap-${event.id}`}
                type="number"
                min={1}
                inputMode="numeric"
                placeholder={t('admin.tickets.unlimited')}
                value={aforo}
                onChange={(e) => setAforo(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`free-max-${event.id}`} className="text-caption">
                {t('admin.tickets.perOrder')}
              </Label>
              <Input
                id={`free-max-${event.id}`}
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                value={porPersona}
                onChange={(e) => setPorPersona(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            disabled={creando || nombre.trim().length < 2}
            onClick={() => void crear()}
            className="press inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-bold text-white disabled:opacity-50"
          >
            {creando ? <Loader2 size={15} className="animate-spin" /> : <Ticket size={15} />}
            {t('admin.tickets.create')}
          </button>
        </section>
      )}

      {/* Invitaciones a nombre de alguien, por correo. */}
      <TicketComps
        ventas={activas}
        pedidos={pedidos}
        eventEnded={terminada}
        busy={busy}
        onIssued={() => void cargar()}
        onResend={(p) => void reenviar(p)}
      />
    </div>
  );
};

export default AdminEventTickets;
