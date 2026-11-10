import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { SUPPORTED_LANGUAGES, changeLanguage } from '@/i18n';
import { api } from '@/services/api';
import { cn } from '@/lib/utils';
import { DiscoverArt, EnterArt, GoHomeArt, IntroArt, SafetyArt, SwipeArt, TicketsArt, VenueArt } from './tour-art';

/** Un paso: su clave de textos (`<textos>.steps.<id>`) y su dibujo. */
export interface TourStep {
  id: string;
  Art: React.FC;
}

/** Los pasos del tutorial de bienvenida, en orden. Los textos están en `tour.steps.<id>`. */
const PASOS: readonly TourStep[] = [
  { id: 'intro', Art: IntroArt },
  { id: 'discover', Art: DiscoverArt },
  { id: 'tickets', Art: TicketsArt },
  { id: 'enter', Art: EnterArt },
  { id: 'swipe', Art: SwipeArt },
  { id: 'venue', Art: VenueArt },
  { id: 'goHome', Art: GoHomeArt },
  { id: 'safety', Art: SafetyArt },
];

/** El orden de la referencia: primero las lenguas de aquí. */
const IDIOMAS = ['es', 'ca', 'en', 'de'] as const;

interface WelcomeTourProps {
  /** Se llama al terminar o al saltarlo; quien lo abre decide si lo recuerda. */
  onClose: () => void;
  /** Con sesión, el idioma elegido se guarda también en el perfil. */
  loggedIn?: boolean;
  /**
   * Otro tutorial con el mismo formato (el del panel de negocio): sus pasos y
   * el prefijo de sus textos (`<textos>.start`, `<textos>.steps.<id>.title`…).
   */
  steps?: readonly TourStep[];
  textos?: string;
}

/**
 * El tutorial de bienvenida: ocho pantallas a página completa con barra de
 * progreso, «Atrás», idioma, un dibujo, la etiqueta, el titular y el texto.
 * Se pasa con el botón, deslizando de lado o con las flechas del teclado.
 */
const WelcomeTour: React.FC<WelcomeTourProps> = ({ onClose, loggedIn = false, steps = PASOS, textos = 'tour' }) => {
  const { t, i18n } = useTranslation();
  const [paso, setPaso] = useState(0);
  const toque = useRef<{ x: number; y: number } | null>(null);

  const ultimo = paso === steps.length - 1;
  const { id, Art } = steps[paso];

  const siguiente = useCallback(() => {
    if (ultimo) onClose();
    else setPaso((p) => p + 1);
  }, [ultimo, onClose]);

  const atras = useCallback(() => setPaso((p) => Math.max(0, p - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') siguiente();
      else if (e.key === 'ArrowLeft') atras();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [siguiente, atras, onClose]);

  // Que no se desplace lo de debajo mientras está abierto.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  const cambiarIdioma = async (code: string) => {
    await changeLanguage(code);
    if (!loggedIn) return;
    try {
      await api.updateProfile({ locale: code });
    } catch {
      // Se queda en este móvil; no hace falta avisar.
    }
  };

  const activo = IDIOMAS.find((c) => i18n.resolvedLanguage === c) ?? 'es';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      // En escritorio, una ventana centrada sobre lo que haya debajo (el panel
      // de negocio) en vez de la columna estrecha del móvil en una pantalla negra.
      className="pt-safe pb-safe fixed inset-0 z-[1000] flex flex-col bg-background lg:items-center lg:justify-center lg:bg-black/75 lg:backdrop-blur-sm"
      onTouchStart={(e) => {
        const p = e.touches[0];
        toque.current = { x: p.clientX, y: p.clientY };
      }}
      onTouchEnd={(e) => {
        const inicio = toque.current;
        toque.current = null;
        if (!inicio) return;
        const p = e.changedTouches[0];
        const dx = p.clientX - inicio.x;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(p.clientY - inicio.y) * 1.5) {
          if (dx < 0) siguiente();
          else atras();
        }
      }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden px-margin lg:max-h-[min(640px,92vh)] lg:max-w-4xl lg:flex-none lg:rounded-[32px] lg:border lg:border-white/10 lg:bg-background lg:px-10 lg:pb-4 lg:shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        {/* Progreso: un tramo por paso, encendidos hasta el actual. */}
        <div
          className="flex gap-1.5 pt-4"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={paso + 1}
          aria-label={t(`${textos}.progress`, { current: paso + 1, total: steps.length })}
        >
          {steps.map((p, i) => (
            <span
              key={p.id}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-300',
                i <= paso ? 'bg-party-primary' : 'bg-white/15',
              )}
            />
          ))}
        </div>

        <div className="flex h-14 items-center justify-between">
          {paso > 0 ? (
            <button
              type="button"
              onClick={atras}
              className="press -ml-1 flex items-center gap-0.5 rounded-lg py-2 pr-2 font-display text-title-card text-party-gray hover:text-foreground"
            >
              <ChevronLeft size={20} />
              {t(`${textos}.back`)}
            </button>
          ) : (
            <span />
          )}

          <div className="flex rounded-full border border-white/10 bg-card p-0.5" role="group" aria-label={t('common.language')}>
            {IDIOMAS.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => void cambiarIdioma(code)}
                aria-pressed={activo === code}
                aria-label={SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label}
                className={cn(
                  'press h-8 min-w-[42px] rounded-full px-2 text-caption font-bold uppercase',
                  activo === code ? 'bg-party-primary text-ink' : 'text-party-gray hover:text-foreground',
                )}
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        {/* El contenido cambia de clave en cada paso para repetir la entrada. */}
        {/* En escritorio, el dibujo a la izquierda y el texto a la derecha. */}
        <div key={id} className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2 pt-2 lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:py-6">
          <div className="enter">
            <Art />
          </div>
          <div className="stagger mt-7 lg:mt-0">
            <p style={{ '--i': 1 } as React.CSSProperties} className="text-label-pill font-extrabold uppercase tracking-[0.16em] text-party-primary">
              {t(`${textos}.steps.${id}.label`)}
            </p>
            <h1
              id="tour-title"
              style={{ '--i': 2 } as React.CSSProperties}
              className="mt-2 font-display text-[32px] font-extrabold leading-[1.05] tracking-tight"
            >
              {t(`${textos}.steps.${id}.title`)}
            </h1>
            <p style={{ '--i': 3 } as React.CSSProperties} className="mt-3 text-body-md text-party-gray">
              {t(`${textos}.steps.${id}.body`)}
            </p>
          </div>
        </div>

        <div className="space-y-1 pb-4 pt-3 lg:flex lg:items-center lg:justify-between lg:gap-4 lg:space-y-0 lg:pb-2">
          <button
            type="button"
            onClick={siguiente}
            className="press flex h-14 w-full items-center justify-center rounded-2xl bg-party-primary font-display text-title-card text-ink shadow-[0_10px_30px_rgba(248,208,0,0.18)] hover:bg-[#E0BC00] lg:order-last lg:w-72"
          >
            {paso === 0 ? t(`${textos}.start`) : ultimo ? t(`${textos}.finish`) : t(`${textos}.next`)}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'press h-11 w-full rounded-xl text-body-sm font-semibold text-party-gray hover:text-foreground lg:w-auto lg:px-2',
              ultimo && 'invisible',
            )}
          >
            {t(`${textos}.skip`)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeTour;
