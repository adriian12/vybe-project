import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, MapPin, Check } from 'lucide-react';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { venueService, VenueSosAlert } from '@/services/venue-service';

const FALLBACK_AVATAR = '/placeholder.svg';

/**
 * Aviso permanente cuando alguien pide ayuda dentro del local.
 *
 * No va en una pestaña: si hay una emergencia en la sala, el equipo tiene que
 * verla nada más abrir el panel, sin buscarla. Se comprueba cada veinte
 * segundos y sólo aparece si hay algo abierto, así que el resto de la noche no
 * ocupa sitio.
 */
const VenueSosBanner = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [alerts, setAlerts] = useState<VenueSosAlert[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    setAlerts(await venueService.getSosAlerts());
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 20_000);
    return () => clearInterval(interval);
  }, [load]);

  const acknowledge = async (alertId: string) => {
    setIsBusy(true);
    try {
      await venueService.acknowledgeSosAlert(alertId);
      await load();
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    } finally {
      setIsBusy(false);
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`rounded-lg border p-3 ${
            alert.handledAt
              ? 'border-border bg-muted/50'
              : 'border-destructive bg-destructive/10 animate-pulse'
          }`}
        >
          <div className="flex items-start gap-3">
            <img
              src={alert.profilePhoto || FALLBACK_AVATAR}
              alt=""
              className="w-11 h-11 rounded-full object-cover shrink-0"
            />

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-semibold text-destructive">
                <ShieldAlert size={15} className="shrink-0" />
                {t('venue.safety.needsHelp', { name: alert.profileName })}
              </p>
              <p className="text-xs text-muted-foreground">
                {alert.eventName} ·{' '}
                {new Date(alert.createdAt).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {alert.note && <p className="text-sm mt-1 break-words">{alert.note}</p>}

              <div className="mt-2 flex flex-wrap gap-2">
                {alert.latitude !== null && alert.longitude !== null && (
                  <a
                    href={`https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium"
                  >
                    <MapPin size={12} />
                    {t('venue.safety.seeLocation')}
                  </a>
                )}

                {alert.handledAt ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Check size={12} />
                    {t('venue.safety.beingHandled')}
                  </span>
                ) : (
                  <PartyButton
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void acknowledge(alert.id)}
                  >
                    {t('venue.safety.acknowledge')}
                  </PartyButton>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default VenueSosBanner;
