import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock } from 'lucide-react';
import { usePremium } from '@/context/premium-context';
import { premiumNight, Attendee, isPremiumRequired } from '@/services/premium-night';

interface WhoIsGoingProps {
  eventId: string;
  /** Cuánta gente ha dicho que va, que ya se sabe sin ser Premium. */
  going: number;
}

/** Cuántas caras caben en la fila antes del «+N». */
const CARAS = 7;

/**
 * Quién va al evento, antes de ir: la tarjeta blanca «Quién va» del detalle.
 *
 * Es la pregunta de un sábado a las diez: *¿merece la pena arreglarse para ir a
 * este sitio?* Un número no la responde.
 *
 * Se enseña **el nombre y la foto, nada más**. El resto se ve dentro,
 * deslizando: esto sirve para decidir si sales de casa, no para husmear perfiles
 * desde el sofá.
 *
 * Sin Premium las caras salen tapadas con la etiqueta amarilla del candado.
 * Enseñar que hay gente detrás vende mejor que una lista de ventajas, y es
 * honesto: la gente está ahí de verdad.
 */
const WhoIsGoing: React.FC<WhoIsGoingProps> = ({ eventId, going }) => {
  const { t } = useTranslation();
  const { isPremium, setShowPremiumDialog } = usePremium();

  const [gente, setGente] = useState<Attendee[] | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setGente(await premiumNight.attendees(eventId));
    } catch (error) {
      // Que falte Premium no es un fallo: es el estado normal de casi todos.
      if (!isPremiumRequired(error)) console.error('Error loading attendees:', error);
      setGente([]);
    } finally {
      setCargando(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (isPremium) void cargar();
  }, [isPremium, cargar]);

  // Sin nadie apuntado no hay nada que enseñar ni que vender.
  if (going === 0) return null;

  const visibles = isPremium ? (gente ?? []).slice(0, CARAS) : [];
  const huecos = isPremium ? 0 : Math.min(going, CARAS);
  const resto = going - (isPremium ? visibles.length : huecos);

  return (
    <button
      type="button"
      onClick={isPremium ? undefined : () => setShowPremiumDialog(true)}
      className="press flex w-full items-center justify-between gap-3 rounded-xl bg-white p-3 text-left"
    >
      <span className="flex min-w-0 flex-col gap-2">
        <span className="flex items-baseline gap-2">
          <span className="font-display text-title-card text-ink">{t('whoIsGoing.heading')}</span>
          <span className="truncate text-caption font-medium text-ink/60">
            {t('whoIsGoing.confirmed', { count: going })}
          </span>
        </span>

        {cargando ? (
          <Loader2 className="h-5 w-5 animate-spin text-ink/50" />
        ) : isPremium && visibles.length === 0 ? (
          // Hay gente apuntada, pero ninguna encaja con lo que quieres ver.
          <span className="text-caption text-ink/60">{t('whoIsGoing.noneForYou')}</span>
        ) : (
          <span className="flex items-center -space-x-2 py-0.5">
            {visibles.map((persona) => (
              <span
                key={persona.id}
                title={persona.name}
                className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-[10px] font-bold text-white ring-2 ring-white"
              >
                {persona.avatar ? (
                  <img src={persona.avatar} alt={persona.name} className="h-full w-full object-cover" />
                ) : (
                  persona.name.charAt(0).toUpperCase()
                )}
              </span>
            ))}
            {Array.from({ length: huecos }).map((_, i) => (
              // Caras tapadas: se ve que hay gente, no quién.
              <span
                key={i}
                aria-hidden
                className="h-7 w-7 shrink-0 rounded-full bg-surface-highest ring-2 ring-white blur-[1.5px]"
              />
            ))}
            {resto > 0 && (
              <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-surface px-1.5 text-caption font-bold text-white ring-2 ring-white">
                +{resto}
              </span>
            )}
          </span>
        )}
      </span>

      {!isPremium && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-party-primary px-2 py-1 text-label-pill uppercase text-ink shadow-sm">
          <Lock size={13} />
          {t('premium.badge')}
        </span>
      )}
    </button>
  );
};

export default WhoIsGoing;
