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
  QrCode,
  Share2,
  ShieldCheck,
  Undo2,
  Users,
} from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { VybeMark } from '@/components/brand/vybe-logo';
import { dayAndMonth, formatHour, formatHourRange } from '@/components/event-bits';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import { isEventLive, useEventsFeed } from '@/hooks/use-events-feed';
import { api } from '@/services/api';
import { ClaimedOffer, EventHistoryItem, EventOffer, socialService } from '@/services/social';
import { publicLink, shareOrCopy } from '@/lib/share';
import { cn } from '@/lib/utils';
import { Event } from '@/types/venue';

type Pestana = 'upcoming' | 'past';

/**
 * «Mis entradas», según la pantalla de Stitch.
 *
 * Vybe no vende entradas: la puerta se abre con el QR del local. Así que lo
 * que aquí se lleva en el bolsillo es lo que sí existe:
 *
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

  const compartir = async (event: Event) => {
    const resultado = await shareOrCopy({
      title: event.name,
      text: t('tickets.shareText', { name: event.name, venue: event.venueName ?? '' }),
      url: publicLink(`/event/${event.id}`),
    });
    if (resultado === 'copied') toast({ title: t('eventDetail.copied') });
  };

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
      <Header />

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
                : t('tickets.past', { count: pasadas.length })}
            </button>
          ))}
        </div>

        {pestana === 'upcoming' ? (
          <>
            {/* ------------------------------------------------- pase activo */}
            {activeEvent && (
              <article className="overflow-hidden rounded-2xl bg-white text-ink">
                <div className="relative h-44 overflow-hidden bg-surface">
                  {eventoActivo?.posterUrl ? (
                    <img src={eventoActivo.posterUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-surface-high">
                      <Music size={48} className="text-party-primary/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                  <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-party-primary px-3 py-1 text-label-pill uppercase tracking-wider text-ink">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-ink" />
                    {t('tickets.insideNow')}
                  </span>

                  <span className="absolute right-4 top-4 flex flex-col items-center rounded-lg bg-ink/90 px-2.5 py-1 leading-none">
                    <span className="text-[10px] font-bold uppercase text-party-primary">
                      {dayAndMonth(activeEvent.startDate).weekday}
                    </span>
                    <span className="font-display text-headline-md font-black text-white">
                      {dayAndMonth(activeEvent.startDate).day}
                    </span>
                  </span>

                  <div className="absolute inset-x-4 bottom-3">
                    <p className="truncate text-label-pill uppercase tracking-wider text-party-primary">
                      {activeEvent.venueName}
                    </p>
                    <h2 className="truncate font-display text-headline-lg text-white">
                      {activeEvent.eventName}
                    </h2>
                  </div>
                </div>

                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 text-body-md font-semibold">
                      <MapPin size={18} className="shrink-0" />
                      <span className="truncate">
                        {[eventoActivo?.venueName, eventoActivo?.city].filter(Boolean).join(' · ') ||
                          activeEvent.venueName}
                      </span>
                    </p>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-black/[0.06] px-2.5 py-1.5 text-caption font-bold">
                      <Clock size={14} />
                      {formatHourRange(activeEvent.startDate, activeEvent.endDate)}
                    </span>
                  </div>

                  <dl className="grid grid-cols-3 rounded-xl bg-black/[0.05] py-3 text-center">
                    <div>
                      <dt className="text-caption uppercase text-ink/55">{t('tickets.access')}</dt>
                      <dd className="font-display text-title-card">{t('tickets.verified')}</dd>
                    </div>
                    <div>
                      <dt className="text-caption uppercase text-ink/55">{t('tickets.ends')}</dt>
                      <dd className="font-display text-title-card">{formatHour(activeEvent.endDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-caption uppercase text-ink/55">{t('tickets.vouchers')}</dt>
                      <dd className="font-display text-title-card">{vales.length}</dd>
                    </div>
                  </dl>
                </div>

                {/* Perforación del ticket: dos muescas y la línea de puntos. */}
                <div className="relative flex items-center" aria-hidden>
                  <span className="absolute -left-3 h-6 w-6 rounded-full bg-background" />
                  <span className="mx-5 h-0 flex-1 border-t-2 border-dashed border-black/15" />
                  <span className="absolute -right-3 h-6 w-6 rounded-full bg-background" />
                </div>

                <div className="space-y-4 p-4 pt-5">
                  {vales.length > 0 ? (
                    vales.map((vale) => (
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
                    ))
                  ) : (
                    <div className="flex flex-col items-center gap-1 py-2 text-center">
                      <CheckCircle2 size={34} className="text-emerald-600" />
                      <p className="font-display text-title-card">{t('tickets.insideSince')}</p>
                      <p className="max-w-xs text-body-sm text-ink/60">{t('tickets.noVouchers')}</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/event/${activeEvent.eventId}/live`)}
                      className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-ink text-sm font-bold uppercase tracking-wide text-white"
                    >
                      <Undo2 size={18} />
                      {t('home.goBack')}
                    </button>
                    {eventoActivo && (
                      <button
                        type="button"
                        onClick={() => void compartir(eventoActivo)}
                        aria-label={t('eventDetail.share')}
                        className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-party-primary text-ink"
                      >
                        <Share2 size={20} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
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
                          {directo ? (
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

            {/* ------------------------------------------------------ grupos */}
            <section className="rounded-2xl bg-card p-4">
              <div className="flex gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-party-primary/15 text-party-primary">
                  <Users size={22} />
                </span>
                <div>
                  <h2 className="font-display text-title-card">{t('tickets.groupTitle')}</h2>
                  <p className="text-body-sm text-party-gray">{t('tickets.groupBody')}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={!activeEvent}
                onClick={() => activeEvent && navigate(`/event/${activeEvent.eventId}/live`)}
                className="press mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface-high text-body-md font-semibold disabled:opacity-50"
              >
                <Users size={18} />
                {activeEvent ? t('tickets.groupCta') : t('tickets.groupLocked')}
              </button>
            </section>

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
        ) : historial === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-party-primary" />
          </div>
        ) : pasadas.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-10 text-center">
            <CalendarX2 size={40} className="mb-3 text-party-gray" />
            <h2 className="font-display text-headline-md">{t('tickets.pastEmptyTitle')}</h2>
            <p className="mt-1 max-w-xs text-body-sm text-party-gray">{t('tickets.pastEmptyBody')}</p>
          </div>
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
      </main>

      <Footer />
    </div>
  );
};

export default TicketsPage;
