import { useTranslation } from 'react-i18next';
import { Eye, Flame, Heart, Sparkles, Ticket, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EMPTY_ACTIVITY, EventActivity, EventSignals } from '@/services/social';
import { GOING_MIN, SignalLine, signalLine, signalTags } from '@/lib/event-signals';
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
  const { going, inside, vibeLevel, trend, signals } = activity ?? EMPTY_ACTIVITY;

  // Con poca gente no se dice cuántos van: sale el dato real más fuerte
  // (visitas, gente mirando entradas, seguidores) o «Recién añadida».
  if (going < GOING_MIN && inside === 0 && !vibeLevel) {
    return <SignalText signals={signals} tone={tone} className={className} />;
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

const SIGNAL_ICON: Record<SignalLine['key'], React.ElementType> = {
  views: Eye,
  clicks: Ticket,
  followers: Heart,
  new: Sparkles,
  beFirst: Sparkles,
};

/** El texto de un dato real, para cuando todavía van pocos (`event-signals.ts`). */
// eslint-disable-next-line react-refresh/only-export-components
export const useSignalText = () => {
  const { t } = useTranslation();
  return (line: SignalLine): string =>
    line.key === 'followers'
      ? t('signals.followers', { count: line.count, venue: line.venue })
      : line.key === 'views' || line.key === 'clicks'
        ? t(`signals.${line.key}`, { count: line.count })
        : t(`signals.${line.key}`);
};

export const SignalText: React.FC<{
  signals?: EventSignals;
  tone?: 'light' | 'dark';
  className?: string;
}> = ({ signals, tone = 'light', className }) => {
  const texto = useSignalText();
  const line = signalLine(signals);
  const Icono = SIGNAL_ICON[line.key];
  const fuerte = line.key !== 'beFirst';
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1.5 text-[11px]',
        fuerte ? 'font-bold' : '',
        tone === 'light' ? (fuerte ? 'text-ink' : 'text-ink/50') : fuerte ? 'text-foreground' : 'text-party-gray',
        className,
      )}
    >
      <Icono size={13} className={cn('shrink-0', fuerte && 'text-party-primary')} aria-hidden />
      <span className="truncate">{texto(line)}</span>
    </span>
  );
};

const TAG_ICON = { lastTickets: Ticket, fillsUp: Users, popular: TrendingUp, featured: Flame } as const;

/**
 * «Últimas entradas», «Se suele llenar», «Popular en Palma», «Destacada»:
 * sólo lo que es verdad de la fiesta (migración 146).
 */
export const SignalTags: React.FC<{
  signals?: EventSignals;
  featured?: boolean;
  small?: boolean;
  max?: number;
  className?: string;
}> = ({ signals, featured, small, max, className }) => {
  const { t } = useTranslation();
  const tags = signalTags(signals, { featured }).slice(0, max);
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((tag) => {
        const Icono = TAG_ICON[tag.key];
        return (
          <span
            key={tag.key}
            className={cn(
              'flex items-center gap-1 whitespace-nowrap rounded-full font-bold',
              tag.key === 'lastTickets' ? 'bg-destructive/10 text-destructive' : 'bg-party-primary/15 text-foreground',
              small ? 'px-2 py-[3px] text-[10px] leading-[14px]' : 'px-2.5 py-1 text-[11px]',
              className,
            )}
          >
            <Icono size={small ? 10 : 12} aria-hidden />
            {tag.key === 'popular' ? t('signals.tags.popular', { city: tag.city }) : t(`signals.tags.${tag.key}`)}
          </span>
        );
      })}
    </>
  );
};
