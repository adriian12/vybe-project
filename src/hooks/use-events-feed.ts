import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/context/app-context';
import { useToast } from '@/components/ui/use-toast';
import { calculateDistance, Coordinates, FAST_POSITION, getCurrentPosition } from '@/services/geo';
import { EMPTY_ACTIVITY, EventActivity, socialService } from '@/services/social';
import { track } from '@/lib/observability';
import { Event } from '@/types/venue';

export type Activity = Record<string, EventActivity>;

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
const ULTIMA_POSICION_KEY = 'fiestea_last_position';

/** La última posición guardada; `null` si no hay o es de hace más de 30 días. */
const leerUltimaPosicion = (): Coordinates | null => {
  try {
    const guardada = JSON.parse(localStorage.getItem(ULTIMA_POSICION_KEY) ?? 'null') as
      | { latitude: number; longitude: number; at: number }
      | null;
    if (!guardada || Date.now() - guardada.at > 30 * 86_400_000) return null;
    return { latitude: guardada.latitude, longitude: guardada.longitude };
  } catch {
    return null;
  }
};

const guardarUltimaPosicion = (coords: Coordinates) => {
  try {
    localStorage.setItem(
      ULTIMA_POSICION_KEY,
      JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, at: Date.now() }),
    );
  } catch {
    // Sin almacenamiento sólo se pierde el recuerdo.
  }
};

export const useEventsFeed = () => {
  const { events, refreshEvents, currentUser } = useAppContext();
  const invitado = currentUser?.accountType === 'guest';
  const { t } = useTranslation();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  // La última posición conocida se usa al abrir, mientras llega la de ahora:
  // sin ella, inicio enseñaba fiestas de toda España hasta tener ubicación.
  const [position, setPositionEstado] = useState<Coordinates | null>(leerUltimaPosicion);
  const setPosition = useCallback((coords: Coordinates) => {
    setPositionEstado(coords);
    guardarUltimaPosicion(coords);
  }, []);
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
    // Primero la posición rápida (la de la red vale para saber la ciudad); el
    // GPS fino tardaba hasta 15 s y dentro de casa se quedaba sin posición.
    void getCurrentPosition(FAST_POSITION)
      .catch(() => getCurrentPosition())
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
  }, [refreshEvents, setPosition]);

  // Contadores de actividad, refrescados cada minuto: es lo que rompe el
  // problema de la sala vacía.
  useEffect(() => {
    if (events.length === 0) return;
    let cancelled = false;
    const ids = events.map((e) => e.id);

    const cargar = () =>
      socialService.getEventsActivity(ids).then((data) => {
        if (cancelled) return;
        // Cuánta gente hay y el ambiente son de Vyber: al invitado se le quedan
        // los «voy a ir» y lo práctico (cola, puerta cerrada, qué suena).
        if (invitado) {
          for (const id of Object.keys(data)) {
            data[id] = { ...data[id], inside: 0, vibeLevel: null, vibeAt: null, trend: null, womenShare: null };
          }
        }
        setActivity(data);
      });

    void cargar();
    const interval = setInterval(() => void cargar(), 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [events, invitado]);

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
            ...EMPTY_ACTIVITY,
            ...prev[eventId],
            going: Math.max((prev[eventId]?.going ?? 0) + (going ? 1 : -1), 0),
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

  /** Vuelve a pedir la posición (el botón del mapa); `null` si no se puede. */
  const relocate = useCallback(async (): Promise<Coordinates | null> => {
    try {
      const coords = await getCurrentPosition(FAST_POSITION).catch(() => getCurrentPosition());
      setPosition(coords);
      setLocationDenied(false);
      return coords;
    } catch {
      setLocationDenied(true);
      return null;
    }
  }, [setPosition]);

  return {
    events,
    withDistance,
    isLoading,
    position,
    relocate,
    locationDenied,
    activity,
    intents,
    busyIntent,
    toggleIntent,
  };
};
