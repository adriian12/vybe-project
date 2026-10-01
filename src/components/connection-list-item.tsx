import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlarmClock, ChevronRight, MapPin, Trash2 } from "lucide-react";
import { MatchConnection } from "@/types/user";
import { cn } from "@/lib/utils";

interface ConnectionListItemProps {
  connection: MatchConnection;
  lastMessage?: string;
  /** Hora del último mensaje, si lo hay. */
  lastAt?: string;
  unreadCount?: number;
  /** Nombre del evento donde conectasteis, si todavía se conoce. */
  eventName?: string;
  /** Deslizar a la izquierda enseña la papelera: borra conversación y match. */
  onDelete?: () => void;
}

/** Cuánto se abre la tarjeta al deslizar: el ancho del botón de la papelera. */
const ABIERTA = 84;

const FALLBACK_PHOTO = "/placeholder.svg";

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
    return fecha.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const antes = new Date(hoy);
  antes.setDate(hoy.getDate() - 1);
  if (fecha.toDateString() === antes.toDateString()) return ayer;
  return fecha.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
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
  onDelete,
}) => {
  const [desplazado, setDesplazado] = useState(0);
  const inicio = useRef<{ x: number; y: number; base: number } | null>(null);
  const arrastrado = useRef(false);

  // Deslizar sólo en horizontal: si el gesto va más en vertical, es scroll.
  const alPulsar = (e: React.PointerEvent) => {
    if (!onDelete) return;
    inicio.current = { x: e.clientX, y: e.clientY, base: desplazado };
    arrastrado.current = false;
  };
  const alMover = (e: React.PointerEvent) => {
    if (!inicio.current) return;
    const dx = e.clientX - inicio.current.x;
    const dy = e.clientY - inicio.current.y;
    if (!arrastrado.current && Math.abs(dx) < 8) return;
    if (!arrastrado.current && Math.abs(dy) > Math.abs(dx)) {
      inicio.current = null;
      return;
    }
    arrastrado.current = true;
    setDesplazado(Math.max(-ABIERTA, Math.min(0, inicio.current.base + dx)));
  };
  const alSoltar = () => {
    if (!inicio.current) return;
    inicio.current = null;
    setDesplazado((d) => (d < -ABIERTA / 2 ? -ABIERTA : 0));
  };

  const { t } = useTranslation();
  const { user } = connection;

  const remaining = connection.expiresAt
    ? remainingLabel(connection.expiresAt)
    : null;
  const caducada = Boolean(connection.expiresAt) && !remaining;

  // Compacta: con varios matches la lista tiene que caber sin tanto scroll.
  return (
    <div className="relative overflow-hidden rounded-2xl">
      {onDelete && (
        <button
          type="button"
          onClick={() => {
            setDesplazado(0);
            onDelete();
          }}
          aria-label={t("chat.unmatch")}
          tabIndex={desplazado === 0 ? -1 : 0}
          className="absolute inset-y-0 right-0 flex w-[84px] items-center justify-center bg-destructive text-white"
        >
          <Trash2 size={22} />
        </button>
      )}
      <Link
        to={`/chat/${user.id}`}
        onPointerDown={alPulsar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onClick={(e) => {
          // Un deslizamiento no abre la conversación; con la papelera a la
          // vista, tocar la tarjeta la cierra.
          if (arrastrado.current || desplazado !== 0) {
            e.preventDefault();
            if (!arrastrado.current) setDesplazado(0);
          }
          arrastrado.current = false;
        }}
        style={{
          transform: `translateX(${desplazado}px)`,
          touchAction: "pan-y",
        }}
        className={cn(
          "relative flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-ink transition-transform duration-200 [transition-timing-function:var(--ease-out)]",
          caducada && "opacity-70",
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
              {user.age ? `, ${user.age}` : ""}
            </h3>
            <span className="flex shrink-0 items-center gap-1.5">
              {lastAt && (
                <span className="text-caption text-ink/45">
                  {cuando(lastAt, t("matches.yesterday"))}
                </span>
              )}
              {unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-party-primary px-1.5 text-[11px] font-bold text-ink">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </span>
          </div>

          <p
            className={cn(
              "truncate text-body-sm",
              unreadCount > 0 ? "font-semibold text-ink" : "text-ink/60",
            )}
          >
            {lastMessage || t("matches.noMessages")}
          </p>

          {(remaining || caducada || eventName) && (
            <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
              {remaining ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-party-primary px-2 py-0.5 text-[11px] font-bold text-ink">
                  <AlarmClock size={11} />
                  {t("matches.expiresIn", { time: remaining })}
                </span>
              ) : caducada ? (
                <span className="shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] text-ink/60">
                  {t("matches.ended")}
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
    </div>
  );
};

export default ConnectionListItem;
