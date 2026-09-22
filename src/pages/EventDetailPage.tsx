import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Martini,
  Navigation,
  QrCode,
  Share2,
  Ticket,
  Undo2,
  Zap,
} from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import WhoIsGoing from '@/components/who-is-going';
import MapThumb from '@/components/map-thumb';
import { LivePill, formatHourRange } from '@/components/event-bits';
import LiveThermometer from '@/components/live-thermometer';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import { isEventLive, useEventsFeed } from '@/hooks/use-events-feed';
import { api } from '@/services/api';
import { formatDistance } from '@/services/geo';
import { openExternal } from '@/services/native';
import { EMPTY_ACTIVITY, socialService } from '@/services/social';
import { publicLink, shareOrCopy } from '@/lib/share';
import { track } from '@/lib/observability';
import { cn } from '@/lib/utils';
import { Event } from '@/types/venue';

/** Una de las tres losetas blancas: icono en círculo oscuro, dato y etiqueta. */
const Loseta: React.FC<{ icon: typeof Clock; value: string; label: string }> = ({
  icon: Icon,
  value,
  label,
}) => (
  <div className="flex flex-col items-center justify-center rounded-xl bg-white p-3 text-center">
    <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-surface-low text-white">
      <Icon size={17} />
    </span>
    <span className="font-display text-title-card leading-tight text-ink">{value}</span>
    <span className="text-caption uppercase text-ink/60">{label}</span>
  </div>
);

/** Píldora oscura del detalle: edad, género, vestimenta. */
const Etiqueta: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="shrink-0 rounded-full bg-surface-container px-3 py-2 text-label-pill text-[#C8C6C5]">
    {children}
  </span>
);

/**
 * La ficha de un evento, según «Detalle de Evento» de Stitch.
 *
 * Antes no existía como pantalla: la ficha era el primer paso del acceso, y
 * para leer a qué hora cerraba una fiesta había que entrar en el flujo del QR.
 * Ahora la ficha es para decidir (quién va, cuánto cuesta, cómo llegar) y el
 * acceso, para la puerta.
 */
