import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, ChevronRight, Flame, Loader2, PartyPopper, User } from 'lucide-react';
import { useAppContext } from '@/context/app-context';
import Header from '@/components/header';
import Footer from '@/components/footer';
import EventCard from '@/components/event-card';
import ActivitySheet, { useActivity } from '@/components/activity-sheet';
import { track } from '@/lib/observability';
import { isEventLive, isEventTonight, useEventsFeed } from '@/hooks/use-events-feed';
import { Event } from '@/types/venue';
import { isFeatured } from '@/lib/featured';
import PartyFilters, { useDateLabel } from '@/components/party-filters';
import { isNearDate, matchesDate, nightOf, useDateSelection } from '@/lib/date-filter';
import RatePartyPrompt from '@/components/rate-party';
import { aplicarFiltros, Franja } from '@/lib/party-filters';

/** Cuántas tarjetas caben en el carrusel de destacados. */
const DESTACADOS = 5;

/** Título de sección en Outfit, con algo opcional a la derecha. */
const Seccion: React.FC<{ titulo: React.ReactNode; extra?: React.ReactNode }> = ({ titulo, extra }) => (
  <div className="flex items-center justify-between gap-3 px-margin">
    <h2 className="font-display text-headline-lg text-foreground">{titulo}</h2>
    {extra}
  </div>
);

/**
 * La portada, según la pantalla «Inicio / Lista de Eventos» de Stitch: saludo,
 * lo que está en directo, tres cifras, destacados en carrusel, filtro por
 * género y la lista completa.
 */
