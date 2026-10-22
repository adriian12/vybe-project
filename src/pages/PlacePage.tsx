import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, List, Loader2, MapPin, Martini, Navigation } from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import MapThumb from '@/components/map-thumb';
import { LivePill } from '@/components/event-bits';
import VenueCalendar from '@/components/venue-calendar';
import VenueEventCard from '@/components/venue-event-card';
import { useAppContext } from '@/context/app-context';
import { isFeatured } from '@/lib/featured';
import { nightOf } from '@/lib/date-filter';
import { clave } from '@/lib/scan-groups';
import { openExternal } from '@/services/native';
import type { VenueEventSummary } from '@/services/night';
import { cn } from '@/lib/utils';

type Vista = 'list' | 'calendar';
/** La misma preferencia que la ficha de un negocio. */
const VISTA_KEY = 'fiestea_venue_events_view';
const leerVista = (): Vista => {
  try {
    return localStorage.getItem(VISTA_KEY) === 'calendar' ? 'calendar' : 'list';
  } catch {
    return 'list';
  }
};

/**
 * La ficha de una sala que aún no es negocio en Fiestea (`/sala/<nombre>`):
 * «Amok Mallorca», «Sonido Alicante»… Sale de las fiestas que la nombran
 * (`place_name`, las que trae Funout o el escáner), así que no hay nada que
 * seguir: sólo su sitio y sus fiestas, en lista o en calendario, como la ficha
 * de un negocio.
 */
const PlacePage = () => {
  const { nombre = '' } = useParams<{ nombre: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { events, refreshEvents } = useAppContext();
  const [cargando, setCargando] = useState(events.length === 0);
  const [vista, setVista] = useState<Vista>(leerVista);
  const [dia, setDia] = useState<string | null>(null);

  useEffect(() => {
    if (events.length > 0) return;
    void refreshEvents().finally(() => setCargando(false));
  }, [events.length, refreshEvents]);

  const cambiarVista = (v: Vista) => {
    setVista(v);
    setDia(null);
    try {
      localStorage.setItem(VISTA_KEY, v);
    } catch {
      // Sin almacenamiento sólo se pierde la preferencia.
    }
  };

  const buscada = clave(nombre);
  const suyas = useMemo(
    () =>
      events
        .filter((e) => e.placeName && clave(e.placeName) === buscada)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    [events, buscada],
  );

  const ahora = Date.now();
  const resumen = (e: (typeof suyas)[number]): VenueEventSummary => ({
    id: e.id,
    name: e.name,
    startDate: e.startDate,
    endDate: e.endDate,
    posterUrl: e.posterUrl ?? null,
    price: e.price ?? null,
    theme: e.theme ?? null,
    featured: isFeatured(e),
  });
  const enDirecto = suyas.find(
    (e) => new Date(e.startDate).getTime() <= ahora && new Date(e.endDate).getTime() > ahora,
  );
  const proximos = suyas.filter((e) => new Date(e.startDate).getTime() > ahora).map(resumen);
  const delDia = dia ? proximos.filter((e) => nightOf(e.startDate) === dia) : [];

  // Lo que se enseña de la sala sale de su fiesta más completa.
  const conSitio = suyas.find((e) => e.location) ?? suyas[0];
  const titulo = conSitio?.placeName ?? decodeURIComponent(nombre);

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
      </div>
    );
  }

  if (suyas.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <Martini size={40} className="text-party-primary" />
        <p className="font-display text-headline-md">{t('placePage.notFound')}</p>
        <button type="button" onClick={() => navigate(-1)} className="press text-body-sm underline">
          {t('common.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
      <Header />

      <main className="mx-auto max-w-2xl space-y-5 px-margin pt-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="press flex h-10 w-10 items-center justify-center rounded-full bg-surface-low"
        >
          <ArrowLeft size={20} />
        </button>

        {/* ---------------------------------------------------------- cabecera */}
        <section className="rounded-3xl bg-surface-low p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-party-primary font-display text-headline-md font-black text-ink">
              {titulo
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p.charAt(0).toUpperCase())
                .join('')}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-headline-lg leading-tight">{titulo}</h1>
              <p className="text-body-sm text-party-gray">
                {t('placePage.kind')}
                {conSitio?.city ? ` · ${conSitio.city}` : ''}
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ en directo */}
        {enDirecto && (
          <button
            type="button"
            onClick={() => navigate(`/event/${enDirecto.id}`)}
            className="press flex w-full items-center justify-between gap-3 rounded-2xl bg-party-primary p-4 text-left text-ink"
          >
            <span className="min-w-0">
              <LivePill className="mb-1" />
              <span className="block truncate font-display text-headline-md">{enDirecto.name}</span>
              <span className="text-body-sm text-ink/70">
                {t('venuePage.until', {
                  time: new Date(enDirecto.endDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
                })}
              </span>
            </span>
            <span className="shrink-0 rounded-xl bg-ink px-3 py-2 font-display text-title-card text-party-primary">
              {t('venuePage.go')}
            </span>
          </button>
        )}

        {/* ------------------------------------------------------- ubicación */}
        {conSitio?.location && (
          <section className="flex items-center gap-3 rounded-2xl bg-surface-low p-3">
            <MapThumb
              latitude={conSitio.location.latitude}
              longitude={conSitio.location.longitude}
              className="shrink-0 rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-body-sm font-semibold">
                <MapPin size={15} className="shrink-0 text-party-primary" />
                <span className="line-clamp-2">{conSitio.location.address || conSitio.city || titulo}</span>
              </p>
              <button
                type="button"
                onClick={() =>
                  void openExternal(
                    `https://www.google.com/maps/dir/?api=1&destination=${conSitio.location!.latitude},${conSitio.location!.longitude}`,
                  )
                }
                className="press mt-2 flex items-center gap-1.5 rounded-lg bg-party-primary px-3 py-1.5 text-caption font-bold text-ink"
              >
                <Navigation size={14} />
                {t('venuePage.directions')}
              </button>
            </div>
          </section>
        )}

        {/* --------------------------------------------------------- eventos */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-headline-md">{t('venuePage.upcoming')}</h2>
            {proximos.length > 0 && (
              <div className="flex shrink-0 rounded-xl bg-surface-low p-1" role="tablist" aria-label={t('venuePage.view')}>
                {(
                  [
                    ['list', List, t('venuePage.viewList')],
                    ['calendar', CalendarDays, t('venuePage.viewCalendar')],
                  ] as const
                ).map(([v, Icono, etiqueta]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={vista === v}
                    aria-label={etiqueta}
                    onClick={() => cambiarVista(v)}
                    className={cn(
                      'press flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-caption font-bold',
                      vista === v ? 'bg-party-primary text-ink' : 'text-party-gray',
                    )}
                  >
                    <Icono size={16} />
                    <span className="hidden sm:inline">{etiqueta}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {proximos.length === 0 ? (
            <p className="text-body-sm text-party-gray">{t('placePage.noUpcoming')}</p>
          ) : vista === 'calendar' ? (
            <div className="space-y-3">
              <VenueCalendar
                events={proximos}
                dayOf={(e) => nightOf(e.startDate)}
                onDay={(key, lista) => (lista.length === 1 ? navigate(`/event/${lista[0].id}`) : setDia(key))}
              />
              {/* Varias fiestas la misma noche: debajo, para elegir. */}
              {delDia.length > 1 && (
                <ul className="space-y-2">
                  {delDia.map((e) => (
                    <li key={e.id}>
                      <VenueEventCard event={e} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {proximos.map((e) => (
                <li key={e.id}>
                  <VenueEventCard event={e} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default PlacePage;
