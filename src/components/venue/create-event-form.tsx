import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Check, ImagePlus, MapPin, X } from 'lucide-react';
import { useAppContext } from '@/context/app-context';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/services/api';
import { venueService } from '@/services/venue-service';
import { getCurrentPosition, GeolocationError } from '@/services/geo';
import { track } from '@/lib/observability';
import { cn } from '@/lib/utils';
import { Event } from '@/types/venue';

/** El mismo límite que el resto de imágenes de la aplicación. */
const MAX_POSTER_BYTES = 10 * 1024 * 1024;

/** Géneros sugeridos. Se puede escribir cualquier otro. */
const GENEROS = ['Techno', 'House', 'Tech House', 'Reggaeton', 'Latin', 'Pop', 'Hip Hop', 'Live', 'Open format'];

interface EventFormData {
  name: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity?: string;
  price?: string;
  minAge?: string;
  theme?: string;
  dressCode?: string;
  bookingUrl?: string;
}

interface CreateEventFormProps {
  /** Se llama al publicar, para cerrar el panel que lo contiene. */
  onCreated?: () => void;
  onClose?: () => void;
}

/** Combina la fecha y la hora del formulario; si el fin es antes que el inicio, es de madrugada. */
const combinar = (date: string, start: string, end: string) => {
  const inicio = new Date(`${date}T${start}`);
  const fin = new Date(`${date}T${end}`);
  if (fin <= inicio) fin.setDate(fin.getDate() + 1);
  return { inicio, fin };
};

/**
 * Crear un evento, según «Nuevo evento» de Stitch: un panel amarillo plano con
 * los campos en blanco sólido y la tinta oscura.
 *
 * Sobre este amarillo nada puede ir en blanco como texto: da 1,4:1. Por eso el
 * botón de publicar es el único elemento invertido (blanco con tinta oscura).
 *
 * La hora de fin se interpreta como del día siguiente cuando es anterior a la
 * de inicio: una fiesta de 23:30 a 06:00 es lo normal, y pedir dos fechas
 * completas hacía que media lista de eventos acabara antes de empezar.
 */
