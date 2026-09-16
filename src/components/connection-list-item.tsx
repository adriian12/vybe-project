import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlarmClock, ChevronRight, MapPin } from 'lucide-react';
import { MatchConnection } from '@/types/user';
import { cn } from '@/lib/utils';

interface ConnectionListItemProps {
  connection: MatchConnection;
  lastMessage?: string;
  /** Hora del último mensaje, si lo hay. */
  lastAt?: string;
  unreadCount?: number;
  /** Nombre del evento donde conectasteis, si todavía se conoce. */
  eventName?: string;
}

const FALLBACK_PHOTO = '/placeholder.svg';

/** Tiempo restante en formato corto, para el aviso de caducidad. */
// eslint-disable-next-line react-refresh/only-export-components
export const remainingLabel = (expiresAt: string): string | null => {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;

  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)} d`;
  if (hours >= 1) return `${hours} h`;
  return `${Math.max(Math.floor(diff / 60_000), 1)} min`;
};

/** «02:14» hoy, «Ayer» o la fecha corta. */
const cuando = (iso: string, ayer: string): string => {
  const fecha = new Date(iso);
  const hoy = new Date();
  if (fecha.toDateString() === hoy.toDateString()) {
    return fecha.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  const antes = new Date(hoy);
  antes.setDate(hoy.getDate() - 1);
  if (fecha.toDateString() === antes.toDateString()) return ayer;
  return fecha.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/**
 * Una conversación, como las tarjetas blancas de «Conversaciones activas» en
 * Stitch: foto, nombre y edad, la hora, lo último que se dijo y una etiqueta
 * con lo que importa de esa conversación (cuándo caduca, dónde os conocisteis
 * o si ya está leída).
 */
const ConnectionListItem: React.FC<ConnectionListItemProps> = ({
  connection,
  lastMessage,
  lastAt,
  unreadCount = 0,
  eventName,
}) => {
  const { t } = useTranslation();
  const { user } = connection;

  const remaining = connection.expiresAt ? remainingLabel(connection.expiresAt) : null;
  const caducada = Boolean(connection.expiresAt) && !remaining;

  return (
    <Link
      to={`/chat/${user.id}`}
      className={cn(
        'press flex items-center gap-4 rounded-3xl bg-white px-4 py-4 text-ink',
        caducada && 'opacity-70',
      )}
    >
      <img
        src={user.photos[0] || user.avatar || FALLBACK_PHOTO}
        alt=""
        className="h-14 w-14 shrink-0 rounded-full object-cover"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-display text-headline-md font-extrabold">
            {user.name}
            {user.age ? `, ${user.age}` : ''}
          </h3>
          {lastAt && <span className="shrink-0 text-caption text-ink/45">{cuando(lastAt, t('matches.yesterday'))}</span>}
        </div>

        <p className={cn('truncate text-body-md', unreadCount > 0 ? 'font-semibold text-ink' : 'text-ink/60')}>
          {lastMessage || t('matches.noMessages')}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {remaining ? (
            <span className="flex items-center gap-1 rounded-full bg-party-primary px-2.5 py-1 text-caption font-bold text-ink">
              <AlarmClock size={13} />
              {t('matches.expiresIn', { time: remaining })}
            </span>
          ) : caducada ? (
            <span className="rounded-full bg-black/[0.06] px-2.5 py-1 text-caption text-ink/60">
              {t('matches.ended')}
            </span>
          ) : null}
          {eventName && (
            <span className="flex max-w-[10rem] items-center gap-1 truncate rounded-full bg-black/[0.06] px-2.5 py-1 text-caption text-ink/70">
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{eventName}</span>
            </span>
          )}
          {!remaining && !caducada && !eventName && unreadCount === 0 && lastMessage && (
            <span className="rounded-full bg-black/[0.06] px-2.5 py-1 text-caption text-ink/60">
              {t('matches.read')}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-3 self-stretch">
        {unreadCount > 0 ? (
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-party-primary px-2 text-sm font-bold text-ink">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : (
          <span className="h-7" />
        )}
        <ChevronRight size={18} className="text-ink/30" />
      </div>
    </Link>
  );
};

export default ConnectionListItem;
