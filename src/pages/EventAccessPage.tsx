import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, BadgeCheck, Loader2, LocateFixed, Navigation, RotateCw } from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import QRScanner from '@/components/qr-scanner';
import { formatHour } from '@/components/event-bits';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useAppContext } from '@/context/app-context';
import { api, ApiError } from '@/services/api';
import { nightService } from '@/services/night';
import { useToast } from '@/components/ui/use-toast';
import {
  calculateDistance,
  Coordinates,
  formatDistance,
  GeolocationError,
  getCurrentPosition,
  getMockPosition,
  setMockPosition,
} from '@/services/geo';
import { track } from '@/lib/observability';
import { cn } from '@/lib/utils';
import { Event } from '@/types/venue';

type Ubicacion =
  | { estado: 'checking' }
  | { estado: 'inside'; distance: number | null }
  | { estado: 'far'; distance: number; radius: number }
  | { estado: 'error'; message: string };

/**
 * La puerta, según «Acceso al Evento - Escanear QR» de Stitch.
 *
 * Antes eran tres pantallas seguidas (ficha, ubicación y lector) y había que
 * pulsar dos veces antes de ver la cámara. Ahora la ubicación se comprueba sola
 * al entrar y se enseña como una tarjeta encima del código: si estás dentro del
 * radio, el lector ya está listo; si no, dice a cuánto estás.
 *
 * La comprobación definitiva la hace el servidor al canjear el código. Esta
 * sólo evita que alguien escanee desde casa para nada.
 */
