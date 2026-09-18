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
 *   · el equilibrio entre chicas y chicos con Vybe dentro, en decenas y sólo
 *     con diez o más personas, para no señalar a nadie;
 *   · si la puerta está cerrada.
 *
 * Nada de esto es la cifra del local: esa no sale nunca de su panel. Si no hay
 * ningún dato, no se pinta nada.
 */
const LiveThermometer = ({ activity }: { activity: EventActivity }) => {
  const { t } = useTranslation();
  const { vibeLevel, vibeAt, trend, queueLevel, nowPlaying, womenShare, entryClosed } = activity;

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
  if (womenShare !== null) {
    filas.push({ icon: Users, text: t('thermometer.mix', { women: womenShare, men: 100 - womenShare }) });
  }

  if (!vibeLevel && filas.length === 0) return null;

  return (
    <section aria-label={t('thermometer.title')} className="space-y-2">
      <p className="text-label-pill uppercase tracking-wider text-party-gray">{t('thermometer.title')}</p>
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
