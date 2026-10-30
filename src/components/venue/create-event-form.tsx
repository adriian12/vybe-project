import { useState } from 'react';
import LineupEditor from '@/components/lineup-editor';
import { LineupArtist } from '@/lib/lineup';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { CopyPlus, X } from 'lucide-react';
import { useAppContext } from '@/context/app-context';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/services/api';
import { venueService } from '@/services/venue-service';
import {
  DEFAULT_LIVE_SETTINGS,
  differsFromDefault,
  EventLiveSettings as Ajustes,
  eventSettingsService,
} from '@/services/event-settings';
import EventLiveSettings from '@/components/venue/event-live-settings';
import { ticketsService } from '@/services/tickets';
import LocationPicker, { PickedLocation } from '@/components/venue/location-picker';
import { track } from '@/lib/observability';
import { cn } from '@/lib/utils';
import { Event } from '@/types/venue';
import MusicSelect from '@/components/music-select';
import PosterPicker from '@/components/poster-picker';

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
  /** Con un evento, el formulario lo edita en vez de crear uno nuevo. */
  event?: Event;
  /**
   * Repetir una fiesta: copia la configuración de esta y crea otra. La fecha
   * salta a la semana siguiente, que es lo que hace un local con su sesión de
   * todos los sábados.
   */
  template?: Event;
  /**
   * Al crear, los ajustes de la fiesta (entrar al evento, swipe, recuento…).
   * Sólo el propietario: la base de datos rechaza a los demás.
   */
  withSettings?: boolean;
}

/** La misma fecha de la semana que viene, en formato de campo. */
/**
 * Al repetir: el mismo día de la semana, la próxima vez que llegue. Sumar una
 * semana a la original no basta: si fue hace un mes, seguiría en el pasado.
 */
