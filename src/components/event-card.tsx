import { useTranslation } from 'react-i18next';
import { ArrowRight, Bookmark, BookmarkCheck, Clock, MapPin, Music, Ticket } from 'lucide-react';
import { formatDistance } from '@/services/geo';
import { EventActivity, socialService } from '@/services/social';
import { Event } from '@/types/venue';
import { franjaDe } from '@/lib/party-filters';
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
   * de la lista de próximos eventos; `grid`, la de la cuadrícula de dos
   * columnas, y `row`, la fila de la vista de lista.
   */
  variant?: 'featured' | 'full' | 'grid' | 'row';
}

/**
 * Píldora oscura sobre la tarjeta blanca: edad, género, código de vestimenta.
 * `small`, la de la cuadrícula: más baja para que quepan dos filas fijas.
 */
const Tag: React.FC<{ children: React.ReactNode; small?: boolean }> = ({ children, small }) => (
  <span
    className={cn(
      'whitespace-nowrap rounded-full bg-surface-low font-bold text-foreground',
      small ? 'px-2 py-[3px] text-[10px] leading-[14px]' : 'px-2.5 py-1 text-[11px]',
    )}
  >
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
  // La cuadrícula usa la tarjeta pequeña de los destacados, a todo el ancho.
  const grid = variant === 'grid';
  const featured = variant === 'featured' || grid;
  // Las fiestas que crea administración sin local firman como la app, salvo
  // que lleven su sala (las de Funout, por ejemplo).
  const anfitrion = event.placeName ? (
    event.placeName
  ) : event.byPlatform ? (
    <span className="font-semibold text-ink">{t('home.byPlatform', { app: t('common.appName') })}</span>
  ) : (
    event.venueName
  );

  // «Desde»: casi siempre hay varios precios y el de la ficha es el más bajo.
  // Las importadas (Funout) sin precio no son gratis: su precio no se sabe, y
  // entonces no se enseña ninguno.
  const precio =
    event.price !== undefined && event.price > 0
      ? t('home.fromPrice', { price: `${event.price} €` })
      : event.price === undefined && event.externalSource
        ? null
        : t('eventAccess.free');
  // Tardeo, nocheo o after, según la hora a la que empieza.
  const franja = franjaDe(event);

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

  // Vista de lista: una fila con el cartel pequeño a la izquierda.
  if (variant === 'row') {
    // Lo mismo que el pie de la tarjeta grande: «Entradas» si vende en la app
    // (a la ficha) o en otra web (a esa web); si no, «Voy a ir».
    const venta = activity?.hasTickets ? 'app' : event.bookingUrl ? 'web' : null;
    // El botón va en la fila del precio y los km, al final: antes flotaba
    // encima de la tarjeta y pisaba la línea del sitio, y los km se partían
    // en dos («57 / km») por falta de sitio.
    const boton = 'press inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-xs font-bold';
    const accion =
      venta === 'app' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={cn(boton, 'bg-ink text-party-primary')}
        >
          {t('home.buy')}
          <Ticket size={13} />
        </button>
      ) : venta === 'web' ? (
        <a
          href={event.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            void socialService.trackBookingClick(event.id).catch(() => undefined);
          }}
          className={cn(boton, 'bg-ink text-party-primary')}
        >
          {t('home.buy')}
          <Ticket size={13} />
        </a>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onToggleIntent();
          }}
          className={cn(boton, 'disabled:opacity-50', going ? 'bg-party-primary text-ink' : 'bg-ink text-party-primary')}
        >
          {going ? t('home.goingShort') : t('home.imGoing')}
        </button>
      );
    return (
      <article
        onClick={onOpen}
        className="press relative flex w-full cursor-pointer select-none items-stretch gap-3 overflow-hidden rounded-2xl bg-white p-2 shadow-xl"
      >
        <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl bg-surface">
          {event.posterUrl ? (
            <img src={event.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface-high">
              <Music size={26} className="text-party-primary/40" />
            </div>
          )}
          {live && <LivePill className="absolute bottom-1.5 left-1.5 scale-90" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
          {/* Con el marcador arriba a la derecha, las dos primeras líneas le dejan sitio. */}
          <p className={cn('truncate text-[11px] font-black uppercase tracking-wide text-[#66666E]', venta && 'pr-9')}>
            {new Date(event.startDate)
              .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
              .replace(/\./g, '')}
            {' · '}
            {formatHourRange(event.startDate, event.endDate)}
          </p>
          <h3 className={cn('truncate font-display text-title-card text-ink', venta && 'pr-9')}>{event.name}</h3>
          <p className="truncate text-body-sm text-[#66666E]">
            {anfitrion}
            {event.city ? ` · ${event.city}` : ''}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            {precio && (
              <span className="shrink-0 whitespace-nowrap rounded-full bg-party-primary px-2 py-0.5 text-[11px] font-black text-ink">
                {precio}
              </span>
            )}
            {distance !== null && (
              <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-[#66666E]">
                <MapPin size={11} className="shrink-0" />
                <span className="truncate">{formatDistance(distance)}</span>
              </span>
            )}
            <span className="ml-auto shrink-0">{accion}</span>
          </div>
        </div>
        {/* Con «Voy a ir» abajo, el marcador de arriba sobra. */}
        {venta && (
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
              'press absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full',
              going ? 'bg-party-primary text-ink' : 'bg-surface-low text-white',
            )}
          >
            {going ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        )}
      </article>
    );
  }

  return (
    <article
      onClick={onOpen}
      className={cn(
        'press flex cursor-pointer select-none flex-col overflow-hidden rounded-2xl bg-white shadow-xl',
        // En la cuadrícula, todas igual de altas (h-full en su fila y bloques fijos abajo).
        grid ? 'h-full w-full p-2' : featured ? 'w-[215px] shrink-0 p-2' : 'w-full p-3',
      )}
    >
      {/* ----------------------------------------------------------- cartel */}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-xl bg-surface',
          grid ? 'aspect-square' : featured ? 'aspect-[16/9]' : 'aspect-[16/10]',
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

          {/* En la cuadrícula no cabe junto a la hora: va debajo del local. */}
          {distance !== null && !grid && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#0E0E11]/80 px-2 py-1 text-[11px] font-semibold text-white">
              <MapPin size={11} />
              {formatDistance(distance)}
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------ datos */}
      <div className={cn('flex flex-col px-1 pb-1 pt-3', grid && 'flex-1')}>
        {featured ? (
          <>
            <h3 className="truncate font-display text-title-card text-ink">{event.name}</h3>
            <p className="mt-0.5 truncate text-body-sm text-[#66666E]">
              {anfitrion}
              {event.city ? ` · ${event.city}` : ''}
            </p>
            {/* En la cuadrícula la línea va siempre (vacía si no hay km) para
                que todas las tarjetas midan lo mismo. */}
            {grid && (
              <p
                className={cn(
                  'mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-[#66666E]',
                  distance === null && 'invisible',
                )}
              >
                <MapPin size={11} className="shrink-0" />
                {distance !== null ? formatDistance(distance) : '—'}
              </p>
            )}
          </>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-display text-headline-md font-black text-ink">
                {event.name}
              </h3>
              <p className="mt-0.5 truncate text-body-sm text-[#66666E]">
                {anfitrion}
                {event.city ? ` · ${event.city}` : ''}
              </p>
            </div>
            {precio && (
              <span className="shrink-0 rounded-xl bg-party-primary px-3 py-1.5 font-display text-base font-black text-ink shadow-sm">
                {precio}
              </span>
            )}
          </div>
        )}

        {/* En la cuadrícula, dos filas fijas de etiquetas pequeñas: lo que no
            quepa se queda fuera, pero ninguna tarjeta crece más que otra. */}
        <div
          className={cn(
            'flex flex-wrap items-center',
            grid ? 'mt-2 h-[44px] content-start gap-1 overflow-hidden' : featured ? 'mt-2.5 gap-1.5' : 'mt-3 gap-1.5',
          )}
        >
          {featured && precio && (
            <span
              className={cn(
                'whitespace-nowrap rounded-full bg-party-primary font-black text-ink',
                grid ? 'px-2 py-[3px] text-[10px] leading-[14px]' : 'px-2.5 py-1 text-[11px]',
              )}
            >
              {precio}
            </span>
          )}
          {franja && <Tag small={grid}>{t(`filters.franjas.${franja}`)}</Tag>}
          {event.theme && <Tag small={grid}>{event.theme}</Tag>}
          {event.minAge !== undefined && <Tag small={grid}>{event.minAge}+</Tag>}
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
          ) : activity?.hasTickets ? (
            // Vende entradas en la app: la compra está en la ficha. «Voy a ir»
            // queda dentro de la ficha.
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-bold text-party-primary"
            >
              {t('home.buy')}
              <Ticket size={15} />
            </button>
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
