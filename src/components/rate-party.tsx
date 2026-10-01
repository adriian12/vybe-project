import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Star } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { EventRating, nota, PendingRating, ratingsService } from '@/services/ratings';
import { track } from '@/lib/observability';
import { cn } from '@/lib/utils';

const CLAVE_DESCARTADA = (eventId: string) => `vybe_rating_skip_${eventId}`;

const leer = (clave: string): boolean => {
  try {
    return window.localStorage.getItem(clave) === '1';
  } catch {
    return false;
  }
};

const guardar = (clave: string) => {
  try {
    window.localStorage.setItem(clave, '1');
  } catch {
    // Sin almacenamiento volverá a preguntar; no es grave.
  }
};

/** Cinco estrellas para elegir una nota. */
export const StarsInput = ({
  value,
  onChange,
  size = 30,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  size?: number;
  label: string;
}) => (
  <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        role="radio"
        aria-checked={value === n}
        aria-label={`${n}`}
        onClick={() => onChange(value === n ? 0 : n)}
        className="press p-0.5"
      >
        <Star
          size={size}
          className={cn(n <= value ? 'fill-party-primary text-party-primary' : 'text-party-gray/50')}
        />
      </button>
    ))}
  </div>
);

/**
 * La nota de la fiesta en su ficha. Si la fiesta todavía no tiene tres
 * valoraciones, la del local; si tampoco, nada.
 */
export const EventRatingBadge = ({ eventId }: { eventId: string }) => {
  const { t } = useTranslation();
  const [rating, setRating] = useState<EventRating | null>(null);

  useEffect(() => {
    let vivo = true;
    void ratingsService.getForEvent(eventId).then((r) => {
      if (vivo) setRating(r);
    });
    return () => {
      vivo = false;
    };
  }, [eventId]);

  if (!rating) return null;
  const media = rating.eventAvg ?? rating.venueAvg;
  if (media === null && !rating.myRating) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-sm">
      {media !== null && (
        <span className="flex items-center gap-1 font-bold text-white">
          <Star size={15} className="fill-party-primary text-party-primary" />
          {nota(media)}
          <span className="font-normal text-party-gray">
            {rating.eventAvg !== null
              ? t('rating.eventCount', { count: rating.eventCount })
              : t('rating.venueCount', { count: rating.venueCount })}
          </span>
        </span>
      )}
      {rating.myRating ? (
        <span className="text-party-gray">{t('rating.yours', { stars: rating.myRating })}</span>
      ) : null}
    </p>
  );
};

/** La hoja para valorar una fiesta. */
export const RatePartySheet = ({
  pending,
  open,
  onOpenChange,
  onDone,
}: {
  pending: PendingRating;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [overall, setOverall] = useState(0);
  const [music, setMusic] = useState(0);
  const [atmosphere, setAtmosphere] = useState(0);
  const [price, setPrice] = useState(0);
  const [comment, setComment] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!overall) return;
    setEnviando(true);
    try {
      await ratingsService.rate(pending.eventId, {
        overall,
        music: music || null,
        atmosphere: atmosphere || null,
        price: price || null,
        comment: comment.trim() || null,
      });
      track('event_rated', { overall, withComment: Boolean(comment.trim()) });
      toast({ title: t('rating.thanks'), description: t('rating.thanksBody') });
      onOpenChange(false);
      onDone?.();
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  const fila = (etiqueta: string, valor: number, cambiar: (v: number) => void) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-body-md">{etiqueta}</span>
      <StarsInput value={valor} onChange={cambiar} size={22} label={etiqueta} />
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto pb-safe">
        <SheetHeader className="text-left">
          <SheetTitle>{t('rating.title', { event: pending.eventName })}</SheetTitle>
          <SheetDescription>{t('rating.subtitle', { venue: pending.venueName })}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          <div className="flex flex-col items-center gap-2">
            <StarsInput value={overall} onChange={setOverall} size={38} label={t('rating.overall')} />
            <p className="text-caption text-party-gray">{t(overall ? `rating.levels.${overall}` : 'rating.tapToRate')}</p>
          </div>

          <div className="space-y-3 rounded-xl bg-white/[0.04] p-3">
            {fila(t('rating.music'), music, setMusic)}
            {fila(t('rating.atmosphere'), atmosphere, setAtmosphere)}
            {fila(t('rating.price'), price, setPrice)}
          </div>

          <div className="space-y-1">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t('rating.commentPlaceholder')}
              aria-label={t('rating.commentPlaceholder')}
            />
            <p className="text-caption text-party-gray">{t('rating.anonymous')}</p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="press h-12 flex-1 rounded-xl border border-white/15 font-bold"
            >
              {t('rating.later')}
            </button>
            <button
              type="button"
              disabled={!overall || enviando}
              onClick={() => void enviar()}
              className="press flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-party-primary font-bold text-ink disabled:opacity-40"
            >
              {enviando && <Loader2 size={16} className="animate-spin" />}
              {t('rating.send')}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

/**
 * Pregunta qué tal estuvo la última fiesta: al salir de ella o cuando ha
 * terminado, durante tres días. «Ahora no» no vuelve a preguntar por esa fiesta.
 */
const RatePartyPrompt = () => {
  const [pending, setPending] = useState<PendingRating | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let vivo = true;
    // Un momento después de entrar, para no tapar la pantalla nada más abrirla.
    const espera = setTimeout(() => {
      void ratingsService.getPending().then((p) => {
        if (!vivo || !p || leer(CLAVE_DESCARTADA(p.eventId))) return;
        setPending(p);
        setOpen(true);
      });
    }, 1500);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, []);

  if (!pending) return null;

  return (
    <RatePartySheet
      pending={pending}
      open={open}
      onOpenChange={(abierto) => {
        setOpen(abierto);
        if (!abierto) guardar(CLAVE_DESCARTADA(pending.eventId));
      }}
    />
  );
};

export default RatePartyPrompt;