const proximaFecha = (iso: string): string => {
  const d = new Date(iso);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  do {
    d.setDate(d.getDate() + 7);
  } while (d < hoy);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

/** «2026-09-20» y «23:30» en la hora del dispositivo. */
const fechaLocal = (iso: string) => {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`, time: `${dos(d.getHours())}:${dos(d.getMinutes())}` };
};

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
/** Ajustes y tipos de entrada de `origen` en la fiesta nueva. `false` si algo falló. */
const copiarConfiguracion = async (origen: Event, destinoId: string, nuevoInicio: Date): Promise<boolean> => {
  let ok = true;
  try {
    const ajustes = await eventSettingsService.get(origen.id);
    if (ajustes) await eventSettingsService.save(destinoId, ajustes);
  } catch {
    ok = false;
  }
  // Sin el plan de entradas, `getSales` da PLAN_REQUIRED: no hay nada que copiar.
  const tipos = await ticketsService.getSales(origen.id).catch(() => []);
  const desfase = nuevoInicio.getTime() - new Date(origen.startDate).getTime();
  const mover = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + desfase).toISOString() : null);
  for (const tipo of tipos.filter((x) => x.active)) {
    try {
      await ticketsService.saveType({
        eventId: destinoId,
        kind: tipo.kind,
        name: tipo.name,
        description: tipo.description,
        priceCents: tipo.priceCents,
        capacity: tipo.capacity,
        guests: tipo.guests,
        minSpendCents: tipo.minSpendCents,
        maxPerOrder: tipo.maxPerOrder,
        active: true,
        minAge: tipo.minAge,
        dressCode: tipo.dressCode,
        salesStartAt: mover(tipo.salesStartAt),
        salesEndAt: mover(tipo.salesEndAt),
      });
    } catch {
      ok = false;
    }
  }
  return ok;
};

const CreateEventForm: React.FC<CreateEventFormProps> = ({ onCreated, onClose, event, template, withSettings }) => {
  const { t } = useTranslation();
  const { currentVenue, createEvent, refreshEvents } = useAppContext();
  const { toast } = useToast();
  const editando = Boolean(event);
  // Al editar y al repetir se parte de los mismos datos; sólo cambia si se
  // guarda sobre el evento o se crea otro.
  const base = event ?? template;
  // Al editar están debajo del formulario; al repetir se copian del original.
  const conAjustes = Boolean(withSettings) && !event && !template;
  const [ajustes, setAjustes] = useState<Ajustes>(DEFAULT_LIVE_SETTINGS);

  const [isLoading, setIsLoading] = useState(false);
  const repitiendo = Boolean(template && !event);
  const [recurrence, setRecurrence] = useState<'none' | 'weekly' | 'biweekly'>(
    repitiendo ? (template?.recurrence ?? 'none') : 'none',
  );

  // El cartel se guarda aparte del formulario: el fichero no viaja por
  // react-hook-form, sólo la vista previa para enseñarlo antes de crear.
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(base?.posterUrl ?? null);

  // Dónde es: la del evento al editar; al crear, la del local si la tiene.
  // El line-up va aparte del formulario: es una lista de filas.
  const [lineup, setLineup] = useState<LineupArtist[]>(base?.lineup ?? []);

  const [ubicacion, setUbicacion] = useState<PickedLocation | null>(
    base?.location ?? currentVenue?.location ?? null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<EventFormData>({
    defaultValues: base
      ? {
          name: base.name,
          description: base.description ?? '',
          date: event ? fechaLocal(base.startDate).date : proximaFecha(base.startDate),
          startTime: fechaLocal(base.startDate).time,
          endTime: fechaLocal(base.endDate).time,
          capacity: base.maxCapacity ? String(base.maxCapacity) : '',
          price: base.price !== undefined && base.price !== null ? String(base.price) : '',
          minAge: String(base.minAge ?? 18),
          theme: base.theme ?? '',
          dressCode: base.dressCode ?? '',
          bookingUrl: base.bookingUrl ?? '',
        }
      : { minAge: '18', startTime: '23:30', endTime: '06:00' },
  });

  if (!currentVenue) return null;

  const campo =
    'w-full rounded-xl border border-black/10 bg-[#F5F5F7] px-3.5 py-2.5 text-body-md text-ink ' +
    'placeholder:text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ' +
    'disabled:opacity-50';
  const etiqueta = 'mb-1 block text-caption font-extrabold uppercase tracking-wide text-ink';

  const onSubmit = async (data: EventFormData) => {
    const { inicio, fin } = combinar(data.date, data.startTime, data.endTime);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      toast({ title: t('venue.events.badDates'), description: t('venue.events.badDatesBody'), variant: 'destructive' });
      return;
    }

    // Una fiesta nueva no puede haber terminado ya (al repetir es fácil dejar la fecha vieja).
    if (!event && fin.getTime() <= Date.now()) {
      toast({ title: t('venue.events.pastDate'), variant: 'destructive' });
      return;
    }

    // Sin ubicación la geocerca no puede comprobar que la gente está dentro.
    if (!ubicacion) {
      toast({ title: t('venue.events.locationMissing'), variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const minAge = Math.max(Number(data.minAge) || 18, 18);
      const capacity = data.capacity ? Number(data.capacity) : undefined;

      // El cartel se sube ahora, cuando ya se sabe que el evento va a existir.
      // Si falla, el evento se crea igual y el cartel se puede añadir después.
      let posterUrl: string | undefined = posterPreview && !posterFile ? posterPreview : undefined;
      if (posterFile) {
        try {
          // Los carteles son públicos: su propio bucket, no el privado de las fotos.
          posterUrl = (await api.uploadFile('event-posters', posterFile, posterFile.name)).url;
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
        lineup,
        location: { latitude: ubicacion.latitude, longitude: ubicacion.longitude },
      };

      // El local sin coordenadas toma las de su primer evento: la geocerca las
      // usa cuando un evento no tiene las suyas.
      if (!currentVenue.location) {
        void api.updateVenueLocation(ubicacion.latitude, ubicacion.longitude).catch(() => undefined);
      }

      if (event) {
        await api.updateEvent(event.id, eventData);
        await venueService
          .setCapacity(event.id, eventData.maxCapacity ?? null, 0.9)
          .catch(() => undefined);
        track('venue_event_updated', { eventId: event.id });
        toast({ title: t('venue.events.saved') });
        await refreshEvents();
        onCreated?.();
        return;
      }

      const newEvent = await createEvent(eventData);

      if (newEvent) {
        // El aviso de aforo arranca al 90 %, que es el mismo umbral por defecto
        // que usa la pestaña de puerta.
        if (eventData.maxCapacity) {
          await venueService.setCapacity(newEvent.id, eventData.maxCapacity, 0.9).catch(() => undefined);
        }
        // Repetir copia también lo que no está en el formulario: ajustes de la
        // fiesta y tipos de entrada (con su ventana de venta en la fecha nueva).
        if (template) {
          const copiado = await copiarConfiguracion(template, newEvent.id, inicio);
          if (!copiado) toast({ title: t('venue.events.repeatPartial'), variant: 'destructive' });
        } else if (conAjustes && differsFromDefault(ajustes)) {
          await eventSettingsService
            .save(newEvent.id, ajustes)
            .catch(() => toast({ title: t('venue.liveSettings.afterCreateFailed'), variant: 'destructive' }));
        }
        setAjustes(DEFAULT_LIVE_SETTINGS);
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
    <div className="rounded-[20px] bg-white p-5 text-ink">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-headline-lg">
          {repitiendo && template
            ? t('venue.events.repeatTitle', { name: template.name })
            : t(editando ? 'venue.events.editEvent' : 'venue.events.newEvent')}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-ink"
          >
            <X size={18} />
          </button>
        )}
      </div>

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
          <span className={etiqueta}>{t('venue.events.location')} *</span>
          <LocationPicker value={ubicacion} onChange={setUbicacion} />
        </div>

        <div className={cn(repitiendo && '-mx-2 rounded-2xl bg-party-primary/25 p-2')}>
          {repitiendo && (
            <p className="mb-2 flex items-start gap-2 text-body-sm font-bold text-ink">
              <CopyPlus size={16} className="mt-0.5 shrink-0" />
              {t('venue.events.repeatHelp')}
            </p>
          )}
          <label htmlFor="ev-date" className={etiqueta}>
            {t(repitiendo ? 'venue.events.repeatDate' : 'venue.events.date')} *
          </label>
          <input
            id="ev-date"
            type="date"
            autoFocus={repitiendo}
            min={repitiendo ? fechaLocal(new Date().toISOString()).date : undefined}
            {...register('date', { required: t('auth.errors.checkForm') })}
            className={cn(campo, repitiendo && 'ring-2 ring-ink')}
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
          <MusicSelect
            id="ev-theme"
            value={watch('theme') ?? ''}
            onChange={(v) => setValue('theme', v, { shouldDirty: true })}
            className={campo}
          />
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

        <LineupEditor value={lineup} onChange={setLineup} inputClassName={campo} labelClassName={etiqueta} />

        {/* El cartel. La columna `poster_url` existía desde el principio y no
            había forma de rellenarla. */}
        <div>
          <span className={etiqueta}>{t('venue.events.poster')}</span>
          <PosterPicker
            preview={posterPreview}
            onFile={(file, vista) => {
              setPosterFile(file);
              setPosterPreview(vista);
            }}
            onUrl={(url) => {
              setPosterFile(null);
              setPosterPreview(url);
            }}
            onClear={() => {
              setPosterPreview(null);
              setPosterFile(null);
            }}
          />
        </div>

        {!editando && (
        <div className="space-y-3 rounded-xl bg-[#F5F5F7] p-3.5">
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
                  'absolute left-0 top-0.5 h-5 w-5 rounded-full transition-transform duration-200 [transition-timing-function:var(--ease-out)]',
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
        )}

        <div>
          <label htmlFor="ev-booking" className={etiqueta}>
            {t('venue.events.bookingUrl')}
          </label>
          <input id="ev-booking" type="url" {...register('bookingUrl')} className={campo} placeholder="https://…" />
        </div>

        {conAjustes && <EventLiveSettings value={ajustes} onChange={setAjustes} className="border border-black/[0.08]" />}

        {/* Invertido: sobre el amarillo, un botón amarillo no se vería. */}
        <button
          type="submit"
          disabled={isLoading}
          className="press flex h-12 w-full items-center justify-center rounded-xl bg-party-primary font-display text-title-card font-extrabold text-ink disabled:opacity-60"
        >
          {isLoading ? t('venue.events.creating') : t(editando ? 'venue.events.saveChanges' : 'venue.events.publish')}
        </button>
      </form>
    </div>
  );
};

export default CreateEventForm;
