import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { EMPTY_ACTIVITY, EventActivity } from '@/services/social';
import { VIBE_LEVELS, VibeLevel, vibeFill, vibeKey } from '@/lib/vibe';

/**
 * Piezas que se repiten en cada pantalla que enseña un evento: la fecha en
 * amarillo, la píldora de «en directo», la de la hora y el montón de caras.
 *
 * Están juntas para que la tarjeta de inicio, el mapa, las entradas y el
 * detalle digan lo mismo del mismo modo. En el diseño anterior cada pantalla
 * escribía la fecha a su manera.
 */

/** «23:00» en el idioma y la zona del teléfono. */
// eslint-disable-next-line react-refresh/only-export-components
export const formatHour = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** «23:00 – 06:00». */
// eslint-disable-next-line react-refresh/only-export-components
export const formatHourRange = (start: string, end: string): string =>
  `${formatHour(start)} – ${formatHour(end)}`;

/** Día y mes abreviado, por separado, para la insignia de fecha. */
// eslint-disable-next-line react-refresh/only-export-components
export const dayAndMonth = (iso: string) => {
  const date = new Date(iso);
  return {
    day: date.toLocaleDateString(undefined, { day: 'numeric' }),
    month: date.toLocaleDateString(undefined, { month: 'short' }).replace('.', ''),
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }).replace('.', ''),
  };
};

/** La fecha como la dibuja Stitch: número grande sobre el mes en mayúsculas. */
export const DateBadge: React.FC<{ iso: string; size?: 'sm' | 'md'; className?: string }> = ({
  iso,
  size = 'md',
  className,
}) => {
  const { day, month } = dayAndMonth(iso);

  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl bg-party-primary text-ink shadow-md',
        size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5',
        className,
      )}
    >
      <span
        className={cn(
          'font-display font-black leading-none tabular',
          size === 'sm' ? 'text-base' : 'text-headline-md',
        )}
      >
        {day}
      </span>
      <span
        className={cn(
          'font-extrabold uppercase leading-tight tracking-wider',
          size === 'sm' ? 'text-[9px]' : 'text-[10px]',
        )}
      >
        {month}
      </span>
    </div>
  );
};

/** «EN DIRECTO» con el punto que late. Sólo para lo que pasa ahora. */
export const LivePill: React.FC<{ className?: string; label?: string }> = ({ className, label }) => {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-party-primary px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-ink shadow-md',
        className,
      )}
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-ink" />
      {label ?? t('home.live')}
    </span>
  );
};

/** La hora sobre el cartel, en oscuro para no competir con el amarillo. */
export const TimePill: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full bg-[#0E0E11]/90 px-2.5 py-1 text-caption text-white backdrop-blur-sm',
      className,
    )}
  >
    <span className="h-2 w-2 rounded-full bg-party-primary" />
    {children}
  </span>
);

/** Color del punto de cada nivel de ambiente. */
const VIBE_DOT: Record<VibeLevel, string> = {
  quiet: 'bg-sky-400',
  lively: 'bg-party-primary',
  almost_full: 'bg-party-accent',
  full: 'bg-destructive',
};

/**
 * Cómo está la fiesta y cuánta gente con Vybe hay, con tres círculos delante.
 *
 * Los círculos no llevan cara ni inicial: la lista de quién va es de Premium
 * (`who-is-going.tsx`), y poner iniciales inventadas sería mentir sobre quién
 * está apuntado. Lo que comunican es que hay gente, que es lo que hace falta.
 *
 * En directo manda el ambiente que da el local («Casi lleno»), nunca su cifra;
 * las cifras son siempre de gente con Vybe y lo dicen.
 */
export const AttendeeStack: React.FC<{
  activity?: EventActivity;
  tone?: 'light' | 'dark';
  className?: string;
}> = ({ activity, tone = 'light', className }) => {
  const { t } = useTranslation();
  const ring = tone === 'light' ? 'ring-white' : 'ring-card';
  const text = tone === 'light' ? 'text-ink' : 'text-foreground';
  const { going, inside, vibeLevel, trend } = activity ?? EMPTY_ACTIVITY;

  if (going === 0 && inside === 0 && !vibeLevel) {
    return (
      <span className={cn('text-caption', tone === 'light' ? 'text-ink/50' : 'text-party-gray', className)}>
        {t('home.beFirst')}
      </span>
    );
  }

  const texto = vibeLevel
    ? inside > 0
      ? t('vibe.withVybe', { level: t(vibeKey(vibeLevel)), count: inside })
      : t(vibeKey(vibeLevel))
    : inside > 0
      ? t('home.inside', { count: inside })
      : t('home.goingPlus', { count: going });

  return (
    <span className={cn('flex min-w-0 items-center', className)}>
      <span className="flex shrink-0 -space-x-2" aria-hidden>
        <span className={cn('h-5 w-5 rounded-full bg-surface-container ring-2', ring)} />
        <span className={cn('h-5 w-5 rounded-full bg-surface-highest ring-2', ring)} />
        <span className={cn('h-5 w-5 rounded-full ring-2', ring, vibeLevel ? VIBE_DOT[vibeLevel] : 'bg-party-primary')} />
      </span>
      <span className={cn('ml-2 truncate text-[11px] font-bold', text)}>
        {texto}
        {trend === 'up' && <span aria-label={t('thermometer.trend.up')}> ↑</span>}
        {trend === 'down' && <span aria-label={t('thermometer.trend.down')}> ↓</span>}
      </span>
    </span>
  );
};

/**
 * La barra de ambiente de la ficha: cuatro tramos que se encienden hasta el
 * nivel actual, la etiqueta y de cuándo es el dato. El dato es del local, y se
 * dice («según el local · hace 4 min»).
 */
export const VibeMeter: React.FC<{ level: VibeLevel; at: string | null; className?: string }> = ({
  level,
  at,
  className,
}) => {
  const { t } = useTranslation();
  const encendidos = Math.round(vibeFill(level) * VIBE_LEVELS.length);
  const minutos = at ? Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60_000)) : null;

  return (
    <div className={cn('rounded-2xl bg-surface-low p-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-display text-title-card">
          <span className={cn('h-2.5 w-2.5 animate-pulse rounded-full', VIBE_DOT[level])} />
          {t(vibeKey(level))}
        </p>
        {minutos !== null && (
          <p className="text-caption text-party-gray">
            {minutos < 1 ? t('vibe.sourceNow') : t('vibe.source', { minutes: minutos })}
          </p>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5" aria-hidden>
        {VIBE_LEVELS.map((nivel, i) => (
          <span
            key={nivel}
            className={cn('h-2 rounded-full', i < encendidos ? VIBE_DOT[level] : 'bg-white/[0.08]')}
          />
        ))}
      </div>
    </div>
  );
};
