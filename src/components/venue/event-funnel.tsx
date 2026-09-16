import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { venueService, EventFunnel as Funnel, HourlyPoint } from '@/services/venue-service';
import { cn } from '@/lib/utils';

interface EventFunnelProps {
  eventId: string;
}

/**
 * Embudo y curva horaria de un evento.
 *
 * El panel anterior mostraba cuatro contadores inventados. Un local paga por
 * saber a qué hora se llena y cuánta gente convierte en cada paso.
 */
const EventFunnelView: React.FC<EventFunnelProps> = ({ eventId }) => {
  const { t } = useTranslation();

  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [hourly, setHourly] = useState<HourlyPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void Promise.all([
      venueService.getEventFunnel(eventId),
      venueService.getEventHourly(eventId),
    ]).then(([f, h]) => {
      if (cancelled) return;
      setFunnel(f);
      setHourly(h);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-party-primary" />
      </div>
    );
  }

  if (!funnel) return null;

  const steps = [
    { label: t('venue.stats.funnelIntents'), value: funnel.intents },
    { label: t('venue.stats.funnelCheckIns'), value: funnel.checkIns },
    { label: t('venue.stats.funnelSwipers'), value: funnel.activeSwipers },
    { label: t('venue.stats.funnelMatches'), value: funnel.matches },
    { label: t('venue.stats.funnelBookings'), value: funnel.bookingClicks },
  ];

  // La primera etapa con datos marca el 100 % de la barra.
  const top = Math.max(...steps.map((s) => s.value), 1);
  const maxHourly = Math.max(...hourly.map((h) => h.checkIns), 1);

  const conversion = funnel.intents > 0 ? Math.round((funnel.checkIns / funnel.intents) * 100) : null;
  const pico = hourly.reduce<(typeof hourly)[number] | null>(
    (best, point) => (!best || point.checkIns > best.checkIns ? point : best),
    null,
  );
  const horaPico = pico ? new Date(pico.hour).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';

  // «Embudo del evento» y «Entradas por hora» de Stitch: barras amarillas
  // sobre tarjetas blancas; en escritorio, una al lado de la otra.
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="surface-light rounded-2xl p-4">
        <h3 className="mb-4 font-display text-title-card uppercase tracking-wide">{t('venue.stats.funnel')}</h3>

        <ul className="space-y-3">
          {steps.map((step, index) => {
            const previous = index === 0 ? null : steps[index - 1].value;
            const rate = previous && previous > 0 ? Math.round((step.value / previous) * 100) : null;

            return (
              <li key={step.label}>
                <div className="mb-1 flex items-baseline justify-between text-body-sm">
                  <span className="font-semibold">{step.label}</span>
                  <span className="font-bold tabular">
                    {step.value}
                    {rate !== null && (
                      <span className="ml-2 text-caption font-normal text-party-gray">
                        {t('venue.stats.conversionRate', { value: rate })}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-black/[0.06]">
                  <div
                    className="h-full rounded-full bg-party-primary transition-[width] duration-500"
                    style={{ width: `${Math.round((step.value / top) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        {conversion !== null && (
          <p className="mt-4 border-t border-black/[0.06] pt-3 text-caption text-party-gray">
            {t('venue.stats.conversionNote', { value: conversion })}
          </p>
        )}
      </section>

      <section className="surface-light rounded-2xl p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-display text-title-card uppercase tracking-wide">{t('venue.stats.hourly')}</h3>
          {pico && pico.checkIns > 0 && (
            <span className="text-caption text-party-gray">
              {t('venue.stats.peak', { time: horaPico, count: pico.checkIns })}
            </span>
          )}
        </div>

        {hourly.length === 0 || hourly.every((h) => h.checkIns === 0) ? (
          <p className="text-body-sm text-party-gray">{t('venue.stats.hourlyEmpty')}</p>
        ) : (
          <div className="flex h-40 items-end gap-1.5" role="img" aria-label={t('venue.stats.hourly')}>
            {hourly.map((point) => {
              const alto = point.checkIns / maxHourly;
              const esPico = pico?.hour === point.hour;
              return (
                <div key={point.hour} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  {esPico && (
                    <span className="rounded bg-party-primary px-1 text-[10px] font-extrabold text-ink">
                      {point.checkIns}
                    </span>
                  )}
                  <div
                    className={cn('w-full rounded-t-md', alto >= 0.35 ? 'bg-party-primary' : 'bg-black/[0.08]')}
                    style={{ height: `${Math.max(alto * 100, 3)}%` }}
                    title={`${point.checkIns}`}
                  />
                  <span className={cn('truncate text-[10px] text-party-gray', esPico && 'font-bold text-ink')}>
                    {new Date(point.hour).getHours()}h
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default EventFunnelView;