const HomePage = () => {
  const { activeEvent, currentUser } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { withDistance, isLoading, activity, intents, busyIntent, toggleIntent } =
    useEventsFeed();

  const [theme, setTheme] = useState<string | null>(null);
  const [franja, setFranja] = useState<Franja | null>(null);
  const [avisosAbiertos, setAvisosAbiertos] = useState(false);
  const avisos = useActivity(intents);

  const openEvent = (event: Event) => {
    if (activeEvent?.eventId === event.id) {
      navigate(`/event/${event.id}/live`);
      return;
    }
    track('event_viewed', { eventId: event.id });
    navigate(`/event/${event.id}`);
  };

  /**
   * Las píldoras de género salen de los eventos que hay, no de una lista fija:
   * una píldora de «Reggaetón» en una noche sin reggaetón sólo lleva a una
   * pantalla vacía.
   */
  const themes = useMemo(() => {
    const encontradas = new Set<string>();
    for (const { event } of withDistance) if (event.theme) encontradas.add(event.theme);
    return [...encontradas].sort();
  }, [withDistance]);

  // Música y horario; después, la fecha (por defecto, hoy).
  const filtrados = useMemo(() => aplicarFiltros(withDistance, theme, franja), [withDistance, theme, franja]);
  const fecha = useDateSelection();
  const etiquetaFecha = useDateLabel();
  const delDia = useMemo(() => filtrados.filter(({ event }) => matchesDate(event, fecha)), [filtrados, fecha]);
  const cercaDeLaFecha = useMemo(() => filtrados.filter(({ event }) => isNearDate(event, fecha)), [filtrados, fecha]);
  // Sin fiestas ese día no se enseña la pantalla vacía: las próximas.
  const sinFiestas = !isLoading && delDia.length === 0 && cercaDeLaFecha.length === 0;
  const visible = sinFiestas ? filtrados : delDia;
  const noches = useMemo(() => [...new Set(withDistance.map(({ event }) => nightOf(event.startDate)))], [withDistance]);

  useEffect(() => {
    if (theme && !themes.includes(theme)) setTheme(null);
  }, [themes, theme]);

  const enDirecto = useMemo(() => filtrados.filter(({ event }) => isEventLive(event)), [filtrados]);

  /**
   * Destacados: primero los que el local ha pagado por destacar, y después los
   * que tienen más movimiento. Pesa más la gente que ya está dentro que la que
   * dice que irá, porque es la señal que no miente.
   */
  const destacados = useMemo(() => {
    const puntos = (id: string) => (activity[id]?.inside ?? 0) * 3 + (activity[id]?.going ?? 0);
    const ahora = Date.now();
    return [...visible]
      .filter(({ event }) => isFeatured(event, ahora) || puntos(event.id) > 0 || isEventLive(event))
      .sort(
        (a, b) =>
          Number(isFeatured(b.event, ahora)) - Number(isFeatured(a.event, ahora)) ||
          puntos(b.event.id) - puntos(a.event.id),
      )
      .slice(0, DESTACADOS);
  }, [visible, activity]);

  const foto = currentUser?.avatar || currentUser?.photos?.[0];
  const hora = new Date().getHours();
  const saludo = hora >= 6 && hora < 14 ? t('home.greetingDay') : t('home.greetingNight');

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
      <Header />
      {/* Qué tal estuvo la última fiesta: sale al volver de ella. */}
      <RatePartyPrompt />

      <main className="mx-auto max-w-2xl space-y-6 pt-3">
        {/* ------------------------------------------------------- saludo */}
        <section className="flex items-center justify-between px-margin">
          <Link to="/profile" className="press flex min-w-0 items-center gap-3">
            <span className="relative shrink-0">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-card text-party-gray">
                {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : <User size={22} />}
              </span>
              <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-party-primary ring-2 ring-background" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-caption text-party-gray">{saludo}</span>
              <span className="truncate font-display text-headline-md font-extrabold">
                {currentUser?.name ?? t('common.appName')}
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setAvisosAbiertos(true)}
            aria-label={t('activity.title')}
            className="press relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-low text-foreground"
          >
            <Bell size={21} />
            {avisos.length > 0 && (
              <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-party-primary" />
            )}
          </button>
        </section>

        {/* --------------------------------------------- evento en el que estás */}
        {activeEvent && (
          <section className="px-margin">
            <button
              type="button"
              onClick={() => navigate(`/event/${activeEvent.eventId}/live`)}
              className="press flex w-full items-center justify-between gap-3 rounded-2xl bg-party-primary p-4 text-left text-ink"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-label-pill uppercase">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-ink" />
                  {t('home.youAreIn')}
                </span>
                <span className="mt-0.5 block truncate font-display text-headline-md font-black">
                  {activeEvent.eventName}
                </span>
                <span className="block truncate text-body-sm text-ink/70">{activeEvent.venueName}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 rounded-xl bg-ink px-3 py-2 text-sm font-bold text-party-primary">
                {t('home.goBack')}
                <ChevronRight size={16} />
              </span>
            </button>
          </section>
        )}

        {/* ------------------------------------------------------ en directo */}
        {enDirecto.length > 0 && (
          <section className="space-y-3">
            <Seccion
              titulo={
                <span className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-party-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-party-primary" />
                  </span>
                  {t('home.liveNow')}
                </span>
              }
              extra={
                <Link
                  to="/map"
                  className="text-label-pill uppercase tracking-wider text-party-primary hover:underline"
                >
                  {t('home.seeAll')}
                </Link>
              }
            />
            <div className="no-scrollbar flex gap-4 overflow-x-auto px-margin py-1">
              {enDirecto.map(({ event }) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => openEvent(event)}
                  className="press group flex w-16 shrink-0 flex-col items-center gap-1.5"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-party-primary p-[2px]">
                    {event.posterUrl ? (
                      <img src={event.posterUrl} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-high font-display text-lg font-black text-party-primary">
                        {(event.venueName ?? event.name).charAt(0)}
                      </span>
                    )}
                  </span>
                  <span className="w-16 truncate text-center text-[10px] text-party-gray group-hover:text-foreground">
                    {event.venueName ?? event.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* --------------------------------------------------------- filtros */}
        {/* Música (todos los géneros dentro) y las franjas de la fiesta. */}
        {!isLoading && withDistance.length > 0 && (
          <PartyFilters
            className="px-margin"
            themes={themes}
            theme={theme}
            onTheme={setTheme}
            franja={franja}
            onFranja={setFranja}
            nights={noches}
          />
        )}

        {/* ------------------------------------------------------ destacados */}
        {destacados.length > 0 && (
          <section className="space-y-3">
            <Seccion titulo={t('home.featured')} />
            <div className="no-scrollbar flex gap-4 overflow-x-auto px-margin py-1">
              {destacados.map(({ event, distance }) => (
                <EventCard
                  key={event.id}
                  variant="featured"
                  event={event}
                  distance={distance}
                  activity={activity[event.id]}
                  going={intents.includes(event.id)}
                  busy={busyIntent === event.id}
                  live={isEventLive(event)}
                  onOpen={() => openEvent(event)}
                  onToggleIntent={() => void toggleIntent(event.id)}
                />
              ))}
            </div>
          </section>
        )}


        {/* ------------------------------------------------------------ lista */}
        <section className="space-y-4 px-margin pt-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-headline-lg first-letter:uppercase">
              {sinFiestas ? t('home.upcoming') : etiquetaFecha(fecha)}
            </h2>
          </div>

          {sinFiestas && filtrados.length > 0 && (
            <p className="rounded-2xl bg-card px-4 py-3 text-body-sm text-party-gray">
              {t('home.noPartiesThatDay', { day: etiquetaFecha(fecha).toLocaleLowerCase() })}
            </p>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
              <p className="text-sm text-party-gray">{t('common.loading')}</p>
            </div>
          ) : visible.length === 0 && cercaDeLaFecha.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-card px-6 py-12 text-center">
              <PartyPopper size={44} className="mb-4 text-party-primary" />
              <h3 className="mb-2 font-display text-headline-md">{t('home.empty')}</h3>
              <p className="mb-5 max-w-xs text-body-sm text-party-gray">
                {t('home.emptyBody')}
              </p>
            </div>
          ) : (
            // La lista se ve una vez por sesión, así que se permite una entrada
            // escalonada: ayuda a leer que son elementos separados.
            <div className="stagger space-y-4">
              {visible.map(({ event, distance }, index) => (
                <div key={event.id} style={{ '--i': Math.min(index, 8) } as React.CSSProperties}>
                  <EventCard
                    event={event}
                    distance={distance}
                    activity={activity[event.id]}
                    going={intents.includes(event.id)}
                    busy={busyIntent === event.id}
                    live={isEventLive(event)}
                    onOpen={() => openEvent(event)}
                    onToggleIntent={() => void toggleIntent(event.id)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Día elegido en el calendario: también las de dos días antes y después. */}
          {cercaDeLaFecha.length > 0 && (
            <div className="space-y-4 pt-2">
              <h3 className="font-display text-headline-md text-party-gray">{t('home.nearDate')}</h3>
              {cercaDeLaFecha.map(({ event, distance }) => (
                <EventCard
                  key={event.id}
                  event={event}
                  distance={distance}
                  activity={activity[event.id]}
                  going={intents.includes(event.id)}
                  busy={busyIntent === event.id}
                  live={isEventLive(event)}
                  onOpen={() => openEvent(event)}
                  onToggleIntent={() => void toggleIntent(event.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <ActivitySheet open={avisosAbiertos} onOpenChange={setAvisosAbiertos} intents={intents} />
      <Footer />
    </div>
  );
};

export default HomePage;
