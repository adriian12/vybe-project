import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Plus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { nightService, VenueProfile } from '@/services/night';
import { cn } from '@/lib/utils';

/**
 * «Organiza»: el negocio de la fiesta, con su logo, para ir a su ficha y
 * seguirlo sin salir de aquí. En las fiestas de administración y de Funout el
 * organizador es el negocio de la casa, Fiestea.
 */
const VenueOrganizerCard = ({ venueId }: { venueId: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [venue, setVenue] = useState<VenueProfile | null>(null);
  const [siguiendo, setSiguiendo] = useState(false);
  const [cambiando, setCambiando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void nightService.getVenueProfile(venueId).then((perfil) => {
      if (!vivo || !perfil) return;
      setVenue(perfil);
      setSiguiendo(perfil.iFollow);
    });
    return () => {
      vivo = false;
    };
  }, [venueId]);

  if (!venue) return null;

  const seguir = async () => {
    setCambiando(true);
    try {
      const ahora = await nightService.toggleFollow(venue.id);
      setSiguiendo(ahora);
      if (ahora) toast({ title: t('organizer.followed', { name: venue.name }) });
    } catch {
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    } finally {
      setCambiando(false);
    }
  };

  return (
    <section aria-label={t('organizer.title')}>
      <p className="mb-2 text-label-pill uppercase tracking-wider text-party-gray">{t('organizer.title')}</p>
      <div className="flex items-center gap-3 rounded-2xl bg-surface-low p-3">
        <button
          type="button"
          onClick={() => navigate(`/local/${venue.id}`)}
          className="press flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
            {venue.logoUrl ? (
              <img src={venue.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-title-card text-ink">{venue.name.charAt(0)}</span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-title-card">{venue.name}</span>
            <span className="flex items-center gap-0.5 text-caption font-bold text-party-primary">
              {t('organizer.seePage')}
              <ChevronRight size={14} />
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void seguir()}
          disabled={cambiando}
          aria-pressed={siguiendo}
          className={cn(
            'press flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-caption font-bold disabled:opacity-60',
            siguiendo ? 'bg-surface-high text-foreground' : 'bg-party-primary text-ink',
          )}
        >
          {siguiendo ? <Check size={14} /> : <Plus size={14} />}
          {siguiendo ? t('organizer.following') : t('organizer.follow')}
        </button>
      </div>
    </section>
  );
};

export default VenueOrganizerCard;
