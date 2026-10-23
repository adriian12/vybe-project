import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import {
  CalendarX2,
  CheckCircle2,
  ChevronRight,
  Clock,
  KeyRound,
  Loader2,
  MapPin,
  Music,
  Plus,
  QrCode,
  Share2,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import PurchasedTickets from '@/components/purchased-tickets';
import ExternalTickets from '@/components/external-tickets';
import { VybeMark } from '@/components/brand/vybe-logo';
import { dayAndMonth, formatHour, formatHourRange } from '@/components/event-bits';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import { isEventLive, useEventsFeed } from '@/hooks/use-events-feed';
import { api } from '@/services/api';
import { ClaimedOffer, EventHistoryItem, EventOffer, socialService } from '@/services/social';
import { sePuedeEntrar } from '@/lib/party-filters';
import { publicLink } from '@/lib/share';
import { useShareSheet } from '@/components/share-sheet';
import { cn } from '@/lib/utils';
import { Event } from '@/types/venue';

type Pestana = 'upcoming' | 'past';

/**
 * «Mis entradas», según la pantalla de Stitch.
 *
 * Lo que aquí se lleva en el bolsillo:
 *
 *   · **las entradas y mesas compradas en la app** (locales Business), cada
 *     una con su QR para la puerta;
 *   · **el pase de la fiesta en la que estás**, con la hora a la que entraste y
 *     los vales que has pedido en la barra, cada uno con su QR y su código
 *     (son los que el local valida en «Validar un vale»);
 *   · **las fiestas a las que has dicho que vas**, con el botón de entrar en
 *     cuanto empiezan;
 *   · **las pasadas**, con cuánta gente conociste en cada una.
 */
const TicketsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { share, sheet } = useShareSheet();
  const { activeEvent } = useAppContext();
  const { withDistance, intents, isLoading } = useEventsFeed();

  // `?tab=past` abre directamente las pasadas: es a donde lleva el historial
  // del perfil.
  const [searchParams] = useSearchParams();
  const [pestana, setPestana] = useState<Pestana>(
    searchParams.get('tab') === 'past' ? 'past' : 'upcoming',
  );
  const [eventoActivo, setEventoActivo] = useState<Event | null>(null);
  const [vales, setVales] = useState<ClaimedOffer[]>([]);
  const [ofertas, setOfertas] = useState<EventOffer[]>([]);
  const [historial, setHistorial] = useState<EventHistoryItem[] | null>(null);
  const [anadir, setAnadir] = useState(false);
  const [entradasPasadas, setEntradasPasadas] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void socialService.getEventHistory().then((lista) => {
      if (!cancelled) setHistorial(lista);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // El pase de la fiesta en curso: el evento completo (cartel, horario) y los
  // vales pedidos en ella.
  useEffect(() => {
    if (!activeEvent) {
      setEventoActivo(null);
      return;
    }
    let cancelled = false;

    void Promise.all([
      api.getEventById(activeEvent.eventId),
      socialService.getEventOffers(activeEvent.eventId),
      socialService.getMyClaimedOffers(),
    ]).then(([evento, lista, pedidos]) => {
      if (cancelled) return;
      setEventoActivo(evento);
      setOfertas(lista);
      // Los vales de las ofertas de esta noche; los de otras noches ya no
      // sirven en ninguna barra.
      const ids = new Set(lista.map((o) => o.id));
      setVales(pedidos.filter((v) => ids.has(v.promotionId) && !v.validatedAt));
    });

    return () => {
      cancelled = true;
    };
  }, [activeEvent]);

  const proximas = useMemo(
    () =>
      withDistance
        .filter(({ event }) => intents.includes(event.id) && event.id !== activeEvent?.eventId)
        .map(({ event }) => event)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    [withDistance, intents, activeEvent?.eventId],
  );

  const pasadas = useMemo(
    () => (historial ?? []).filter((h) => h.eventId !== activeEvent?.eventId),
    [historial, activeEvent?.eventId],
  );

  const activas = proximas.length + (activeEvent ? 1 : 0);
  const eventosFeed = useMemo(() => withDistance.map(({ event }) => event), [withDistance]);

  const compartir = (event: Event) =>
    share({
      title: event.name,
      text: t('tickets.shareText', { name: event.name, venue: event.venueName ?? '' }),
      url: publicLink(`/event/${event.id}`),
    });

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
      <Header />
      {sheet}

      <main className="mx-auto max-w-md space-y-5 px-margin pt-5">
        {/* --------------------------------------------------------- título */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-headline-xl uppercase">{t('tickets.title')}</h1>
            <p className="text-body-md text-party-gray">{t('tickets.subtitle')}</p>
          </div>
          {activas > 0 && (
            <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-label-pill uppercase tracking-wider">
              <span className="h-2 w-2 rounded-full bg-party-primary" />
              {t('tickets.active', { count: activas })}
            </span>
          )}
        </div>

        <div className="flex gap-2" role="tablist">
          {(['upcoming', 'past'] as const).map((clave) => (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={pestana === clave}
              onClick={() => setPestana(clave)}
              className={cn(
                'press rounded-full px-5 py-2.5 text-sm font-bold',
                pestana === clave ? 'bg-party-primary text-ink' : 'bg-card text-foreground',
              )}
            >
              {clave === 'upcoming'
                ? t('tickets.upcoming', { count: activas })
                : t('tickets.past', { count: pasadas.length + entradasPasadas })}
            </button>
          ))}
        </div>

        {pestana === 'upcoming' ? (
          <>
            {/* ------------------- entradas compradas y de otras webs (Fourvenues…) */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-headline-md uppercase">{t('tickets.mine.title')}</h2>
                <PartyButton size="sm" onClick={() => setAnadir(true)}>
                  <Plus size={14} className="mr-1" />
                  {t('tickets.external.add')}
                </PartyButton>
              </div>
              <PurchasedTickets view="upcoming" onPastCount={setEntradasPasadas} />
              <ExternalTickets events={eventosFeed} addOpen={anadir} onAddOpenChange={setAnadir} />
            </section>

            {/* ---------------------------------------------- vales de esta noche */}
            {/* La fiesta en la que estás ya sale en inicio; aquí sólo sus vales, que
                se enseñan en la barra. */}
            {activeEvent && vales.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-headline-md uppercase">{t('tickets.vouchers')}</h2>
                <article className="space-y-5 rounded-2xl bg-white p-4 text-ink">
                  {vales.map((vale) => (
                      <div key={vale.id} className="flex flex-col items-center gap-2">
                        <div className="relative rounded-2xl border-[6px] border-ink bg-white p-3">
                          <QRCodeSVG value={vale.ticketCode} size={168} level="H" fgColor="#111114" />
                          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-party-primary p-1">
                            <VybeMark size={26} />
                          </span>
                        </div>
                        <p className="font-display text-headline-md tracking-[0.2em]">#{vale.ticketCode}</p>
                        <p className="text-center text-body-sm font-semibold">
                          {ofertas.find((o) => o.id === vale.promotionId)?.title}
                        </p>
                        <p className="flex items-center gap-1.5 text-body-sm text-ink/60">
                          <ShieldCheck size={15} className="text-emerald-600" />
                          {t('tickets.showAtBar')}
                        </p>
                      </div>
                  ))}
                </article>
              </section>
            )}

            {/* ------------------------------------------------ las que vienen */}
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-7 w-7 animate-spin text-party-primary" />
              </div>
            ) : proximas.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-label-pill text-sm uppercase tracking-wider">{t('tickets.nextEvents')}</h2>
                  <span className="text-body-sm text-party-gray">
                    {t('tickets.inDays', {
                      count: Math.max(
                        0,
                        Math.ceil((new Date(proximas[0].startDate).getTime() - Date.now()) / 86_400_000),
                      ),
                    })}
                  </span>
                </div>

                {proximas.map((event) => {
                  const directo = isEventLive(event);
                  const { weekday, day, month } = dayAndMonth(event.startDate);

                  return (
                    <article
                      key={event.id}
                      onClick={() => navigate(`/event/${event.id}`)}
                      className="press flex cursor-pointer gap-3 rounded-2xl bg-white p-3 text-ink"
                    >
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-surface">
                        {event.posterUrl ? (
                          <img src={event.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-party-primary/40">
                            <Music size={28} />
                          </span>
                        )}
                        {directo && (
                          <span className="absolute bottom-1.5 left-1.5 rounded bg-party-primary px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                            {t('home.live')}
                          </span>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-caption uppercase tracking-wide text-ink/55">
                            {event.venueName}
                          </p>
                          <span className="shrink-0 rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[11px] font-bold uppercase">
                            {weekday} {day} {month}
                          </span>
                        </div>
                        <h3 className="truncate font-display text-title-card">{event.name}</h3>
                        <p className="truncate text-body-sm text-ink/60">
                          {formatHourRange(event.startDate, event.endDate)}
                          {event.city ? ` · ${event.city}` : ''}
                        </p>

                        <div className="mt-auto flex items-center justify-between gap-2 border-t border-black/[0.08] pt-2">
                          <span className="text-caption text-ink/60">{t('tickets.youreGoing')}</span>
                          {directo && sePuedeEntrar(event) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/event/${event.id}/access`);
                              }}
                              className="press flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-caption font-bold text-party-primary"
                            >
                              <QrCode size={14} />
                              {t('eventAccess.enter')}
                            </button>
                          ) : (
                            <span className="flex items-center gap-0.5 text-caption font-bold">
                              {t('map.view')}
                              <ChevronRight size={14} />
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            ) : (
              !activeEvent && (
                <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-10 text-center">
                  <CalendarX2 size={40} className="mb-3 text-party-primary" />
                  <h2 className="font-display text-headline-md">{t('tickets.emptyTitle')}</h2>
                  <p className="mb-5 mt-1 max-w-xs text-body-sm text-party-gray">{t('tickets.emptyBody')}</p>
                  <PartyButton onClick={() => navigate('/home')}>{t('tickets.explore')}</PartyButton>
                </div>
              )
            )}

            <Link
              to="/location"
              className="press flex items-center justify-between gap-3 py-1 text-body-md text-party-gray"
            >
              <span className="flex items-center gap-2 underline underline-offset-4">
                <KeyRound size={18} />
                {t('tickets.haveCode')}
              </span>
              <ChevronRight size={18} />
            </Link>
          </>
        ) : (
          <>
            {/* Entradas usadas o de fiestas que ya terminaron. */}
            <PurchasedTickets view="past" onPastCount={setEntradasPasadas} />
            {historial === null ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-7 w-7 animate-spin text-party-primary" />
              </div>
            ) : pasadas.length === 0 ? (
              entradasPasadas === 0 && (
              <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-10 text-center">
                <CalendarX2 size={40} className="mb-3 text-party-gray" />
                <h2 className="font-display text-headline-md">{t('tickets.pastEmptyTitle')}</h2>
                <p className="mt-1 max-w-xs text-body-sm text-party-gray">{t('tickets.pastEmptyBody')}</p>
              </div>
              )
            ) : (
              <ul className="stagger space-y-3">
                {pasadas.map((item, index) => {
                  const { day, month } = dayAndMonth(item.startDate);
                  return (
                    <li
                      key={item.eventId}
                      style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
                      className="flex items-center gap-3 rounded-2xl bg-card p-3"
                    >
                      <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-high leading-none">
                        <span className="font-display text-headline-md font-black">{day}</span>
                        <span className="text-[10px] font-bold uppercase text-party-gray">{month}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-title-card">{item.eventName}</p>
                        <p className="truncate text-body-sm text-party-gray">{item.venueName}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-surface-high px-2.5 py-1 text-caption">
                        {t('tickets.connections', { count: item.connectionsMade })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default TicketsPage;
