import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CalendarClock, ChevronRight, MessageCircle, Radio, Trash2, Zap } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAppContext } from '@/context/app-context';
import { isEventTonight } from '@/hooks/use-events-feed';
import { formatHour } from '@/components/event-bits';
import { avisosOcultos, ocultarAviso, suscribirOcultos } from '@/lib/activity-dismissed';

interface ActivitySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Eventos a los que has dicho que vas. */
  intents: string[];
}

interface Aviso {
  id: string;
  icon: typeof Bell;
  title: string;
  body: string;
  to: string;
  urgent?: boolean;
}

/** Una conexión es «nueva» durante las primeras doce horas. */
const NUEVA_MS = 12 * 3_600_000;

/**
 * Lo que ha pasado desde la última vez: la campana de la pantalla de inicio.
 *
 * No hay una tabla de avisos detrás. La que existía (`notifications`) no la
 * escribía nadie, así que la campana habría estado siempre vacía. Todo lo que
 * sale aquí se calcula con datos que la aplicación ya tiene cargados: el
 * evento en el que estás, mensajes sin leer, conexiones recientes y las fiestas
 * de esta noche a las que dijiste que ibas.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useActivity =(intents: string[]): Aviso[] => {
  const { t } = useTranslation();
  const { activeEvent, messages, connections, currentUser, events } = useAppContext();

  const todos = useMemo(() => {
    const avisos: Aviso[] = [];
    const ahora = Date.now();

    if (activeEvent) {
      avisos.push({
        id: `active-${activeEvent.eventId}`,
        icon: Radio,
        title: t('activity.inside', { name: activeEvent.eventName }),
        body: t('activity.insideBody'),
        to: `/event/${activeEvent.eventId}/live`,
        urgent: true,
      });
    }

    const sinLeer = currentUser
      ? Object.entries(messages).filter(([, lista]) =>
          lista.some((m) => m.receiverId === currentUser.id && !m.read),
        )
      : [];

    for (const [profileId, lista] of sinLeer) {
      const persona = connections.find((c) => c.user.id === profileId)?.user;
      const cuantos = lista.filter((m) => m.receiverId === currentUser?.id && !m.read).length;
      const ultimo = lista[lista.length - 1]?.id ?? '';
      avisos.push({
        id: `msg-${profileId}-${ultimo}`,
        icon: MessageCircle,
        title: t('activity.messages', { count: cuantos, name: persona?.name ?? '' }),
        body: lista[lista.length - 1]?.content ?? '',
        to: `/chat/${profileId}`,
      });
    }

    for (const conexion of connections) {
      if (ahora - new Date(conexion.createdAt).getTime() > NUEVA_MS) continue;
      if (sinLeer.some(([id]) => id === conexion.user.id)) continue;
      avisos.push({
        id: `match-${conexion.connectionId}`,
        icon: Zap,
        title: t('activity.newVybe', { name: conexion.user.name }),
        body: t('activity.newVybeBody'),
        to: `/chat/${conexion.user.id}`,
      });
    }

    for (const evento of events) {
      if (!intents.includes(evento.id) || !isEventTonight(evento, ahora)) continue;
      if (activeEvent?.eventId === evento.id) continue;
      avisos.push({
        id: `tonight-${evento.id}`,
        icon: CalendarClock,
        title: t('activity.tonight', { name: evento.name }),
        body: t('activity.tonightBody', { time: formatHour(evento.startDate), venue: evento.venueName ?? '' }),
        to: `/event/${evento.id}`,
      });
    }

    return avisos;
  }, [activeEvent, messages, connections, currentUser, events, intents, t]);

  const ocultos = useSyncExternalStore(suscribirOcultos, avisosOcultos, avisosOcultos);

  return useMemo(() => todos.filter((aviso) => !(aviso.id in ocultos)), [todos, ocultos]);
};

/** Cuánto hay que arrastrar para que el aviso se descarte. */
const UMBRAL = 96;

