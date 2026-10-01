import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Loader2, RotateCw } from 'lucide-react';
import { useAppContext } from '@/context/app-context';
import Header from '@/components/header';
import Footer from '@/components/footer';
import QRScanner from '@/components/qr-scanner';
import { ApiError } from '@/services/api';
import { getCurrentPosition, Coordinates, GeolocationError } from '@/services/geo';
import { track } from '@/lib/observability';
import { cn } from '@/lib/utils';

/**
 * Acceso directo por código, sin elegir antes el evento en la lista.
 *
 * Es el camino corto para quien ya tiene el QR delante: la ubicación se pide
 * sola al entrar y el servidor decide a qué evento corresponde el código. Usa
 * el mismo lector que la puerta de un evento concreto.
 */
const LocationPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { redeemEventCode } = useAppContext();

  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [checking, setChecking] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const comprobar = useCallback(async () => {
    setChecking(true);
    setLocationError(null);

    try {
      setCoords(await getCurrentPosition());
      track('location_verified', { from: 'location_page' });
    } catch (error) {
      setLocationError(error instanceof GeolocationError ? error.message : t('errors.generic'));
    } finally {
      setChecking(false);
    }
  }, [t]);

  useEffect(() => {
    void comprobar();
  }, [comprobar]);

  const handleCode = useCallback(
    async (code: string) => {
      setIsValidating(true);
      setScanError(null);

      try {
        const result = await redeemEventCode(code, coords ?? undefined);
        track('code_redeemed', { eventId: result.eventId, from: 'location_page' });
        navigate(`/event/${result.eventId}/live`, { replace: true });
      } catch (error) {
        track('code_rejected', { from: 'location_page' });
        setScanError(error instanceof ApiError ? error.message : t('errors.generic'));
      } finally {
        setIsValidating(false);
      }
    },
    [coords, redeemEventCode, navigate, t],
  );

  const tarjeta = (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 text-ink">
      <span
        aria-hidden
        className={cn(
          'h-3 w-3 shrink-0 rounded-full',
          checking ? 'animate-pulse bg-party-gray' : coords ? 'bg-emerald-500' : 'bg-party-accent',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="font-display text-title-card">
          {checking
            ? t('eventAccess.checkingTitle')
            : coords
              ? t('eventAccess.locationReady')
              : t('eventAccess.noLocationTitle')}
        </p>
        <p className="text-body-sm text-ink/60">
          {locationError ?? t('location.bodyTwo')}
        </p>
      </div>
      {checking ? (
        <Loader2 size={22} className="shrink-0 animate-spin text-ink/50" />
      ) : coords ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-party-primary">
          <BadgeCheck size={20} />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void comprobar()}
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
          <p className="mt-1 text-body-md text-party-gray">{t('location.body')}</p>
        </div>

        <QRScanner
          onScanSuccess={(code) => void handleCode(code)}
          isValidating={isValidating}
          error={scanError}
          disabled={!coords}
          status={tarjeta}
        />
      </main>

      <Footer />
    </div>
  );
};

export default LocationPage;