const CreateEventForm: React.FC<CreateEventFormProps> = ({ onCreated, onClose }) => {
  const { t } = useTranslation();
  const { currentVenue, createEvent, refreshEvents } = useAppContext();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [recurrence, setRecurrence] = useState<'none' | 'weekly' | 'biweekly'>('none');

  // El cartel se guarda aparte del formulario: el fichero no viaja por
  // react-hook-form, sólo la vista previa para enseñarlo antes de crear.
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<EventFormData>({ defaultValues: { minAge: '18', startTime: '23:30', endTime: '06:00' } });

  if (!currentVenue) return null;

  const hasLocation = Boolean(currentVenue.location);

  const campo =
    'w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-body-md text-ink shadow-sm ' +
    'placeholder:text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ' +
    'disabled:opacity-50';
  const etiqueta = 'mb-1 block text-caption font-extrabold uppercase tracking-wide text-ink';

  /**
   * Enseña el cartel elegido sin subirlo todavía: subirlo aquí dejaría ficheros
   * huérfanos cada vez que alguien abre el formulario y no llega a crear nada.
   */
  const pickPoster = (file: File) => {
    if (file.size > MAX_POSTER_BYTES) {
      toast({ title: t('auth.errors.fileTooBig'), variant: 'destructive' });
      return;
    }
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
  };

  /**
   * Guarda las coordenadas del local. Sin ellas la geocerca no puede validar
   * nada, así que el evento sería accesible desde cualquier sitio.
   */
  const captureVenueLocation = async () => {
    setIsLocating(true);
    try {
      const coords = await getCurrentPosition();
      const saved = await api.updateVenueLocation(coords.latitude, coords.longitude);
      toast(
        saved
          ? { title: t('venue.events.locationSaved'), description: t('venue.events.locationSavedBody') }
          : { title: t('common.error'), variant: 'destructive' },
      );
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof GeolocationError ? error.message : t('errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setIsLocating(false);
    }
  };

  const onSubmit = async (data: EventFormData) => {
    const { inicio, fin } = combinar(data.date, data.startTime, data.endTime);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      toast({ title: t('venue.events.badDates'), description: t('venue.events.badDatesBody'), variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const minAge = Math.max(Number(data.minAge) || 18, 18);
      const capacity = data.capacity ? Number(data.capacity) : undefined;

      // El cartel se sube ahora, cuando ya se sabe que el evento va a existir.
      // Si falla, el evento se crea igual y el cartel se puede añadir después.
      let posterUrl: string | undefined;
      if (posterFile) {
        try {
          posterUrl = (await api.uploadFile('event-photos', posterFile, posterFile.name)).url;
        } catch (error) {
          console.error('Error uploading poster:', error);
          toast({ title: t('venue.events.posterFailed'), variant: 'destructive' });
        }
      }

      const eventData: Omit<Event, 'id'> = {
        name: data.name.trim(),
        venueId: currentVenue.id,
        startDate: inicio.toISOString(),
        endDate: fin.toISOString(),
        minAge,
        theme: data.theme?.trim() || undefined,
        dressCode: data.dressCode?.trim() || undefined,
        price: data.price ? Number(data.price) : undefined,
        bookingUrl: data.bookingUrl?.trim() || undefined,
        description: data.description?.trim() || undefined,
        maxCapacity: capacity && capacity > 0 ? capacity : undefined,
        recurrence,
        posterUrl,
        location: currentVenue.location,
      };

      const newEvent = await createEvent(eventData);

      if (newEvent) {
        // El aviso de aforo arranca al 90 %, que es el mismo umbral por defecto
        // que usa la pestaña de puerta.
        if (eventData.maxCapacity) {
          await venueService.setCapacity(newEvent.id, eventData.maxCapacity, 0.9).catch(() => undefined);
        }
        track('venue_event_created', { eventId: newEvent.id, recurrence });
        reset();
        setRecurrence('none');
        setPosterFile(null);
        setPosterPreview(null);
        await refreshEvents();
        onCreated?.();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-[20px] bg-party-primary p-5 text-ink">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-headline-lg">{t('venue.events.newEvent')}</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {hasLocation ? (
        <p className="mb-4 flex items-center gap-2 text-caption font-semibold">
          <Check size={14} />
          {t('venue.events.locationOk', { radius: currentVenue.eventRadius })}
        </p>
      ) : (
        <div className="mb-5 rounded-xl bg-ink/10 p-4">
          <p className="mb-3 text-body-sm">{t('venue.events.noLocation')}</p>
          <button
            type="button"
            onClick={() => void captureVenueLocation()}
            disabled={isLocating}
            className="press inline-flex h-9 items-center gap-2 rounded-xl bg-ink px-3 text-sm font-bold text-white disabled:opacity-50"
          >
            <MapPin size={14} />
            {isLocating ? t('venue.events.locating') : t('venue.events.useMyLocation')}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="ev-name" className={etiqueta}>
            {t('venue.events.name')} *
          </label>
          <input
            id="ev-name"
            {...register('name', { required: t('auth.errors.checkForm') })}
            className={campo}
            placeholder={t('venue.events.namePlaceholder')}
            maxLength={80}
          />
          {errors.name && <p className="mt-1 text-caption font-bold text-ink">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="ev-description" className={etiqueta}>
            {t('venue.events.description')}
          </label>
          <textarea
            id="ev-description"
            rows={3}
            {...register('description')}
            className={cn(campo, 'resize-none')}
            placeholder={t('venue.events.descriptionPlaceholder')}
            maxLength={1000}
          />
        </div>

        <div>
          <label htmlFor="ev-date" className={etiqueta}>
            {t('venue.events.date')} *
          </label>
          <input
            id="ev-date"
            type="date"
            {...register('date', { required: t('auth.errors.checkForm') })}
            className={campo}
          />
          {errors.date && <p className="mt-1 text-caption font-bold text-ink">{errors.date.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ev-start" className={etiqueta}>
              {t('venue.events.startTime')}
            </label>
            <input id="ev-start" type="time" {...register('startTime', { required: true })} className={campo} />
          </div>
          <div>
            <label htmlFor="ev-end" className={etiqueta}>
              {t('venue.events.endTime')}
            </label>
            <input id="ev-end" type="time" {...register('endTime', { required: true })} className={campo} />
          </div>
        </div>
        <p className="-mt-2 text-caption text-ink/70">{t('venue.events.overnightHelp')}</p>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="ev-capacity" className={etiqueta}>
              {t('venue.events.capacity')}
            </label>
            <input id="ev-capacity" type="number" min={1} inputMode="numeric" {...register('capacity')} className={campo} />
          </div>
          <div>
            <label htmlFor="ev-price" className={etiqueta}>
              {t('venue.events.price')}
            </label>
            <input
              id="ev-price"
              type="number"
              min={0}
              step="0.5"
              inputMode="decimal"
              {...register('price')}
              className={campo}
              placeholder="0"
            />
          </div>
          <div>
            <label htmlFor="ev-age" className={etiqueta}>
              {t('venue.events.minAgeShort')}
            </label>
            <input id="ev-age" type="number" min={18} max={100} {...register('minAge')} className={campo} />
          </div>
        </div>

        <div>
          <label htmlFor="ev-theme" className={etiqueta}>
            {t('venue.events.genre')}
          </label>
          <input
            id="ev-theme"
            list="ev-genres"
            {...register('theme')}
            className={campo}
            placeholder={t('venue.events.themePlaceholder')}
          />
          <datalist id="ev-genres">
            {GENEROS.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="ev-dress" className={etiqueta}>
            {t('venue.events.dressCode')}
          </label>
          <input
            id="ev-dress"
            {...register('dressCode')}
            className={campo}
            placeholder={t('venue.events.dressCodePlaceholder')}
          />
        </div>

        {/* El cartel. La columna `poster_url` existía desde el principio y no
            había forma de rellenarla. */}
        <div>
          <span className={etiqueta}>{t('venue.events.poster')}</span>
          <input
            id="event-poster"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) pickPoster(file);
            }}
          />

          {posterPreview ? (
            <div className="relative overflow-hidden rounded-xl">
              <img src={posterPreview} alt="" className="aspect-[16/10] w-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setPosterPreview(null);
                  setPosterFile(null);
                }}
                aria-label={t('common.delete')}
                className="press absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink/80 text-white"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink/30 bg-white px-4 py-5 text-center">
              <ImagePlus size={24} />
              <p className="text-body-sm">{t('venue.events.posterDrop')}</p>
              {/* El disparador es un `label`: dentro de un formulario un botón
                  lo enviaría. Tiene forma de botón de verdad a propósito. */}
              <label
                htmlFor="event-poster"
                className="press inline-flex h-9 cursor-pointer items-center rounded-xl bg-ink px-4 text-sm font-bold text-white"
              >
                {t('venue.events.selectFile')}
              </label>
              <p className="text-caption text-ink/60">{t('venue.events.posterHelp')}</p>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl bg-white p-3.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="ev-recurrent" className="font-display text-title-card">
              {t('venue.events.recurrent')}
            </label>
            {/* Interruptor propio: el de la aplicación es amarillo encendido y
                sobre este panel desaparecería. */}
            <button
              id="ev-recurrent"
              type="button"
              role="switch"
              aria-checked={recurrence !== 'none'}
              onClick={() => setRecurrence((r) => (r === 'none' ? 'weekly' : 'none'))}
              className={cn(
                'press relative h-6 w-11 shrink-0 rounded-full transition-colors',
                recurrence !== 'none' ? 'bg-ink' : 'bg-ink/20',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full transition-transform duration-200 [transition-timing-function:var(--ease-out)]',
                  recurrence !== 'none' ? 'translate-x-[22px] bg-party-primary' : 'translate-x-0.5 bg-white',
                )}
              />
            </button>
          </div>
          {recurrence !== 'none' && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink/5 p-1">
              {(['weekly', 'biweekly'] as const).map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  onClick={() => setRecurrence(opcion)}
                  aria-pressed={recurrence === opcion}
                  className={cn(
                    'press h-9 rounded-md text-caption font-bold',
                    recurrence === opcion ? 'bg-ink text-party-primary' : 'text-ink/60',
                  )}
                >
                  {t(`venue.events.recurrence.${opcion}`)}
                </button>
              ))}
            </div>
          )}
          <p className="text-caption text-ink/60">{t('venue.events.recurrentHelp')}</p>
        </div>

        <div>
          <label htmlFor="ev-booking" className={etiqueta}>
            {t('venue.events.bookingUrl')}
          </label>
          <input id="ev-booking" type="url" {...register('bookingUrl')} className={campo} placeholder="https://…" />
        </div>

        {/* Invertido: sobre el amarillo, un botón amarillo no se vería. */}
        <button
          type="submit"
          disabled={isLoading}
          className="press flex h-12 w-full items-center justify-center rounded-xl bg-white font-display text-title-card font-extrabold text-ink shadow-md disabled:opacity-60"
        >
          {isLoading ? t('venue.events.creating') : t('venue.events.publish')}
        </button>
      </form>
    </div>
  );
};

export default CreateEventForm;
