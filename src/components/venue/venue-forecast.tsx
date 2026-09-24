import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { venueService, EventForecast } from '@/services/venue-service';
import { cn } from '@/lib/utils';

/**
 * Previsión de asistencia de la fiesta (todos los planes).
 *
 * Sale de los «voy a ir», de cuánta gente de los que lo dijeron vino en
 * noches anteriores del local, de la media de ese día de la semana y, si la
 * puerta contó el total real otras noches, de qué parte del público usa la app.
 * Sirve para ajustar personal y barra antes de abrir.
 */
const VenueForecast = ({ eventId, started }: { eventId: string; started: boolean }) => {
  const { t } = useTranslation();
  const [forecast, setForecast] = useState<EventForecast | null>(null);

  useEffect(() => {
    let vivo = true;
    void venueService.getForecast(eventId).then((f) => {
      if (vivo) setForecast(f);
    });
    return () => {
      vivo = false;
    };
  }, [eventId]);

  // Con la fiesta en marcha manda el contador de la puerta.
  if (!forecast || started) return null;

  const total = forecast.expectedTotal;
  const principal = total ?? forecast.expectedCheckins;
  const aforo = forecast.capacity;
  const porcentaje = aforo ? Math.min(Math.round((principal / aforo) * 100), 100) : null;

  return (
    <div className="surface-light rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
          <TrendingUp size={17} />
          {t('forecast.title')}
        </h3>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-caption font-bold',
            forecast.confidence === 'high'
              ? 'bg-emerald-100 text-emerald-800'
              : forecast.confidence === 'medium'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-black/[0.06] text-ink/70',
          )}
        >
          {t(`forecast.confidence.${forecast.confidence}`)}
        </span>
      </div>

      <p className="font-display text-[32px] font-extrabold leading-none tabular">
        {forecast.low === forecast.high ? principal : `${forecast.low}–${forecast.high}`}
      </p>
      <p className="mt-1 text-caption text-party-gray">
        {total !== null ? t('forecast.totalPeople') : t('forecast.appPeople')}
        {total !== null ? ` · ${t('forecast.withApp', { count: forecast.expectedCheckins })}` : ''}
      </p>

      {porcentaje !== null && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/[0.08]">
          <div
            className={cn('h-full rounded-full', forecast.fullRisk ? 'bg-party-accent' : 'bg-party-primary')}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
      )}

      {forecast.fullRisk && (
        <p className="mt-2 flex items-center gap-1.5 text-caption font-bold text-ink">
          <AlertTriangle size={14} className="shrink-0" />
          {t('forecast.fullRisk')}
        </p>
      )}

      <p className="mt-2 text-caption text-party-gray">
        {t('forecast.basis', { intents: forecast.intents, nights: forecast.pastNights })}
      </p>
    </div>
  );
};

export default VenueForecast;
