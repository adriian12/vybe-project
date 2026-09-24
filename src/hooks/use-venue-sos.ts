import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { venueService, VenueSosAlert } from '@/services/venue-service';

/** «02:14», la hora a la que se pidió ayuda. */
export const horaAlerta = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export interface VenueSos {
  /** Alertas abiertas del local, las que nadie atiende primero. */
  alerts: VenueSosAlert[];
  /** La alerta nueva que tiene que saltar en pantalla, o null. */
  alarm: VenueSosAlert | null;
  dismissAlarm: () => void;
  acknowledge: (alertId: string) => Promise<void>;
  resolve: (alertId: string) => Promise<void>;
}

/**
 * Las alertas de ayuda del local, al momento.
 *
 * Realtime avisa en cuanto alguien pulsa el botón (la RLS de la migración 066
 * sólo deja ver las de sus fiestas al propietario y al personal) y se vuelve a
 * leer por `get_venue_sos_alerts()`, que trae nombre y foto. Por si Realtime se
 * cae, también se consulta cada quince segundos.
 *
 * `alarm` es la primera alerta sin atender que todavía no ha saltado en esta
 * pantalla: la ventana con sonido sale una vez por alerta, no en cada consulta.
 *
 * Sin `venueId` no hace nada.
 */
/**
 * De dónde salen las alertas. El panel usa la sesión del local (con Realtime);
 * los enlaces del equipo (Seguridad y Camareros, sin cuenta) las piden a
 * `team-access` y sólo consultan cada pocos segundos.
 */
export interface SosSource {
  load: () => Promise<VenueSosAlert[]>;
  acknowledge: (alertId: string) => Promise<void>;
  resolve: (alertId: string) => Promise<void>;
  realtime: boolean;
  intervalMs: number;
}

const PANEL: SosSource = {
  load: () => venueService.getSosAlerts(),
  acknowledge: (alertId) => venueService.acknowledgeSosAlert(alertId),
  resolve: (alertId) => venueService.resolveSosAlert(alertId),
  realtime: true,
  intervalMs: 15_000,
};

export const useVenueSos = (venueId: string | null | undefined, source: SosSource = PANEL): VenueSos => {
  const origen = useRef(source);
  origen.current = source;
  const [alerts, setAlerts] = useState<VenueSosAlert[]>([]);
  const [alarm, setAlarm] = useState<VenueSosAlert | null>(null);

  // Copias para leer el estado sin esperar a que React vuelva a pintar.
  const alertasRef = useRef<VenueSosAlert[]>([]);
  const alarmaRef = useRef<VenueSosAlert | null>(null);
  const vistas = useRef(new Set<string>());

  const mostrar = useCallback((alerta: VenueSosAlert | null) => {
    alarmaRef.current = alerta;
    setAlarm(alerta);
  }, []);

  /** Si no hay ninguna en pantalla, salta la siguiente sin atender. */
  const siguiente = useCallback(() => {
    if (alarmaRef.current) return;
    const nueva = alertasRef.current.find((alerta) => !alerta.handledAt && !vistas.current.has(alerta.id));
    if (nueva) {
      vistas.current.add(nueva.id);
      mostrar(nueva);
    }
  }, [mostrar]);

  const load = useCallback(async () => {
    if (!venueId) return;
    const abiertas = await origen.current.load();
    alertasRef.current = abiertas;
    setAlerts(abiertas);

    // Si la atiende o la cierra otra persona del equipo, la ventana se va sola.
    const actual = alarmaRef.current;
    if (actual && !abiertas.some((alerta) => alerta.id === actual.id && !alerta.handledAt)) {
      mostrar(null);
    }
    siguiente();
  }, [venueId, mostrar, siguiente]);

  useEffect(() => {
    if (!venueId) {
      alertasRef.current = [];
      setAlerts([]);
      mostrar(null);
      return;
    }

    void load();
    const interval = setInterval(() => void load(), origen.current.intervalMs);
    if (!origen.current.realtime) return () => clearInterval(interval);

    // Varias filas pueden cambiar a la vez: una sola lectura por ráfaga.
    let espera: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`venue-sos:${venueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, () => {
        if (espera) clearTimeout(espera);
        espera = setTimeout(() => void load(), 300);
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      if (espera) clearTimeout(espera);
      void supabase.removeChannel(channel);
    };
  }, [venueId, load, mostrar]);

  const acknowledge = useCallback(
    async (alertId: string) => {
      await origen.current.acknowledge(alertId);
      if (alarmaRef.current?.id === alertId) mostrar(null);
      await load();
    },
    [load, mostrar],
  );

  const resolve = useCallback(
    async (alertId: string) => {
      await origen.current.resolve(alertId);
      alertasRef.current = alertasRef.current.filter((alerta) => alerta.id !== alertId);
      setAlerts(alertasRef.current);
      if (alarmaRef.current?.id === alertId) mostrar(null);
      await load();
    },
    [load, mostrar],
  );

  const dismissAlarm = useCallback(() => {
    mostrar(null);
    siguiente();
  }, [mostrar, siguiente]);

  return { alerts, alarm, dismissAlarm, acknowledge, resolve };
};