const EventAccessPage = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { redeemEventCode, enterPlatformEvent } = useAppContext();

  const [event, setEvent] = useState<Event | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ubicacion, setUbicacion] = useState<Ubicacion>({ estado: 'checking' });
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [mocked, setMocked] = useState(() => getMockPosition() !== null);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;

    void api.getEventById(eventId).then((found) => {
      if (cancelled) return;
      setEvent(found);
      setCargando(false);
    });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const comprobarUbicacion = useCallback(async () => {
    if (!event) return;

    // Evento sin ubicación (la sala de pruebas): se entra desde cualquier sitio,
    // sin pedir el GPS.
    if (event.requiresLocation === false) {
      setUbicacion({ estado: 'inside', distance: null });
      return;
    }

    setUbicacion({ estado: 'checking' });

    try {
      const position = await getCurrentPosition();
      setCoords(position);
      track('location_verified', { eventId: event.id });

      if (!event.location) {
        setUbicacion({ estado: 'inside', distance: null });
        return;
      }

      const distance = calculateDistance(
        position.latitude,
        position.longitude,
        event.location.latitude,
        event.location.longitude,
      );
      const radius = event.eventRadius ?? 50;

      setUbicacion(
        distance > radius ? { estado: 'far', distance, radius } : { estado: 'inside', distance },
      );
    } catch (error) {
      setUbicacion({
        estado: 'error',
        message: error instanceof GeolocationError ? error.message : t('errors.generic'),
      });
    }
  }, [event, t]);

  useEffect(() => {
    if (event) void comprobarUbicacion();
  }, [event, comprobarUbicacion]);

  /**
   * Sitúa el dispositivo en el evento sin moverse de sitio. Sólo en desarrollo:
   * `setMockPosition` no hace nada en un build de producción.
   */
  const toggleMockLocation = () => {
    if (mocked) {
      setMockPosition(null);
      setMocked(false);
    } else if (event?.location) {
      setMockPosition({
        latitude: event.location.latitude,
        longitude: event.location.longitude,
        accuracy: 5,
      });
      setMocked(true);
    }
    void comprobarUbicacion();
  };

  const handleCode = useCallback(
    async (code: string) => {
      if (!eventId) return;

      setIsValidating(true);
      setScanError(null);

      try {
        const access = await redeemEventCode(code, coords ?? undefined);
        track('code_redeemed', { eventId: access.eventId });

        // Si el local tiene tarjeta de sellos, se dice al entrar cómo va.
        void nightService.getMyStampCard(access.eventId).then((card) => {
          if (!card || !card.eventCounts) return;
          toast({
            title: t('night.stamps.gotOne', { venue: card.venueName }),
            description: card.canClaim
              ? t('night.stamps.full', { reward: card.rewardTitle })
              : t('night.stamps.progress', { stamps: Math.min(card.stamps, card.required), total: card.required }),
          });
        });

        // Un código válido de otro evento lleva a ese evento, no a este.
        navigate(`/event/${access.eventId}/live`, { replace: true });
      } catch (error) {
        track('code_rejected', { eventId, code: error instanceof ApiError ? error.code : 'unknown' });
        setScanError(error instanceof ApiError ? error.message : t('errors.generic'));
      } finally {
        setIsValidating(false);
      }
    },
    [eventId, coords, redeemEventCode, navigate, t, toast],
  );

  /** Fiestas de Fiestea: sin código, basta con estar dentro del radio. */
  const entrarSinCodigo = useCallback(async () => {
    if (!eventId) return;
    setIsValidating(true);
    setScanError(null);
    try {
      const access = await enterPlatformEvent(eventId, coords ?? undefined);
      track('code_redeemed', { eventId: access.eventId });
      navigate(`/event/${access.eventId}/live`, { replace: true });
    } catch (error) {
      setScanError(error instanceof ApiError ? error.message : t('errors.generic'));
    } finally {
      setIsValidating(false);
    }
  }, [eventId, coords, enterPlatformEvent, navigate, t]);

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <AlertTriangle size={44} className="mb-4 text-destructive" />
        <h1 className="mb-2 font-display text-headline-lg">{t('eventAccess.notFound')}</h1>
        <p className="mb-6 text-party-gray">{t('eventAccess.notFoundBody')}</p>
        <PartyButton onClick={() => navigate('/home')}>{t('eventAccess.otherEvents')}</PartyButton>
      </div>
    );
  }

  const noEmpezado = new Date(event.startDate).getTime() > Date.now();
  const lugar = [event.venueName, event.city].filter(Boolean).join(' · ');

  const punto = {
    checking: 'bg-party-gray animate-pulse',
    inside: 'bg-emerald-500',
    far: 'bg-destructive',
    error: 'bg-party-accent',
  }[ubicacion.estado];

  const tarjeta = (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 text-ink">
      <span className={cn('h-3 w-3 shrink-0 rounded-full', punto)} aria-hidden />

      <div className="min-w-0 flex-1">
        {ubicacion.estado === 'checking' && (
          <>
            <p className="font-display text-title-card">{t('eventAccess.checkingTitle')}</p>
            <p className="truncate text-body-sm text-ink/60">{lugar}</p>
          </>
        )}
        {ubicacion.estado === 'inside' && (
          <>
            <p className="font-display text-title-card">{t('eventAccess.insideRadius')}</p>
            <p className="truncate text-body-sm text-ink/60">
              {ubicacion.distance !== null
                ? t('eventAccess.distanceFrom', { distance: formatDistance(ubicacion.distance), place: lugar })
                : lugar}
            </p>
          </>
        )}
        {ubicacion.estado === 'far' && (
          <>
            <p className="font-display text-title-card">
              {t('eventAccess.farTitle', { distance: formatDistance(ubicacion.distance) })}
            </p>
            <p className="text-body-sm text-ink/60">
              {t('eventAccess.farBody', { radius: ubicacion.radius, venue: event.venueName ?? '' })}
            </p>
          </>
        )}
        {ubicacion.estado === 'error' && (
          <>
            <p className="font-display text-title-card">{t('eventAccess.noLocationTitle')}</p>
            <p className="text-body-sm text-ink/60">{ubicacion.message}</p>
          </>
        )}
      </div>

      {ubicacion.estado === 'checking' ? (
        <Loader2 size={22} className="shrink-0 animate-spin text-ink/50" />
      ) : ubicacion.estado === 'inside' ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-party-primary">
          <BadgeCheck size={20} />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void comprobarUbicacion()}
          aria-label={t('eventAccess.tryAgain')}
          className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-party-primary"
        >
          <RotateCw size={18} />
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
      <Header />

      <main className="mx-auto max-w-md space-y-5 px-margin pt-5">
        <div>
          <p className="flex items-center gap-2 text-label-pill uppercase tracking-wider text-party-primary">
            <span className="h-2 w-2 rounded-full bg-party-primary" />
            {t('eventAccess.atTheDoor')}
          </p>
          <h1 className="mt-1 font-display text-headline-xl">{t('eventAccess.title')}</h1>
          <p className="mt-1 text-body-md text-party-gray">{t('eventAccess.subtitle')}</p>
          <p className="mt-2 truncate text-body-sm font-bold text-foreground">{event.name}</p>
        </div>

        {noEmpezado && (
          <p className="flex items-center gap-2 rounded-xl bg-card px-4 py-3 text-body-sm text-party-gray">
            <LocateFixed size={16} className="shrink-0 text-party-primary" />
            {t('eventAccess.notStarted', { time: formatHour(event.startDate) })}
          </p>
        )}

        {event.byPlatform ? (
          <div className="space-y-3">
            {tarjeta}
            <p className="text-body-sm text-party-gray">{t('eventAccess.platformHelp', { app: t('common.appName') })}</p>
            {scanError && <p className="rounded-xl bg-destructive/15 px-4 py-3 text-body-sm font-bold text-destructive">{scanError}</p>}
            <PartyButton
              size="lg"
              className="w-full"
              disabled={ubicacion.estado !== 'inside' || isValidating}
              onClick={() => void entrarSinCodigo()}
            >
              {isValidating && <Loader2 size={16} className="animate-spin" />}
              {t('eventAccess.enterHere')}
            </PartyButton>
          </div>
        ) : (
          <QRScanner
            onScanSuccess={(code) => void handleCode(code)}
            isValidating={isValidating}
            error={scanError}
            disabled={ubicacion.estado !== 'inside'}
            status={tarjeta}
          />
        )}

        {import.meta.env.DEV && event.location && (
          <button
            type="button"
            onClick={toggleMockLocation}
            className="press flex w-full items-center justify-center gap-2 text-xs text-party-gray underline underline-offset-4 hover:text-foreground"
          >
            <Navigation size={12} />
            {mocked ? t('eventAccess.mockOff') : t('eventAccess.mockOn')}
          </button>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default EventAccessPage;
