import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Armchair, Crown, Minus, Plus, Ticket } from 'lucide-react';
import { euros, ticketsService, TicketType } from '@/services/tickets';
import { cn } from '@/lib/utils';

/**
 * Entradas y mesas que vende el local dentro de la app (locales Business).
 *
 * Si el local no vende nada aquí, no se pinta: la ficha sigue enseñando su
 * enlace de reservas externo, si lo tiene. Al elegir una se abre la pantalla
 * de compra (`/tickets/buy/:typeId`), con los datos de cada asistente.
 */
const EventTickets = ({ eventId }: { eventId: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [types, setTypes] = useState<TicketType[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});

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

  const comprar = (tipo: TicketType, cantidad: number) =>
    navigate(`/tickets/buy/${tipo.id}${tipo.kind === 'table' ? '' : `?qty=${cantidad}`}`);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-headline-md text-white">{t('tickets.buy.title')}</h2>
      <ul className="flex flex-col gap-2">
        {types.map((tipo) => {
          const agotada = tipo.remaining !== null && tipo.remaining <= 0;
          const tope = Math.max(1, Math.min(tipo.maxPerOrder, tipo.remaining ?? tipo.maxPerOrder));
          const cantidad = Math.min(cantidades[tipo.id] ?? 1, tope);
          const esMesa = tipo.kind === 'table';
          const Icono = esMesa ? Armchair : tipo.kind === 'vip' ? Crown : Ticket;
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
                  {tipo.description && (
                    <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-caption text-ink/60">{tipo.description}</p>
                  )}
                  {tipo.remaining !== null && !agotada && tipo.remaining <= 20 && (
                    <p className="mt-0.5 text-caption font-bold text-destructive">
                      {t('tickets.buy.remaining', { count: tipo.remaining })}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-title-card">
                    {tipo.priceCents ? euros(tipo.priceCents) : t('tickets.buy.free')}
                  </p>
                  {esMesa && tipo.priceCents > 0 && <p className="text-caption text-ink/60">{t('tickets.buy.deposit')}</p>}
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
                    onClick={() => comprar(tipo, cantidad)}
                    className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-4 font-bold text-white"
                  >
                    {tipo.priceCents === 0
                      ? t('tickets.buy.getFree')
                      : esMesa
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
