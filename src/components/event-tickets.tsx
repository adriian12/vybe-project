import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Armchair, Loader2, Minus, Plus, Ticket } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { openExternal } from '@/services/native';
import { euros, ticketsService, TicketType } from '@/services/tickets';
import { track } from '@/lib/observability';
import { cn } from '@/lib/utils';

/**
 * Entradas y mesas que vende el local dentro de la app (locales Business).
 *
 * Si el local no vende nada aquí, no se pinta: la ficha sigue enseñando su
 * enlace de reservas externo, si lo tiene. El pago se hace en Stripe y las
 * entradas aparecen en «Entradas» cuando se confirma el cobro.
 */
const EventTickets = ({ eventId }: { eventId: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [types, setTypes] = useState<TicketType[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [comprando, setComprando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void ticketsService.getEventTypes(eventId).then((lista) => {
      if (vivo) setTypes(lista);
    });
    return () => {
      vivo = false;
    };
  }, [eventId]);

  if (types.length === 0) return null;

  const comprar = async (tipo: TicketType) => {
    const cantidad = cantidades[tipo.id] ?? 1;
    setComprando(tipo.id);
    try {
      const url = await ticketsService.startCheckout(tipo.id, cantidad);
      track('tickets_checkout', { kind: tipo.kind, quantity: cantidad });
      await openExternal(url, { system: true });
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'tickets.buy.errors.checkout';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
      // Puede que se haya agotado mientras tanto: se vuelve a mirar.
      void ticketsService.getEventTypes(eventId).then(setTypes);
    } finally {
      setComprando(null);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-headline-md text-white">{t('tickets.buy.title')}</h2>
      <ul className="flex flex-col gap-2">
        {types.map((tipo) => {
          const agotada = tipo.remaining !== null && tipo.remaining <= 0;
          const tope = Math.max(1, Math.min(tipo.maxPerOrder, tipo.remaining ?? tipo.maxPerOrder));
          const cantidad = Math.min(cantidades[tipo.id] ?? 1, tope);
          const esMesa = tipo.kind === 'table';
          const Icono = esMesa ? Armchair : Ticket;
          return (
            <li key={tipo.id} className={cn('rounded-xl bg-white p-3 text-ink', agotada && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-party-primary">
                  <Icono size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-title-card">{tipo.name}</p>
                  {esMesa && (
                    <p className="text-caption text-ink/60">
                      {[
                        tipo.guests ? t('tickets.buy.guests', { count: tipo.guests }) : null,
                        tipo.minSpendCents ? t('tickets.buy.minSpend', { amount: euros(tipo.minSpendCents) }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  {tipo.description && <p className="mt-0.5 text-caption text-ink/60">{tipo.description}</p>}
                  {tipo.remaining !== null && !agotada && tipo.remaining <= 20 && (
                    <p className="mt-0.5 text-caption font-bold text-destructive">
                      {t('tickets.buy.remaining', { count: tipo.remaining })}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-title-card">{euros(tipo.priceCents)}</p>
                  {esMesa && <p className="text-caption text-ink/60">{t('tickets.buy.deposit')}</p>}
                </div>
              </div>

              {agotada ? (
                <p className="mt-3 rounded-lg bg-black/[0.05] py-2 text-center text-caption font-bold uppercase">
                  {t('tickets.buy.soldOut')}
                </p>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  {!esMesa && tope > 1 && (
                    <div className="flex h-11 items-center rounded-xl border border-black/10">
                      <button
                        type="button"
                        aria-label="-1"
                        disabled={cantidad <= 1}
                        onClick={() => setCantidades((prev) => ({ ...prev, [tipo.id]: cantidad - 1 }))}
                        className="press flex h-11 w-10 items-center justify-center disabled:opacity-30"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-6 text-center font-bold tabular">{cantidad}</span>
                      <button
                        type="button"
                        aria-label="+1"
                        disabled={cantidad >= tope}
                        onClick={() => setCantidades((prev) => ({ ...prev, [tipo.id]: cantidad + 1 }))}
                        className="press flex h-11 w-10 items-center justify-center disabled:opacity-30"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={comprando !== null}
                    onClick={() => void comprar(tipo)}
                    className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-4 font-bold text-white disabled:opacity-50"
                  >
                    {comprando === tipo.id && <Loader2 size={16} className="animate-spin" />}
                    {esMesa
                      ? t('tickets.buy.reserve', { amount: euros(tipo.priceCents) })
                      : t('tickets.buy.buy', { amount: euros(tipo.priceCents * cantidad) })}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-party-gray">{t('tickets.buy.note')}</p>
    </section>
  );
};

export default EventTickets;
