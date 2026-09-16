import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/context/app-context';
import { useToast } from '@/components/ui/use-toast';
import { calculateDistance, Coordinates, getCurrentPosition } from '@/services/geo';
import { socialService } from '@/services/social';
import { track } from '@/lib/observability';
import { Event } from '@/types/venue';

export type Activity = Record<string, { going: number; inside: number }>;

export interface EventWithDistance {
  event: Event;
  /** Metros hasta el local, o `null` sin ubicación. */
  distance: number | null;
}

/** Está pasando ahora mismo. */
export const isEventLive = (event: Event, now = Date.now()): boolean =>
  new Date(event.startDate).getTime() <= now && new Date(event.endDate).getTime() > now;

/** Empieza o está en marcha dentro de las próximas doce horas. */
export const isEventTonight = (event: Event, now = Date.now()): boolean =>
  new Date(event.startDate).getTime() - now < 12 * 3_600_000 &&
  new Date(event.endDate).getTime() > now;

/**
 * Los eventos con todo lo que las pantallas necesitan alrededor: a qué
 * distancia están, cuánta gente va o está dentro, y a cuáles has dicho que vas.
 *
 * Vivía dentro de la pantalla de inicio. Con el rediseño lo usan también el
 * mapa, las entradas y el detalle de un evento, y cada una lo habría pedido a
 * su manera, con contadores distintos para el mismo evento.
 */
export const useEventsFeed = () => {
  const { events, refreshEvents } = useAppContext();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [activity, setActivity] = useState<Activity>({});
  const [intents, setIntents] = useState<string[]>([]);
  const [busyIntent, setBusyIntent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void refreshEvents().finally(() => {
      if (!cancelled) setIsLoading(false);
    });

    // La distancia es opcional: sin permiso se siguen enseñando los eventos.
    void getCurrentPosition()
      .then((coords) => {
        if (!cancelled) setPosition(coords);
      })
      .catch(() => {
        if (!cancelled) setLocationDenied(true);
      });

    void socialService.getMyIntents().then((list) => {
      if (!cancelled) setIntents(list);
    });

    return () => {
      cancelled = true;
    };
  }, [refreshEvents]);

  // Contadores de actividad, refrescados cada minuto: es lo que rompe el
  // problema de la sala vacía.
  useEffect(() => {
    if (events.length === 0) return;
    let cancelled = false;
    const ids = events.map((e) => e.id);

    const cargar = () =>
      socialService.getEventsActivity(ids).then((data) => {
        if (!cancelled) setActivity(data);
      });

    void cargar();
    const interval = setInterval(() => void cargar(), 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [events]);

  const toggleIntent = useCallback(
    async (eventId: string) => {
      const going = !intents.includes(eventId);
      setBusyIntent(eventId);

      try {
        await socialService.setIntent(eventId, going);
        setIntents((prev) => (going ? [...prev, eventId] : prev.filter((id) => id !== eventId)));
        setActivity((prev) => ({
          ...prev,
          [eventId]: {
            going: Math.max((prev[eventId]?.going ?? 0) + (going ? 1 : -1), 0),
            inside: prev[eventId]?.inside ?? 0,
          },
        }));

        if (going) {
          track('event_viewed', { eventId, intent: true });
          toast({ title: t('home.goingConfirmed') });
        }
      } catch {
        toast({ title: t('common.error'), variant: 'destructive' });
      } finally {
        setBusyIntent(null);
      }
    },
    [intents, t, toast],
  );

  /** Ordenados por cercanía; sin ubicación, por hora de inicio. */
  const withDistance = useMemo<EventWithDistance[]>(
    () =>
      events
        .map((event) => ({
          event,
          distance:
            position && event.location
              ? calculateDistance(
                  position.latitude,
                  position.longitude,
                  event.location.latitude,
                  event.location.longitude,
                )
              : null,
        }))
        .sort((a, b) => {
          if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
          return new Date(a.event.startDate).getTime() - new Date(b.event.startDate).getTime();
        }),
    [events, position],
  );

  return {
    events,
    withDistance,
    isLoading,
    position,
    locationDenied,
    activity,
    intents,
    busyIntent,
    toggleIntent,
  };
};
