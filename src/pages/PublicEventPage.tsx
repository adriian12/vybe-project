import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock, ExternalLink, Loader2, MapPin, Music, Navigation, Smartphone } from 'lucide-react';
import LanguageSwitcher from '@/components/language-switcher';
import { VybeMark } from '@/components/brand/vybe-logo';
import EventTickets from '@/components/event-tickets';
import { formatHourRange } from '@/components/event-bits';
import { PublicEvent, ticketsService } from '@/services/tickets';
import { openExternal } from '@/services/native';
import { DOWNLOAD_PATH, landingHref } from '@/lib/hosts';
import { setSeo } from '@/lib/seo';

/**
 * La ficha de una fiesta en el navegador, sin cuenta (migración 125).
 *
 * Un enlace a una fiesta abierto en el ordenador llevaba a «Fiestea se vive
 * desde el móvil» y se perdía la venta. Aquí se ve lo necesario para decidir
 * (cartel, día, sala, line-up) y se compran las entradas sin cuenta: llegan al
 * correo del formulario. Quién va, el tablón y lo demás siguen en la app.
 */
const PublicEventPage = () => {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const { t, i18n } = useTranslation();
  const [evento, setEvento] = useState<PublicEvent | null | undefined>(undefined);
  const [conEntradas, setConEntradas] = useState(0);

  useEffect(() => {
    let vivo = true;
    void ticketsService.getPublicEvent(eventId).then((e) => vivo && setEvento(e));
    return () => {
      vivo = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (!evento) return;
    setSeo({
      title: `${evento.name} · Fiestea`,
      description: [evento.placeName ?? evento.venueName, evento.city].filter(Boolean).join(' · '),
      path: `/event/${evento.id}`,
    });
  }, [evento]);

  if (evento === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
      </div>
    );
  }

  const cabecera = (
    <header className="flex items-center justify-between gap-3 px-margin py-4">
      <a href={landingHref('/')} className="flex items-center gap-2">
        <VybeMark size={34} />
        <span className="font-display text-title-card">Fiestea</span>
      </a>
      <LanguageSwitcher />
    </header>
  );

  if (!evento) {
    return (
      <div className="min-h-screen bg-background">
        {cabecera}
        <main className="mx-auto max-w-md px-margin py-16 text-center">
          <h1 className="font-display text-headline-lg">{t('publicEvent.notFound')}</h1>
          <p className="mt-2 text-body-md text-party-gray">{t('publicEvent.notFoundBody')}</p>
        </main>
      </div>
    );
  }

  const fecha = new Date(evento.startDate).toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const sala = evento.placeName ?? (evento.venueIsPlatform ? null : evento.venueName);
  const artistas = evento.lineup.map((a) => a.name).filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      {cabecera}

      <main className="mx-auto grid max-w-5xl gap-6 px-margin pb-16 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ------------------------------------------------------- la fiesta */}
        <section className="space-y-5">
          <div className="overflow-hidden rounded-3xl bg-surface-high">
            {evento.posterUrl ? (
              <img src={evento.posterUrl} alt="" className="max-h-[70vh] w-full object-contain" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center">
                <Music size={56} className="text-party-primary/30" />
              </div>
            )}
          </div>

          <div>
            {sala && <p className="text-label-pill uppercase tracking-wider text-party-primary">{sala}</p>}
            <h1 className="font-display text-headline-xl leading-tight">{evento.name}</h1>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            <li className="flex items-center gap-2 rounded-2xl bg-surface-low p-3 text-body-sm font-semibold capitalize">
              <CalendarDays size={18} className="shrink-0 text-party-primary" />
              {fecha}
            </li>
            <li className="flex items-center gap-2 rounded-2xl bg-surface-low p-3 text-body-sm font-semibold">
              <Clock size={18} className="shrink-0 text-party-primary" />
              {formatHourRange(evento.startDate, evento.endDate)}
            </li>
            {(evento.address || evento.city) && (
              <li className="flex items-center gap-2 rounded-2xl bg-surface-low p-3 text-body-sm font-semibold sm:col-span-2">
                <MapPin size={18} className="shrink-0 text-party-primary" />
                <span className="min-w-0 flex-1">{[evento.address, evento.city].filter(Boolean).join(' · ')}</span>
                {evento.latitude !== null && evento.longitude !== null && (
                  <button
                    type="button"
                    onClick={() =>
                      void openExternal(
                        `https://www.google.com/maps/dir/?api=1&destination=${evento.latitude},${evento.longitude}`,
                      )
                    }
                    className="press flex shrink-0 items-center gap-1 rounded-lg bg-party-primary px-2.5 py-1 text-caption font-bold text-ink"
                  >
                    <Navigation size={13} />
                    {t('venuePage.directions')}
                  </button>
                )}
              </li>
            )}
          </ul>

          {evento.minAge ? <p className="text-body-sm text-party-gray">{t('publicEvent.minAge', { age: evento.minAge })}</p> : null}

          {artistas.length > 0 && (
            <div>
              <h2 className="mb-2 font-display text-title-card uppercase tracking-wide">{t('publicEvent.lineup')}</h2>
              <p className="text-body-md">{artistas.join(' · ')}</p>
            </div>
          )}

          {evento.description && (
            <p className="whitespace-pre-line text-body-md text-foreground/90">{evento.description}</p>
          )}
        </section>

        {/* ------------------------------------------------------ entradas */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-3xl bg-surface-low p-4">
            <h2 className="mb-3 font-display text-headline-md">{t('publicEvent.tickets')}</h2>
            <EventTickets eventId={evento.id} onCount={setConEntradas} bare guest />
            {conEntradas === 0 &&
              (evento.bookingUrl ? (
                // Las de otras webs (Fourvenues, Xceed…): allí se compran.
                <button
                  type="button"
                  onClick={() => void openExternal(evento.bookingUrl as string)}
                  className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-party-primary font-display text-title-card text-ink"
                >
                  {t('publicEvent.buyOutside')}
                  <ExternalLink size={16} />
                </button>
              ) : (
                <p className="text-body-sm text-party-gray">{t('publicEvent.noTickets')}</p>
              ))}
            {conEntradas > 0 && <p className="mt-3 text-caption text-party-gray">{t('publicEvent.guestNote')}</p>}
          </div>

          <a
            href={DOWNLOAD_PATH}
            className="press flex items-center gap-3 rounded-3xl bg-party-primary p-4 text-ink"
          >
            <Smartphone size={26} className="shrink-0" />
            <span>
              <span className="block font-display text-title-card">{t('publicEvent.appTitle')}</span>
              <span className="block text-body-sm text-ink/75">{t('publicEvent.appBody')}</span>
            </span>
          </a>
        </aside>
      </main>
    </div>
  );
};

export default PublicEventPage;
