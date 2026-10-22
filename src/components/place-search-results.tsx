import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Martini } from 'lucide-react';

export interface PlaceResult {
  /** El nombre tal como lo trae la fiesta: «Amok Mallorca». */
  name: string;
  city: string | null;
  upcoming: number;
}

/**
 * Salas que coinciden con la búsqueda del mapa aunque no sean negocios de
 * Fiestea (las de Funout y el escáner): llevan a su ficha (`/sala/<nombre>`)
 * con todas sus fiestas.
 */
const PlaceSearchResults = ({ places }: { places: PlaceResult[] }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (places.length === 0) return null;

  return (
    <div className="pointer-events-auto overflow-hidden rounded-2xl bg-white text-ink shadow-lg shadow-black/30">
      <p className="px-4 pb-1 pt-3 text-caption font-bold uppercase tracking-wide text-ink/50">{t('map.places')}</p>
      <ul>
        {places.map((place) => (
          <li key={place.name}>
            <button
              type="button"
              onClick={() => navigate(`/sala/${encodeURIComponent(place.name)}`)}
              className="press flex w-full items-center gap-3 px-4 py-2.5 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/[0.06]">
                <Martini size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-title-card">{place.name}</span>
                <span className="block truncate text-caption text-ink/60">
                  {[place.city, t('map.venueParties', { count: place.upcoming })].filter(Boolean).join(' · ')}
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

export default PlaceSearchResults;
