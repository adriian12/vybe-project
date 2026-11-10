import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { eventPath } from '@/lib/share';
import type { Event } from '@/types/venue';

/**
 * Fiestas cuyo nombre coincide con la búsqueda del mapa, estén donde estén y
 * sea el día que sea. Antes la búsqueda sólo filtraba lo que ya se veía (la
 * zona del mapa, la ciudad recordada, la fecha elegida) y, si la fiesta estaba
 * en otra ciudad u otro día, no salía nada. Llevan a su ficha.
 */
const EventSearchResults = ({ events }: { events: Event[] }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  if (events.length === 0) return null;

  const fecha = (iso: string) =>
    new Date(iso)
      .toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })
      .replace(/\.$/, '');

  return (
    <div className="pointer-events-auto overflow-hidden rounded-2xl bg-white text-ink shadow-lg shadow-black/30">
      <p className="px-4 pb-1 pt-3 text-caption font-bold uppercase tracking-wide text-ink/50">{t('map.parties')}</p>
      <ul>
        {events.map((event) => (
          <li key={event.id}>
            <button
              type="button"
              onClick={() => navigate(eventPath(event))}
              className="press flex w-full items-center gap-3 px-4 py-2.5 text-left"
            >
              {event.posterUrl ? (
                <img src={event.posterUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/[0.06]">
                  <CalendarDays size={18} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-title-card">{event.name}</span>
                <span className="block truncate text-caption text-ink/60">
                  {[fecha(event.startDate), event.placeName ?? event.venueName, event.city].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink/40" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default EventSearchResults;