/** Un aviso: se toca para ir, o se desliza a la izquierda para quitarlo. */
const AvisoFila = ({
  aviso,
  onOpen,
  onDismiss,
  dismissLabel,
}: {
  aviso: Aviso;
  onOpen: () => void;
  onDismiss: () => void;
  dismissLabel: string;
}) => {
  const [desplazado, setDesplazado] = useState(0);
  const [saliendo, setSaliendo] = useState(false);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const arrastrado = useRef(false);
  const Icon = aviso.icon;

  const alPulsar = (e: React.PointerEvent) => {
    inicio.current = { x: e.clientX, y: e.clientY };
    arrastrado.current = false;
  };
  const alMover = (e: React.PointerEvent) => {
    if (!inicio.current) return;
    const dx = e.clientX - inicio.current.x;
    const dy = e.clientY - inicio.current.y;
    if (!arrastrado.current && Math.abs(dx) < 8) return;
    // Si el gesto va más en vertical, es desplazamiento de la lista.
    if (!arrastrado.current && Math.abs(dy) > Math.abs(dx)) {
      inicio.current = null;
      return;
    }
    arrastrado.current = true;
    setDesplazado(Math.min(0, dx));
  };
  const alSoltar = () => {
    if (!inicio.current) return;
    inicio.current = null;
    if (desplazado <= -UMBRAL) {
      setSaliendo(true);
      setDesplazado(-window.innerWidth);
      window.setTimeout(onDismiss, 180);
      return;
    }
    setDesplazado(0);
  };

  return (
    <li className={`relative overflow-hidden rounded-2xl transition-[max-height,opacity] ${saliendo ? 'max-h-0 opacity-0' : 'max-h-40'}`}>
      <button
        type="button"
        onPointerDown={alPulsar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onClick={() => {
          if (arrastrado.current || desplazado !== 0) {
            arrastrado.current = false;
            setDesplazado(0);
            return;
          }
          onOpen();
        }}
        style={{
          transform: `translateX(${desplazado}px)`,
          // Se desvanece según se arrastra: al soltarlo pasado el umbral, se va.
          opacity: Math.max(0, 1 - Math.abs(desplazado) / (UMBRAL * 2)),
          touchAction: 'pan-y',
        }}
        className="press relative flex w-full items-center gap-3 rounded-2xl bg-surface-high p-3 text-left transition-[transform,opacity] duration-200 [transition-timing-function:var(--ease-out)] hover:bg-surface-high"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            aviso.urgent ? 'bg-party-primary text-ink' : 'bg-surface text-party-primary'
          }`}
        >
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-title-card">{aviso.title}</span>
          <span className="block truncate text-body-sm text-party-gray">{aviso.body}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-party-gray" />
      </button>
      {/* Quitarlo sin deslizar, para quien use teclado o lector de pantalla. */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-2 focus:z-10 focus:rounded-full focus:bg-destructive focus:p-2 focus:text-white"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
};

const ActivitySheet: React.FC<ActivitySheetProps> = ({ open, onOpenChange, intents }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const avisos = useActivity(intents);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-surface-highest" aria-hidden />
        <SheetHeader className="text-left">
          <SheetTitle>{t('activity.title')}</SheetTitle>
          <SheetDescription>{t('activity.subtitle')}</SheetDescription>
        </SheetHeader>

        {avisos.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-high text-party-gray">
              <Bell size={24} />
            </span>
            <p className="font-display text-title-card">{t('activity.empty')}</p>
            <p className="mt-1 max-w-xs text-body-sm text-party-gray">{t('activity.emptyBody')}</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {avisos.map((aviso) => (
              <AvisoFila
                key={aviso.id}
                aviso={aviso}
                onOpen={() => {
                  onOpenChange(false);
                  navigate(aviso.to);
                }}
                onDismiss={() => ocultarAviso(aviso.id)}
                dismissLabel={t('activity.dismiss')}
              />
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ActivitySheet;