const EventDetailPage = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeEvent } = useAppContext();
  const { withDistance, activity, intents, busyIntent, toggleIntent } = useEventsFeed();

  const [event, setEvent] = useState<Event | null>(null);
  const [estado, setEstado] = useState<'loading' | 'ready' | 'not-found'>('loading');

  // El evento se pide directamente: puede venir de un enlace compartido y no
  // estar en la lista cargada (por ejemplo, si ya ha terminado).
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;

    void api.getEventById(eventId).then((found) => {
      if (cancelled) return;
      setEvent(found);
      setEstado(found ? 'ready' : 'not-found');
      if (found) track('event_viewed', { eventId: found.id, from: 'detail' });
    });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (estado === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
      </div>
    );
  }

  if (estado === 'not-found' || !event) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <AlertTriangle size={44} className="mb-4 text-destructive" />
        <h1 className="mb-2 font-display text-headline-lg">{t('eventAccess.notFound')}</h1>
        <p className="mb-6 text-party-gray">{t('eventAccess.notFoundBody')}</p>
        <PartyButton onClick={() => navigate('/home')}>{t('eventAccess.otherEvents')}</PartyButton>
      </div>
    );
  }

  const live = isEventLive(event);
  const terminado = new Date(event.endDate).getTime() <= Date.now();
  const going = intents.includes(event.id);
  const dentro = activeEvent?.eventId === event.id;
  const distancia = withDistance.find((e) => e.event.id === event.id)?.distance ?? null;
  const cifras = activity[event.id] ?? EMPTY_ACTIVITY;

  const fecha = new Date(event.startDate)
    .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '');

  const compartir = async () => {
    const resultado = await shareOrCopy({
      title: event.name,
      text: t('eventDetail.shareText', { name: event.name, venue: event.venueName ?? '', date: fecha }),
      url: publicLink(`/event/${event.id}`),
    });
    if (resultado === 'copied') toast({ title: t('eventDetail.copied') });
    if (resultado === 'failed') toast({ title: t('common.error'), variant: 'destructive' });
  };

  const verRuta = () => {
    if (!event.location) return;
    const { latitude, longitude } = event.location;
    void openExternal(
      `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    );
  };

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+7rem)] pt-[var(--header-h)]">
      <Header />

      <main className="mx-auto max-w-2xl">
        {/* ---------------------------------------------------------- cartel */}
        <div className="relative h-80 w-full overflow-hidden">
          {event.posterUrl ? (
            <img src={event.posterUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface-high">
              <Martini size={64} className="text-party-primary/30" />
            </div>
          )}
          {/* El único degradado del diseño: funde el cartel con el lienzo para
              que el título no quede sobre una foto ilegible. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-black/60" />

          <div className="absolute inset-x-0 top-4 z-10 flex items-center justify-between px-margin">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label={t('common.back')}
              className="press flex h-10 w-10 items-center justify-center rounded-full bg-[#0E0E11]/80 text-foreground backdrop-blur-md"
            >
              <ArrowLeft size={20} />
            </button>
            {!terminado && (
              <button
                type="button"
                onClick={() => void toggleIntent(event.id)}
                disabled={busyIntent === event.id}
                aria-pressed={going}
                aria-label={going ? t('home.notGoing') : t('home.imGoing')}
                className={cn(
                  'press flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md',
                  going ? 'bg-party-primary text-ink' : 'bg-[#0E0E11]/80 text-foreground',
                )}
              >
                {going ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
              </button>
            )}
          </div>

          {live && <LivePill className="absolute bottom-4 left-margin z-10" />}
        </div>

        {/* ---------------------------------------------------------- título */}
        <div className="flex flex-col gap-1 px-margin pb-3 pt-1">
          <h1 className="font-display text-headline-xl text-white">{event.name}</h1>
          {/* El local lleva a su ficha: horario, más fiestas y seguirlo. */}
          <button
            type="button"
            onClick={() => navigate(`/local/${event.venueId}`)}
            className="press flex w-fit max-w-full items-center gap-1.5 text-left text-body-md text-party-gray hover:text-foreground"
          >
            <Martini size={16} className="shrink-0" />
            <span className="truncate underline decoration-white/20 underline-offset-4">
              {event.venueName}
              {event.city ? ` · ${event.city}` : ''}
            </span>
          </button>
        </div>

        <div className="space-y-4 px-margin">
          {/* ---------------------------------------------------- losetas */}
          <div className="grid grid-cols-3 gap-2">
            <Loseta icon={CalendarDays} value={fecha} label={t('eventDetail.date')} />
            <Loseta
              icon={Clock}
              value={formatHourRange(event.startDate, event.endDate)}
              label={t('eventAccess.schedule')}
            />
            <Loseta
              icon={Navigation}
              value={distancia !== null ? formatDistance(distancia) : '—'}
              label={t('eventDetail.distance')}
            />
          </div>

          {/* ------------------------------------------------ ahora mismo */}
          {/* El ambiente lo da el local desde la puerta; la cifra no se enseña
              nunca, sólo el nivel y de cuándo es. */}
          {live && <LiveThermometer activity={cifras} />}

          {/* ---------------------------------------------------- quién va */}
          {cifras.inside > 0 && (
            <p className="flex items-center gap-2 text-body-md font-bold text-party-primary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-party-primary" />
              {t('home.inside', { count: cifras.inside })}
            </p>
          )}
          {cifras.friendsGoing > 0 && !terminado && (
            <p className="flex items-center gap-2 text-body-md font-bold">
              <Zap size={16} className="text-party-primary" />
              {t('vibe.friendsGoing', { count: cifras.friendsGoing })}
            </p>
          )}
          <WhoIsGoing eventId={event.id} going={cifras.going} />
          {/* Lista Vybe: el local ve quién ha dicho que va. Se avisa aquí,
              donde se decide marcarlo. */}
          {!terminado && !live && (
            <p className="text-caption text-party-gray">{t('eventDetail.intentNote')}</p>
          )}

          {/* ---------------------------------------------------- píldoras */}
          <div className="no-scrollbar -mx-margin flex items-center gap-1 overflow-x-auto px-margin py-0.5">
            <span className="shrink-0 rounded-full bg-party-primary px-3 py-1.5 font-display text-title-card text-ink">
              {event.price !== undefined && event.price > 0 ? `${event.price} €` : t('eventAccess.free')}
            </span>
            {event.minAge !== undefined && <Etiqueta>{event.minAge}+</Etiqueta>}
            {event.theme && <Etiqueta>{event.theme}</Etiqueta>}
            {event.dressCode && <Etiqueta>{event.dressCode}</Etiqueta>}
          </div>

          {/* ------------------------------------------------- descripción */}
          {event.description && (
            <section className="flex flex-col gap-2">
              <h2 className="font-display text-headline-md text-white">{t('eventDetail.description')}</h2>
              <p className="whitespace-pre-line text-body-md leading-relaxed text-[#C8C6C5]">
                {event.description}
              </p>
            </section>
          )}

          {/* ------------------------------------------------------ entradas */}
          {event.bookingUrl && !terminado && (
            <button
              type="button"
              onClick={() => {
                void socialService.trackBookingClick(event.id).catch(() => undefined);
                void openExternal(event.bookingUrl as string);
              }}
              className="press flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-party-primary text-ink">
                <Ticket size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-title-card text-ink">{t('eventAccess.tickets')}</span>
                <span className="block truncate text-caption text-ink/60">{t('eventDetail.ticketsBody')}</span>
              </span>
            </button>
          )}

          {/* -------------------------------------------------- cómo llegar */}
          {event.location && (
            <section className="pb-2">
              <h2 className="mb-2 font-display text-headline-md text-white">{t('eventDetail.directions')}</h2>
              <div className="flex items-center gap-3 rounded-xl bg-white p-3">
                <MapThumb latitude={event.location.latitude} longitude={event.location.longitude} />
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <span className="truncate font-display text-title-card text-ink">
                    {event.location.address || event.venueName}
                  </span>
                  <span className="truncate text-caption font-medium text-ink/60">
                    {[event.city, event.region].filter(Boolean).join(', ')}
                  </span>
                  <button
                    type="button"
                    onClick={verRuta}
                    className="press mt-2 inline-flex items-center gap-1 self-start text-label-pill uppercase text-ink"
                  >
                    <Navigation size={15} className="text-party-primary" />
                    {t('eventDetail.route')}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-right text-[10px] text-party-gray/70">© OpenStreetMap · CARTO</p>
            </section>
          )}
        </div>
      </main>

      {/* ---------------------------------------------- barra de la acción */}
      <div className="fixed inset-x-0 bottom-[var(--nav-h)] z-20 bg-surface-low/95 px-margin py-3 backdrop-blur-lg">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button
            type="button"
            onClick={() => void compartir()}
            aria-label={t('eventDetail.share')}
            className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-container text-foreground hover:bg-surface-high"
          >
            <Share2 size={20} />
          </button>

          {terminado ? (
            <div className="flex h-12 flex-1 items-center justify-center rounded-xl bg-surface-container text-sm font-bold text-party-gray">
              {t('eventDetail.ended')}
            </div>
          ) : dentro ? (
            <button
              type="button"
              onClick={() => navigate(`/event/${event.id}/live`)}
              className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-party-primary font-display text-title-card font-extrabold uppercase tracking-wide text-ink shadow-lg"
            >
              <Undo2 size={20} />
              {t('home.goBack')}
            </button>
          ) : live ? (
            // En directo lo que toca es entrar; decir que vas sigue en el
            // marcador de arriba.
            <button
              type="button"
              onClick={() => navigate(`/event/${event.id}/access`)}
              className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-party-primary font-display text-title-card font-extrabold uppercase tracking-wide text-ink shadow-lg"
            >
              <QrCode size={20} />
              {t('eventDetail.enterNow')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void toggleIntent(event.id)}
              disabled={busyIntent === event.id}
              aria-pressed={going}
              className={cn(
                'press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl font-display text-title-card font-extrabold uppercase tracking-wide shadow-lg disabled:opacity-60',
                going ? 'bg-white text-ink' : 'bg-party-primary text-ink',
              )}
            >
              <CheckCircle2 size={20} />
              {going ? t('eventDetail.confirmed') : t('home.imGoing')}
            </button>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default EventDetailPage;
