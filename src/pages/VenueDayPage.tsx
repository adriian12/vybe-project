import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, Loader2 } from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import VenueEventCard from '@/components/venue-event-card';
import { nightService, VenueEventSummary } from '@/services/night';
import { dayKey, parseDayKey } from '@/lib/month-calendar';

/**
 * Las fiestas de un negocio en un día (`/local/:venueId/dia/2026-10-17`). Se
 * llega desde el calendario de su ficha cuando ese día hay más de una.
 */
const VenueDayPage = () => {
  const { venueId, day } = useParams<{ venueId: string; day: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [nombre, setNombre] = useState<string | null>(null);
  const [fiestas, setFiestas] = useState<VenueEventSummary[] | null>(null);
  const fecha = day ? parseDayKey(day) : null;

  useEffect(() => {
    if (!venueId || !day) return;
    let vivo = true;
    void Promise.all([nightService.getVenueProfile(venueId), nightService.getVenueEvents(venueId)]).then(
      ([perfil, lista]) => {
        if (!vivo) return;
        setNombre(perfil?.name ?? null);
        setFiestas(lista.filter((e) => dayKey(e.startDate) === day));
      },
    );
    return () => {
      vivo = false;
    };
  }, [venueId, day]);

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
      <Header />

      <main className="mx-auto max-w-2xl space-y-5 px-margin pt-3">
        <button
          type="button"
          onClick={() => navigate(`/local/${venueId}`)}
          aria-label={t('common.back')}
          className="press flex h-10 w-10 items-center justify-center rounded-full bg-surface-low"
        >
          <ArrowLeft size={20} />
        </button>

        <header>
          {nombre && <p className="text-body-sm font-bold uppercase tracking-wide text-party-primary">{nombre}</p>}
          <h1 className="font-display text-headline-lg leading-tight first-letter:uppercase">
            {fecha
              ? fecha.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
              : t('venuePage.dayTitle')}
          </h1>
          {fiestas && fiestas.length > 0 && (
            <p className="text-body-sm text-party-gray">{t('venuePage.dayPick', { count: fiestas.length })}</p>
          )}
        </header>

        {fiestas === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-party-primary" />
          </div>
        ) : fiestas.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-low p-6 text-center">
            <CalendarDays size={28} className="text-party-primary" />
            <p className="text-body-sm text-party-gray">{t('venuePage.dayEmpty')}</p>
            <button
              type="button"
              onClick={() => navigate(`/local/${venueId}`)}
              className="press rounded-xl bg-party-primary px-4 py-2 font-display text-title-card text-ink"
            >
              {t('venuePage.backToVenue')}
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {fiestas.map((e) => (
              <li key={e.id}>
                <VenueEventCard event={e} large />
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default VenueDayPage;
