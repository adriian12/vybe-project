import { useTranslation } from 'react-i18next';
import { Event } from '@/types/venue';
import { cn } from '@/lib/utils';

/**
 * Los eventos del local en una fila, para elegir con cuál se trabaja en Código
 * QR, Puerta y Promos. Todos los que aún no han terminado, no sólo el que está
 * en marcha: el QR, las promociones y los retos se preparan antes de la noche.
 */
const EventPicker = ({
  events,
  value,
  onChange,
}: {
  events: Event[];
  value: string | null;
  onChange: (eventId: string) => void;
}) => {
  const { t } = useTranslation();
  const ahora = Date.now();

  if (events.length <= 1) return null;

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
      {events.map((event) => {
        const directo = new Date(event.startDate).getTime() <= ahora && new Date(event.endDate).getTime() > ahora;
        const activo = event.id === value;
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onChange(event.id)}
            aria-pressed={activo}
            className={cn(
              'press flex h-14 shrink-0 flex-col items-start justify-center rounded-2xl px-4 text-left',
              activo ? 'bg-party-primary text-ink' : 'bg-card text-foreground',
            )}
          >
            <span className="max-w-[12rem] truncate font-display text-title-card">{event.name}</span>
            <span className={cn('flex items-center gap-1.5 text-caption', activo ? 'text-ink/70' : 'text-party-gray')}>
              {directo && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              {directo
                ? t('venue.live')
                : new Date(event.startDate).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default EventPicker;
