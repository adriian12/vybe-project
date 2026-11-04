import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CalendarHeart, ChevronRight, Gift, Heart, MessageCircle, ShieldAlert, Sparkles, Ticket } from 'lucide-react';
import { VybeMark } from '@/components/brand/vybe-logo';
import { cn } from '@/lib/utils';

export interface InAppNoticeData {
  title: string;
  body: string;
  url: string | null;
  tag: string | null;
  /** El logo del negocio, si el aviso es suyo. */
  image: string | null;
}

/** Cuánto se queda en pantalla. Se pausa mientras se toca. */
const DURACION = 5000;

/** El icono y su color según de qué va el aviso (la `tag` del push). */
const tipo = (tag: string | null) => {
  const t = tag ?? '';
  if (t.startsWith('chat-')) return { Icono: MessageCircle, fondo: 'bg-[#3B82F6]', clave: 'message' };
  if (t.startsWith('match-')) return { Icono: Heart, fondo: 'bg-[#FF4D8D]', clave: 'match' };
  if (t.startsWith('supercrush-')) return { Icono: Sparkles, fondo: 'bg-[#A855F7]', clave: 'supercrush' };
  if (t.startsWith('raffle-')) return { Icono: Gift, fondo: 'bg-[#22C55E]', clave: 'raffle' };
  if (t.startsWith('sos-') || t.startsWith('report-') || t.startsWith('expelled-'))
    return { Icono: ShieldAlert, fondo: 'bg-[#EF4444]', clave: 'alert' };
  if (t.startsWith('ticket')) return { Icono: Ticket, fondo: 'bg-party-primary', clave: 'event' };
  if (t.startsWith('event-') || t.startsWith('venue-event')) return { Icono: CalendarHeart, fondo: 'bg-party-primary', clave: 'event' };
  if (t.startsWith('broadcast-')) return { Icono: Bell, fondo: 'bg-party-primary', clave: 'news' };
  return { Icono: Bell, fondo: 'bg-party-primary', clave: 'other' };
};

/**
 * El aviso que sale arriba cuando llega un push con la app abierta (Android e
 * iOS no lo enseñan en ese caso). Antes era el toast genérico de abajo, con el
 * texto y un botón «Abrir» pequeño, y se confundía con los mensajes de la app.
 *
 * Como los del sistema: baja desde arriba, lleva el icono del tipo de aviso (o
 * el logo del negocio que lo manda), se toca entero para abrirlo y se cierra
 * deslizándolo hacia arriba o solo a los cinco segundos. Si llega otro, ocupa
 * su sitio. Va en `z-[1200]`, la capa de los avisos.
 */
const InAppNotice = ({
  notice,
  onOpen,
  onClose,
}: {
  notice: (InAppNoticeData & { id: number }) | null;
  onOpen: (url: string) => void;
  onClose: (id: number | undefined) => void;
}) => {
  const { t } = useTranslation();
  const [saliendo, setSaliendo] = useState(false);
  const [arrastre, setArrastre] = useState(0);
  const [logoRoto, setLogoRoto] = useState(false);
  const inicioY = useRef<number | null>(null);
  const tocando = useRef(false);
  const temporizador = useRef<number>();

  // Cierra éste y no otro: si mientras sale llega uno nuevo, el nuevo se queda.
  const idActual = notice?.id;
  const cerrar = () => {
    setSaliendo(true);
    window.setTimeout(() => onClose(idActual), 200);
  };

  const programar = () => {
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => {
      if (!tocando.current) cerrar();
    }, DURACION);
  };

  useEffect(() => {
    if (!notice) return;
    setSaliendo(false);
    setArrastre(0);
    setLogoRoto(false);
    programar();
    return () => window.clearTimeout(temporizador.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice?.id]);

  if (!notice) return null;

  const { Icono, fondo, clave } = tipo(notice.tag);
  const conLogo = notice.image && !logoRoto;

  const abrir = () => {
    if (notice.url) onOpen(notice.url);
    cerrar();
  };

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[1200] flex justify-center px-3 pt-safe">
      <div
        key={notice.id}
        role="status"
        aria-live="polite"
        className={cn('in-app-notice pointer-events-auto mt-2 w-full max-w-md', saliendo && 'in-app-notice--out')}
        style={arrastre ? { transform: `translateY(${arrastre}px)`, opacity: 1 + arrastre / 120 } : undefined}
        onPointerDown={(e) => {
          inicioY.current = e.clientY;
          tocando.current = true;
        }}
        onPointerMove={(e) => {
          if (inicioY.current === null) return;
          // Sólo hacia arriba, y con resistencia hacia abajo.
          const dy = e.clientY - inicioY.current;
          setArrastre(dy < 0 ? dy : dy / 6);
        }}
        onPointerUp={() => {
          const dy = arrastre;
          inicioY.current = null;
          tocando.current = false;
          if (dy < -40) {
            cerrar();
            return;
          }
          setArrastre(0);
          if (Math.abs(dy) < 6) abrir();
          else programar();
        }}
        onPointerCancel={() => {
          inicioY.current = null;
          tocando.current = false;
          setArrastre(0);
          programar();
        }}
      >
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#1C1C21]/95 p-3 text-left shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl"
          aria-label={notice.url ? `${notice.title}. ${t('common.open')}` : notice.title}
          // El clic lo resuelve `onPointerUp` (para distinguirlo del arrastre);
          // el teclado entra por aquí.
          onClick={(e) => {
            if (e.detail === 0) abrir();
          }}
        >
          <span className="relative shrink-0">
            {conLogo ? (
              <img
                src={notice.image as string}
                alt=""
                className="h-11 w-11 rounded-xl bg-white object-cover"
                onError={() => setLogoRoto(true)}
              />
            ) : (
              <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl text-ink', fondo)}>
                <Icono size={22} strokeWidth={2.4} />
              </span>
            )}
            {/* Quién lo manda: la marca, pequeña, en la esquina. */}
            {conLogo && (
              <span className="absolute -bottom-1 -right-1 rounded-md ring-2 ring-[#1C1C21]">
                <VybeMark size={16} />
              </span>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-body-sm font-bold text-white">{notice.title}</span>
              <span className="ml-auto shrink-0 text-[11px] text-white/45">{t('notice.now')}</span>
            </span>
            {notice.body && (
              <span className="mt-0.5 line-clamp-2 block text-body-sm leading-snug text-white/75">{notice.body}</span>
            )}
            <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-party-primary/90">
              {t(`notice.kind.${clave}`)}
            </span>
          </span>

          {notice.url && <ChevronRight size={18} className="shrink-0 text-white/40" />}
        </button>

        {/* Cuánto le queda: una línea que se vacía. */}
        <span
          key={`barra-${notice.id}`}
          aria-hidden
          className="in-app-notice-bar mx-4 -mt-[3px] block h-[3px] rounded-full bg-party-primary/70"
          style={{ animationDuration: `${DURACION}ms` }}
        />
      </div>
    </div>,
    document.body,
  );
};

export default InAppNotice;
