import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode.react';
import { X, Monitor, Users, Gift } from 'lucide-react';
import { PartyButton } from '@/components/ui-custom/party-button';
import { venueService, EventOccupancy } from '@/services/venue-service';
import { vibeKey, vibeLevelFor } from '@/lib/vibe';
import { nightService, Raffle } from '@/services/night';

interface VenueTvViewProps {
  code: string;
  eventId: string;
  eventName?: string;
  venueName?: string;
}

/**
 * Vista a pantalla completa para el monitor de la entrada.
 *
 * El QR del panel sirve en la barra, de móvil a móvil, pero para captar a quien
 * está en la cola hace falta algo que se lea a tres metros. Se muestra también
 * el contador de gente dentro, porque una sala que se ve llena atrae, y ese es
 * justo el problema que tiene la app el primer día en un local nuevo.
 */
const VenueTvView = ({ code, eventId, eventName, venueName }: VenueTvViewProps) => {
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const [occupancy, setOccupancy] = useState<EventOccupancy | null>(null);
  const [raffles, setRaffles] = useState<Raffle[]>([]);

  const load = useCallback(async () => {
    const [occ, sorteos] = await Promise.all([venueService.getOccupancy(eventId), nightService.getRaffles(eventId)]);
    setOccupancy(occ);
    setRaffles(sorteos);
  }, [eventId]);

  useEffect(() => {
    if (!open) return;

    void load();
    const interval = setInterval(() => void load(), 20_000);
    return () => clearInterval(interval);
  }, [open, load]);

  // Salir con Escape: en un monitor sin teclado cómodo, el botón es pequeño.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // El total de la puerta sólo cuenta si es de los últimos 45 minutos, como
  // en la app (`fresh_headcount()`).
  const fresco =
    occupancy?.headcount !== null &&
    occupancy?.headcount !== undefined &&
    occupancy.headcountAt !== null &&
    Date.now() - new Date(occupancy.headcountAt).getTime() < 45 * 60_000;
  const nivel = fresco
    ? vibeLevelFor(Math.max(occupancy.headcount ?? 0, occupancy.inside), occupancy.capacity)
    : null;

  // En la pantalla, el sorteo que toca: el ganador de los últimos diez minutos
  // o el siguiente programado.
  const ahora = Date.now();
  const ganado = raffles.find(
    (r) => r.status === 'drawn' && r.drawnAt && ahora - new Date(r.drawnAt).getTime() < 10 * 60_000,
  );
  const siguiente = raffles.find((r) => r.status === 'scheduled');

  if (!open) {
    return (
      <PartyButton variant="outline" size="sm" className="w-full gap-2" onClick={() => setOpen(true)}>
        <Monitor size={16} />
        {t('venue.tv.open')}
      </PartyButton>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-party-primary text-party-dark p-8">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute top-4 right-4 rounded-full bg-white/15 p-2"
        aria-label={t('common.close')}
      >
        <X size={20} />
      </button>

      <p className="text-5xl font-extrabold tracking-tight mb-4">Fiestea</p>

      <p className="max-w-3xl text-center text-2xl md:text-3xl font-semibold leading-snug mb-8">
        {t('venue.qr.posterSlogan')}
      </p>

      <div className="rounded-3xl bg-white p-6 leading-none">
        <QRCode value={code} size={320} level="H" includeMargin renderAs="svg" />
      </div>

      <p className="mt-6 text-4xl font-bold tracking-[0.3em] tabular-nums">{code}</p>

      {eventName && <p className="mt-6 text-2xl font-semibold">{eventName}</p>}
      {venueName && <p className="text-lg opacity-80">{venueName}</p>}

      {/* Es una pantalla pública: el ambiente, nunca la cifra de la puerta. */}
      {nivel && (
        <p className="mt-6 rounded-full bg-party-dark px-6 py-2 text-2xl font-extrabold uppercase tracking-wide text-party-primary">
          {t(vibeKey(nivel))}
        </p>
      )}
      {occupancy && occupancy.inside > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-full bg-white/15 px-5 py-2 text-xl font-medium">
          <Users size={20} />
          {t('venue.tv.vybeCount', { count: occupancy.inside })}
        </p>
      )}

      {ganado ? (
        <p className="mt-6 rounded-2xl bg-party-dark px-6 py-3 text-center text-2xl font-extrabold text-party-primary">
          {t('venue.tv.raffleWinner', { name: ganado.winnerName ?? '—', prize: ganado.prize })}
        </p>
      ) : siguiente ? (
        <p className="mt-6 flex items-center gap-2 rounded-full bg-white/15 px-5 py-2 text-xl font-semibold">
          <Gift size={20} />
          {siguiente.drawAt
            ? t('venue.tv.raffleAt', {
                time: new Date(siguiente.drawAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
                prize: siguiente.prize,
              })
            : t('venue.tv.raffleSoon', { prize: siguiente.prize })}
        </p>
      ) : null}

      <p className="mt-auto text-sm opacity-70">{t('venue.qr.posterFooter')}</p>
    </div>
  );
};

export default VenueTvView;
