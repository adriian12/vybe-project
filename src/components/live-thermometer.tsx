import { useTranslation } from 'react-i18next';
import { DoorClosed, Music2, TrendingDown, TrendingUp, Minus, Users, Hourglass } from 'lucide-react';
import { VibeMeter } from '@/components/event-bits';
import { EventActivity } from '@/services/social';
import { cn } from '@/lib/utils';

/**
 * Termómetro en vivo de una fiesta: cómo está la sala antes de ir.
 *
 *   · el ambiente (Tranquilo… Lleno), que da el local desde la puerta;
 *   · si se está llenando o vaciando;
 *   · la cola en la puerta y lo que suena, si el local lo cuenta;
 *   · cuánta gente hay dentro, si el negocio lo publica (`show_headcount`);
 *   · el % de mujeres y hombres, si el negocio lo publica
 *     (`show_gender_split`), en decenas y sólo con diez o más personas, para no
 *     señalar a nadie;
 *   · si la puerta está cerrada.
 *
 * Si no hay ningún dato, no se pinta nada.
 */
const LiveThermometer = ({ activity }: { activity: EventActivity }) => {
  const { t } = useTranslation();
  const { vibeLevel, vibeAt, trend, queueLevel, nowPlaying, womenShare, entryClosed, headcount } = activity;

  const filas: { icon: typeof Users; text: string; tone?: 'warn' }[] = [];
  if (entryClosed) filas.push({ icon: DoorClosed, text: t('thermometer.entryClosed'), tone: 'warn' });
  if (trend) {
    filas.push({
      icon: trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus,
      text: t(`thermometer.trend.${trend}`),
    });
  }
  if (queueLevel) filas.push({ icon: Hourglass, text: t(`thermometer.queue.${queueLevel}`) });
  if (nowPlaying) filas.push({ icon: Music2, text: t('thermometer.nowPlaying', { song: nowPlaying }) });
  if (!vibeLevel && filas.length === 0 && headcount === null && womenShare === null) return null;

  return (
    <section aria-label={t('thermometer.title')} className="space-y-2">
      <p className="text-label-pill uppercase tracking-wider text-party-gray">{t('thermometer.title')}</p>
      {(headcount !== null || womenShare !== null) && (
        <div className="rounded-2xl bg-surface-low p-4">
          {headcount !== null && (
            <p className="flex items-baseline gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0 self-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-party-primary opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-party-primary" />
              </span>
              <span className="font-display text-headline-lg leading-none tabular">{headcount}</span>
              <span className="text-body-sm text-party-gray">{t('thermometer.headcount', { count: headcount })}</span>
            </p>
          )}
          {womenShare !== null && (
            <div className={cn(headcount !== null && 'mt-3')}>
              <div className="flex justify-between text-caption font-bold">
                <span>{t('thermometer.women', { pct: womenShare })}</span>
                <span>{t('thermometer.men', { pct: 100 - womenShare })}</span>
              </div>
              <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-party-accent" style={{ width: `${womenShare}%` }} />
                <div className="h-full flex-1 bg-party-primary" />
              </div>
            </div>
          )}
        </div>
      )}
      {vibeLevel && <VibeMeter level={vibeLevel} at={vibeAt} />}
      {filas.length > 0 && (
        <ul className="grid gap-2 rounded-2xl bg-surface-low p-3 sm:grid-cols-2">
          {filas.map((fila) => (
            <li
              key={fila.text}
              className={cn('flex items-center gap-2 text-body-sm', fila.tone === 'warn' && 'font-bold text-party-accent')}
            >
              <fila.icon size={16} className={cn('shrink-0', fila.tone === 'warn' ? '' : 'text-party-primary')} />
              <span className="min-w-0 truncate">{fila.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default LiveThermometer;
