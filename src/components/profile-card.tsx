import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag, Sparkles } from 'lucide-react';
import { User } from '@/types/user';
import ReportUserDialog from './report-user-dialog';
import { useInterestLabel } from './interest-picker';
import { formatDistance } from '@/services/geo';

export type SwipeDirection = 'left' | 'right' | 'super';

export interface ProfileCardHandle {
  /** Lanza la tarjeta en esa dirección y avisa cuando ha salido. */
  swipe: (direction: SwipeDirection) => void;
}

interface ProfileCardProps {
  user: User;
  onSwipe: (direction: SwipeDirection, userId: string) => void;
  /**
   * Se pregunta antes de que la tarjeta salga; si devuelve `false` vuelve al
   * centro (sin me gusta disponibles, por ejemplo).
   */
  canSwipe?: (direction: SwipeDirection) => boolean;
}

const FALLBACK_PHOTO = '/placeholder.svg';

/**
 * Umbral para dar por hecha la decisión. Un cuarto del ancho de la tarjeta es
 * suficiente para que el gesto sea intencionado y no un roce al desplazarse.
 */
const DECISION_THRESHOLD = 90;

/**
 * Un golpe rápido también decide aunque no llegue al umbral: quien desliza con
 * prisa lanza la tarjeta 40-60 px y la soltaba esperando que saliera, pero
 * volvía al centro. Velocidad en px/ms medida en los últimos 100 ms del gesto,
 * y un recorrido mínimo para no tomar por decisión un roce.
 */
const FLICK_VELOCITY = 0.5;
const FLICK_MIN_DISTANCE = 30;
const FLICK_WINDOW_MS = 100;

/** Lo que dura la salida de la tarjeta; por debajo del tope de 300 ms. */
const EXIT_MS = 260;

/**
 * La tarjeta del «Flechazo», según «Swipe Deck» de Stitch: la foto a sangre
 * con 20 px de radio y, sobre el tercio de abajo, el nombre, a qué distancia
 * está y un par de intereses.
 *
 * Los botones de decidir ya no van dentro de la tarjeta: en el diseño están
 * debajo, fuera de la foto, y la pantalla los pulsa a través de `swipe()`. Así
 * el gesto y el botón hacen la misma animación.
 */
