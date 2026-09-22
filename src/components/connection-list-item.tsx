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

  // Compacta: con varios matches la lista tiene que caber sin tanto scroll.
  return (
    <Link
      to={`/chat/${user.id}`}
      className={cn(
        'press flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-ink',
        caducada && 'opacity-70',
      )}
    >
      <img
        src={user.photos[0] || user.avatar || FALLBACK_PHOTO}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-display text-title-card font-extrabold">
            {user.name}
            {user.age ? `, ${user.age}` : ''}
          </h3>
          <span className="flex shrink-0 items-center gap-1.5">
            {lastAt && <span className="text-caption text-ink/45">{cuando(lastAt, t('matches.yesterday'))}</span>}
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-party-primary px-1.5 text-[11px] font-bold text-ink">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </span>
        </div>

        <p className={cn('truncate text-body-sm', unreadCount > 0 ? 'font-semibold text-ink' : 'text-ink/60')}>
          {lastMessage || t('matches.noMessages')}
        </p>

        {(remaining || caducada || eventName) && (
          <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
            {remaining ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-party-primary px-2 py-0.5 text-[11px] font-bold text-ink">
                <AlarmClock size={11} />
                {t('matches.expiresIn', { time: remaining })}
              </span>
            ) : caducada ? (
              <span className="shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] text-ink/60">
                {t('matches.ended')}
              </span>
            ) : null}
            {eventName && (
              <span className="flex min-w-0 items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] text-ink/70">
                <MapPin size={11} className="shrink-0" />
                <span className="truncate">{eventName}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <ChevronRight size={17} className="shrink-0 text-ink/30" />
    </Link>
  );
};

export default ConnectionListItem;
