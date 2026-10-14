import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { nightService, VenueSummary } from '@/services/night';

/**
 * «Negocios que sigues» en el perfil (`get_my_followed_venues`, migración
 * 110): una fila de logos que lleva a la ficha de cada uno, con su siguiente
 * fiesta. Sin ninguno, una línea que explica cómo seguirlos.
 */
const FollowedVenues = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [venues, setVenues] = useState<VenueSummary[] | null>(null);

  useEffect(() => {
    let vivo = true;
    void nightService
      .getFollowedVenues()
      .then((lista) => vivo && setVenues(lista))
      .catch(() => vivo && setVenues([]));
    return () => {
      vivo = false;
    };
  }, []);

  if (venues === null) return null;

  return (
    <section className="rounded-2xl bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 font-display text-title-card uppercase">
        <Heart size={17} className="text-party-primary" />
        {t('followedVenues.title')}
      </h2>
      {venues.length === 0 ? (
        <p className="text-body-sm text-party-gray">{t('followedVenues.empty')}</p>
      ) : (
        <ul className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {venues.map((venue) => (
            <li key={venue.id} className="w-20 shrink-0">
              <button
                type="button"
                onClick={() => navigate(`/local/${venue.id}`)}
                className="press flex w-full flex-col items-center gap-1.5 text-center"
              >
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white">
                  {venue.logoUrl ? (
                    <img src={venue.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-headline-md text-ink">{venue.name.charAt(0)}</span>
                  )}
                </span>
                <span className="line-clamp-2 w-full text-caption font-bold leading-tight">{venue.name}</span>
                <span className="w-full truncate text-[11px] text-party-gray">
                  {venue.nextEventAt
                    ? new Date(venue.nextEventAt)
                        .toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })
                        .replace(/\./g, '')
                    : t('followedVenues.noParties')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default FollowedVenues;
