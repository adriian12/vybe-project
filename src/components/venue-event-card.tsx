import { useNavigate } from 'react-router-dom';
import { Martini, Sparkles } from 'lucide-react';
import { formatHourRange } from '@/components/event-bits';
import type { VenueEventSummary } from '@/services/night';
import { cn } from '@/lib/utils';

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');

/** Una fiesta del negocio en su ficha y en la página de un día: abre su ficha. */
const VenueEventCard = ({ event, large = false }: { event: VenueEventSummary; large?: boolean }) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/event/${event.id}`)}
      className="press flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left text-ink"
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/10',
          large ? 'h-28 w-20' : 'h-14 w-14',
        )}
      >
        {event.posterUrl ? (
          <img src={event.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Martini size={20} className="opacity-40" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn('font-display', large ? 'line-clamp-2 text-headline-md leading-tight' : 'truncate text-title-card')}>
            {event.name}
          </span>
          {event.featured && <Sparkles size={14} className="shrink-0 text-party-accent" />}
        </span>
        <span className="block truncate text-body-sm text-ink/60">
          {fechaCorta(event.startDate)} · {formatHourRange(event.startDate, event.endDate)}
        </span>
        {event.theme && <span className="block truncate text-caption text-ink/50">{event.theme}</span>}
      </span>
    </button>
  );
};

export default VenueEventCard;
