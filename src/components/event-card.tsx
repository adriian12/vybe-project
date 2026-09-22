import { useTranslation } from 'react-i18next';
import { ArrowRight, Bookmark, BookmarkCheck, Clock, MapPin, Music, Sparkles, Ticket } from 'lucide-react';
import { isFeatured } from '@/lib/featured';
import { formatDistance } from '@/services/geo';
import { EventActivity, socialService } from '@/services/social';
import { Event } from '@/types/venue';
import { cn } from '@/lib/utils';
import {
  AttendeeStack,
  DateBadge,
  LivePill,
  TimePill,
  formatHour,
  formatHourRange,
} from '@/components/event-bits';

interface EventCardProps {
  event: Event;
  /** Distancia en metros, o `null` si no hay ubicación todavía. */
  distance: number | null;
  activity?: EventActivity;
  /** Ha marcado «voy a ir». */
  going: boolean;
  busy: boolean;
  live: boolean;
  onOpen: () => void;
  onToggleIntent: () => void;
  /**
   * `featured` es la tarjeta estrecha del carrusel de destacados; `full`, la
   * de la lista de próximos eventos.
   */
  variant?: 'featured' | 'full';
}

/** Píldora oscura sobre la tarjeta blanca: edad, género, código de vestimenta. */
const Tag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full bg-surface-low px-2.5 py-1 text-[11px] font-bold text-foreground">
    {children}
  </span>
);

/**
 * La tarjeta de un evento, como en la pantalla de inicio de Stitch.
 *
 *   · **El cartel manda**, metido dentro de la tarjeta con su propio radio.
 *   · **La tarjeta es blanca** sobre el lienzo negro: separa una fiesta de la
 *     siguiente sin bordes.
 *   · **El amarillo marca sólo lo que decide**: la fecha, el precio, que está
 *     en directo y que ya has dicho que vas.
 *
 * Sobre el amarillo la tinta va oscura siempre: blanco sobre #F8D000 da 1,4:1
 * de contraste y no se lee.
 */
const EventCard: React.FC<EventCardProps> = ({
  event,
  distance,
  activity,
  going,
  busy,
  live,
  onOpen,
  onToggleIntent,
  variant = 'full',
}) => {
  const { t } = useTranslation();
  const featured = variant === 'featured';

  const precio =
    event.price !== undefined && event.price > 0 ? `${event.price} €` : t('eventAccess.free');

  const guardar = (
    <button
      type="button"
      aria-label={going ? t('home.notGoing') : t('home.imGoing')}
      aria-pressed={going}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onToggleIntent();
      }}
      className={cn(
        'press absolute flex items-center justify-center rounded-full shadow-md',
        featured ? 'right-2.5 top-2.5 h-8 w-8' : 'right-3 top-3 h-9 w-9',
        going ? 'bg-party-primary text-ink' : 'bg-[#0E0E11]/80 text-white',
      )}
    >
      {going ? <BookmarkCheck size={featured ? 16 : 18} /> : <Bookmark size={featured ? 16 : 18} />}
    </button>
  );

  return (
    <article
      onClick={onOpen}
      className={cn(
        'press flex cursor-pointer select-none flex-col overflow-hidden rounded-2xl bg-white shadow-xl',
        featured ? 'w-[215px] shrink-0 p-2' : 'w-full p-3',
      )}
    >
      {/* ----------------------------------------------------------- cartel */}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-xl bg-surface',
          featured ? 'aspect-[16/9]' : 'aspect-[16/10]',
        )}
      >
        {event.posterUrl ? (
          <img src={event.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          // Sin cartel la tarjeta tiene que seguir pareciendo terminada.
          <div className="flex h-full w-full items-center justify-center bg-surface-high">
            <Music size={featured ? 32 : 40} className="text-party-primary/40" />
          </div>
        )}

        <DateBadge
          iso={event.startDate}
          size={featured ? 'sm' : 'md'}
          className={cn('absolute', featured ? 'left-2.5 top-2.5' : 'left-3 top-3')}
        />

        {guardar}

        <div
          className={cn(
            'absolute flex items-end gap-2',
            featured ? 'inset-x-2.5 bottom-2.5' : 'inset-x-3 bottom-3',
          )}
        >
          {live ? (
            <LivePill />
          ) : featured ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-party-primary px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-ink shadow-md">
              <Clock size={11} />
              {formatHour(event.startDate)}
            </span>
          ) : (
            <TimePill>{formatHourRange(event.startDate, event.endDate)}</TimePill>
          )}

          {distance !== null && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#0E0E11]/80 px-2 py-1 text-[11px] font-semibold text-white">
              <MapPin size={11} />
              {formatDistance(distance)}
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------ datos */}
      <div className={cn('flex flex-col px-1 pb-1', featured ? 'pt-3' : 'pt-3')}>
        {featured ? (
          <>
            <h3 className="truncate font-display text-title-card text-ink">{event.name}</h3>
            <p className="mt-0.5 truncate text-body-sm text-[#66666E]">
              {event.venueName}
              {event.city ? ` · ${event.city}` : ''}
            </p>
          </>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-display text-headline-md font-black text-ink">
                {event.name}
              </h3>
              <p className="mt-0.5 truncate text-body-sm text-[#66666E]">
                {event.venueName}
                {event.city ? ` · ${event.city}` : ''}
              </p>
            </div>
            <span className="shrink-0 rounded-xl bg-party-primary px-3 py-1.5 font-display text-base font-black text-ink shadow-sm">
              {precio}
            </span>
          </div>
        )}

        <div className={cn('flex flex-wrap items-center gap-1.5', featured ? 'mt-2.5' : 'mt-3')}>
          {isFeatured(event) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-party-accent px-2.5 py-1 text-[11px] font-black text-white">
              <Sparkles size={11} />
              {t('home.sponsored')}
            </span>
          )}
          {featured && (
            <span className="rounded-full bg-party-primary px-2.5 py-1 text-[11px] font-black text-ink">
              {precio}
            </span>
          )}
          {event.theme && <Tag>{event.theme}</Tag>}
          {event.minAge !== undefined && <Tag>{event.minAge}+</Tag>}
          {!featured && event.dressCode && <Tag>{event.dressCode}</Tag>}
          {!featured && live && <Tag>{t('home.endsAt', { time: formatHour(event.endDate) })}</Tag>}
        </div>

        {/* La destacada va sin pie: así caben los eventos antes de bajar. */}
        <div
          className={cn(
            'flex items-center justify-between gap-2',
            featured ? 'hidden' : 'mt-3 border-t border-black/[0.06] pt-3',
          )}
        >
          <AttendeeStack activity={activity} />

          {featured ? (
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-party-primary text-ink shadow-sm"
            >
              <ArrowRight size={17} />
            </span>
          ) : event.bookingUrl ? (
            // El clic se anota antes de abrir la web del local: es la última
            // fila del embudo que el local ve en sus datos. Si el registro
            // falla, el enlace se abre igual.
            <a
              href={event.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                void socialService.trackBookingClick(event.id).catch(() => undefined);
              }}
              className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-bold text-party-primary"
            >
              {t('home.buy')}
              <Ticket size={15} />
            </a>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onToggleIntent();
              }}
              className={cn(
                'press inline-flex h-9 shrink-0 items-center rounded-xl px-4 text-sm font-bold disabled:opacity-50',
                going ? 'bg-party-primary text-ink' : 'bg-ink text-party-primary',
              )}
            >
              {going ? t('home.notGoing') : t('home.imGoing')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

export default EventCard;
