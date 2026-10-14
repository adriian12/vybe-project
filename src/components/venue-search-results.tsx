import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { nightService, VenueSummary } from '@/services/night';

/**
 * Negocios que coinciden con lo que se escribe en el buscador del mapa
 * (`search_venues`, migración 110). Las fiestas se siguen filtrando en el mapa;
 * esto añade los negocios para ir a su ficha.
 */
const VenueSearchResults = ({ query }: { query: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [venues, setVenues] = useState<VenueSummary[]>([]);

  useEffect(() => {
    const texto = query.trim();
    if (texto.length < 2) {
      setVenues([]);
      return;
    }
    let vivo = true;
    // Se espera a que deje de escribir para no pedir en cada letra.
    const espera = window.setTimeout(() => {
      void nightService
        .searchVenues(texto)
        .then((lista) => vivo && setVenues(lista.slice(0, 4)))
        .catch(() => vivo && setVenues([]));
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [query]);

  if (venues.length === 0) return null;

  return (
    <div className="pointer-events-auto overflow-hidden rounded-2xl bg-white text-ink shadow-lg shadow-black/30">
      <p className="px-4 pb-1 pt-3 text-caption font-bold uppercase tracking-wide text-ink/50">{t('map.venues')}</p>
      <ul>
        {venues.map((venue) => (
          <li key={venue.id}>
            <button
              type="button"
              onClick={() => navigate(`/local/${venue.id}`)}
              className="press flex w-full items-center gap-3 px-4 py-2.5 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/[0.06]">
                {venue.logoUrl ? (
                  <img src={venue.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-title-card">{venue.name.charAt(0)}</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-title-card">{venue.name}</span>
                <span className="block truncate text-caption text-ink/60">
                  {[venue.isPlatform ? null : venue.city, t('map.venueParties', { count: venue.upcoming })]
                    .filter(Boolean)
                    .join(' · ')}
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

export default VenueSearchResults;