const ProfileCard = forwardRef<ProfileCardHandle, ProfileCardProps>(({ user, onSwipe, canSwipe }, ref) => {
  const { t } = useTranslation();
  const interestLabel = useInterestLabel();

  const [salida, setSalida] = useState<SwipeDirection | null>(null);
  const [showReport, setShowReport] = useState(false);

  // Arrastre con el dedo: la tarjeta sigue la mano y se decide al soltar. El
  // movimiento no pasa por el estado de React: con un render por cada evento
  // del dedo (foto incluida) el WebView de Android iba a tirones. Se escribe
  // el `transform` directamente, una vez por fotograma.
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  /** Últimas posiciones del dedo, para medir la velocidad al soltar. */
  const muestras = useRef<Array<{ x: number; t: number }>>([]);
  const drag = useRef(0);
  const frame = useRef<number | null>(null);
  const cardEl = useRef<HTMLDivElement | null>(null);
  const likeEl = useRef<HTMLDivElement | null>(null);
  const nopeEl = useRef<HTMLDivElement | null>(null);

  const pintar = useCallback(() => {
    frame.current = null;
    const x = drag.current;
    if (cardEl.current) cardEl.current.style.transform = x !== 0 ? `translate3d(${x}px,0,0) rotate(${x / 25}deg)` : '';
    const opacidad = Math.min(Math.abs(x) / DECISION_THRESHOLD, 1);
    if (likeEl.current) likeEl.current.style.opacity = x > 0 ? String(opacidad) : '0';
    if (nopeEl.current) nopeEl.current.style.opacity = x < 0 ? String(opacidad) : '0';
  }, []);

  const moverA = useCallback(
    (x: number) => {
      drag.current = x;
      if (frame.current === null) frame.current = requestAnimationFrame(pintar);
    },
    [pintar],
  );

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const lanzar = useCallback(
    (direction: SwipeDirection) => {
      if (salida) return;
      if (canSwipe && !canSwipe(direction)) {
        moverA(0);
        return;
      }
      setSalida(direction);
      setTimeout(() => {
        onSwipe(direction, user.id);
        // Si la decisión falla y el perfil sigue siendo el mismo, la tarjeta
        // vuelve en vez de quedarse invisible.
        setTimeout(() => {
          setSalida(null);
          moverA(0);
        }, 600);
      }, EXIT_MS);
    },
    [onSwipe, canSwipe, salida, user.id, moverA],
  );

  useImperativeHandle(ref, () => ({ swipe: lanzar }), [lanzar]);

  // Cada perfil entra centrado, aunque el anterior saliera arrastrado.
  useEffect(() => {
    moverA(0);
    setDragging(false);
    setSalida(null);
    startX.current = null;
  }, [user.id, moverA]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button') || salida) return;
    startX.current = event.clientX;
    muestras.current = [{ x: event.clientX, t: event.timeStamp }];
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    const ahora = event.timeStamp;
    muestras.current.push({ x: event.clientX, t: ahora });
    while (muestras.current.length > 2 && ahora - muestras.current[0].t > FLICK_WINDOW_MS) muestras.current.shift();
    moverA(event.clientX - startX.current);
  };

  const onPointerUp = () => {
    if (startX.current === null) return;

    const distance = drag.current;
    startX.current = null;
    setDragging(false);

    const primera = muestras.current[0];
    const ultima = muestras.current[muestras.current.length - 1];
    const dt = primera && ultima ? ultima.t - primera.t : 0;
    const velocidad = dt > 0 ? (ultima.x - primera.x) / dt : 0;
    muestras.current = [];

    // Golpe rápido: cuenta si va en el mismo sentido que el recorrido.
    const golpe =
      Math.abs(velocidad) > FLICK_VELOCITY && Math.abs(distance) > FLICK_MIN_DISTANCE && Math.sign(velocidad) === Math.sign(distance);

    if (distance > DECISION_THRESHOLD || (golpe && distance > 0)) lanzar('right');
    else if (distance < -DECISION_THRESHOLD || (golpe && distance < 0)) lanzar('left');
    else moverA(0);
  };

  // La salida sí va por React (un solo cambio); el arrastre lo pinta `pintar`.
  const salidaTransform = salida
    ? salida === 'left'
      ? 'translate3d(-130%,0,0) rotate(-14deg)'
      : salida === 'right'
        ? 'translate3d(130%,0,0) rotate(14deg)'
        : 'translate3d(0,-120%,0) scale(0.96)'
    : undefined;

  const foto = user.photos[0] ?? user.avatar ?? FALLBACK_PHOTO;

  return (
    <div
      ref={cardEl}
      className="absolute inset-0 touch-pan-y select-none will-change-transform"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        ...(salidaTransform ? { transform: salidaTransform } : {}),
        opacity: salida ? 0 : 1,
        transition: dragging
          ? 'none'
          : `transform ${salida ? EXIT_MS : 220}ms var(--ease-out), opacity ${EXIT_MS}ms var(--ease-out)`,
      }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[20px] bg-surface-high shadow-2xl">
        <img src={foto} alt="" draggable={false} className="h-full w-full object-cover" />

        {/* Sellos de decisión: dicen qué va a pasar antes de soltar. */}
        <div
          ref={likeEl}
          className="pointer-events-none absolute left-6 top-6 z-20 rotate-[-18deg] rounded-xl border-4 border-party-primary px-3 py-1 font-display text-2xl font-black uppercase text-party-primary"
          style={{ opacity: 0 }}
        >
          {t('swiping.stampLike')}
        </div>
        <div
          ref={nopeEl}
          className="pointer-events-none absolute right-6 top-6 z-20 rotate-[18deg] rounded-xl border-4 border-white px-3 py-1 font-display text-2xl font-black uppercase text-white"
          style={{ opacity: 0 }}
        >
          {t('swiping.stampNope')}
        </div>

        <button
          type="button"
          onClick={() => setShowReport(true)}
          className="press absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[#0E0E11]/60 text-white/90 backdrop-blur-sm"
          aria-label={t('report.title', { name: user.name })}
        >
          <Flag size={15} />
        </button>

        <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent p-5 pt-24">
          <h3 className="font-display text-[26px] font-extrabold leading-tight text-white">
            {user.name}, {user.age}
          </h3>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-body-md text-white/80">
            <span className="h-2 w-2 rounded-full bg-party-primary" />
            {user.distance !== undefined
              ? t('swiping.distanceFromYou', { distance: formatDistance(user.distance) })
              : t('swiping.insideNow')}
            {(user.sharedInterests ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-party-primary">
                · <Sparkles size={13} />
                {t('swiping.sharedInterests', { count: user.sharedInterests })}
              </span>
            )}
          </p>

          {user.bio && <p className="mt-2 line-clamp-2 text-body-sm text-white/85">{user.bio}</p>}

          {user.interests && user.interests.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {user.interests.slice(0, 3).map((slug) => (
                <span
                  key={slug}
                  className="rounded-full bg-[#2A2A2D]/85 px-3 py-1 text-label-pill text-white backdrop-blur-sm"
                >
                  {interestLabel(slug)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <ReportUserDialog
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        userId={user.id}
        userName={user.name}
      />
    </div>
  );
});

ProfileCard.displayName = 'ProfileCard';

export default ProfileCard;
