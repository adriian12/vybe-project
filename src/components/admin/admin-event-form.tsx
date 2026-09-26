import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, Check, ChevronsUpDown, Loader2, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { adminService, AdminEventInput, AdminVenue } from '@/services/admin';
import LocationPicker, { PickedLocation } from '@/components/venue/location-picker';
import { Event } from '@/types/venue';

const HOUSE = 'house';

/** «2026-09-26» y «23:00» en la hora local, para los campos del formulario. */
const partes = (iso: string) => {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`, time: `${dos(d.getHours())}:${dos(d.getMinutes())}` };
};

/**
 * Fiestas creadas por administración: verbenas, fiestas de pueblo, festivales,
 * la de un local que pide que se la creemos o las traídas de Funout.
 *
 * Por defecto van al local de la casa (`venues.is_platform`), porque en la base
 * de datos cada evento cuelga de uno, y en la tarjeta salen con su sala o como
 * «Evento creado por Fiestea». El selector busca entre los locales para
 * asignársela a uno.
 *
 * Con `event` edita esa fiesta (el lápiz de Eventos): el local ya no se cambia.
 */
const AdminEventForm = ({
  onCreated,
  bare,
  event,
}: {
  onCreated?: () => void;
  bare?: boolean;
  event?: Event;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const editando = Boolean(event);
  const inicio0 = event ? partes(event.startDate) : null;
  const fin0 = event ? partes(event.endDate) : null;

  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [venueId, setVenueId] = useState(HOUSE);
  const [buscando, setBuscando] = useState(false);
  const [name, setName] = useState(event?.name ?? '');
  const [city, setCity] = useState(event?.city ?? '');
  const [date, setDate] = useState(inicio0?.date ?? '');
  const [startTime, setStartTime] = useState(inicio0?.time ?? '23:00');
  const [endTime, setEndTime] = useState(fin0?.time ?? '06:00');
  const [price, setPrice] = useState(event?.price !== undefined ? String(event.price) : '');
  const [capacity, setCapacity] = useState(event?.maxCapacity !== undefined ? String(event.maxCapacity) : '');
  const [theme, setTheme] = useState(event?.theme ?? '');
  const [placeName, setPlaceName] = useState(event?.placeName ?? '');
  const [address, setAddress] = useState(event?.location?.address ?? '');
  const [dressCode, setDressCode] = useState(event?.dressCode ?? '');
  const [bookingUrl, setBookingUrl] = useState(event?.bookingUrl ?? '');
  const [posterUrl, setPosterUrl] = useState(event?.posterUrl ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [lugar, setLugar] = useState<PickedLocation | null>(
    event?.location ? { latitude: event.location.latitude, longitude: event.location.longitude } : null,
  );
  const deLaCasa = editando ? Boolean(event?.byPlatform) : venueId === HOUSE;
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!editando) void adminService.listVenues().then(setVenues).catch(() => undefined);
  }, [editando]);

  const casa = t('admin.newEvent.house', { app: t('common.appName') });
  const nombreLocal = venueId === HOUSE ? casa : (venues.find((v) => v.venueId === venueId)?.name ?? casa);

  const guardar = async () => {
    // La hora de fin anterior a la de inicio es de madrugada: el día siguiente.
    const inicio = new Date(`${date}T${startTime}`);
    const fin = new Date(`${date}T${endTime}`);
    if (fin <= inicio) fin.setDate(fin.getDate() + 1);

    const datos: AdminEventInput = {
      name: name.trim(),
      start: inicio.toISOString(),
      end: fin.toISOString(),
      venueId: venueId === HOUSE ? null : venueId,
      city: city.trim() || null,
      price: price !== '' ? Number(price) : null,
      capacity: capacity ? Number(capacity) : null,
      theme: theme.trim() || null,
      latitude: lugar?.latitude ?? null,
      longitude: lugar?.longitude ?? null,
      placeName: placeName.trim() || null,
      address: address.trim() || null,
      dressCode: dressCode.trim() || null,
      bookingUrl: bookingUrl.trim() || null,
      posterUrl: posterUrl.trim() || null,
      description: description.trim() || null,
    };

    setEnviando(true);
    try {
      if (event) {
        await adminService.updateEvent(event.id, datos);
      } else {
        // Se crea y se completa con lo que la creación no admite (sala,
        // dirección, cartel, entradas…).
        const id = await adminService.createEvent(datos);
        if (id) await adminService.updateEvent(id, datos);
        setName('');
        setCity('');
        setPrice('');
        setCapacity('');
        setTheme('');
        setPlaceName('');
        setAddress('');
        setDressCode('');
        setBookingUrl('');
        setPosterUrl('');
        setDescription('');
        setLugar(null);
      }
      onCreated?.();
      toast({ title: t(event ? 'admin.newEvent.saved' : 'admin.newEvent.done') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  const campo = (id: string, label: string, input: React.ReactNode) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-caption">
        {label}
      </Label>
      {input}
    </div>
  );

  return (
    <section className={bare ? 'space-y-3 text-ink' : 'space-y-3 rounded-2xl bg-white p-4 text-ink'}>
      {!bare && (
        <div>
          <h3 className="font-display text-title-card uppercase tracking-wide">
            {t(editando ? 'admin.newEvent.editTitle' : 'admin.newEvent.title')}
          </h3>
          <p className="text-caption text-ink/60">{t('admin.newEvent.subtitle')}</p>
        </div>
      )}

      <div className={cn('grid gap-2', !editando && 'sm:grid-cols-2')}>
        {campo('ae-name', t('admin.newEvent.name'), (
          <Input id="ae-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        ))}
        {!editando && (
          <div className="space-y-1">
            <Label htmlFor="ae-venue" className="text-caption">
              {t('admin.newEvent.venue')}
            </Label>
            <Popover open={buscando} onOpenChange={setBuscando}>
              <PopoverTrigger asChild>
                <button
                  id="ae-venue"
                  type="button"
                  role="combobox"
                  aria-expanded={buscando}
                  className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-body-sm"
                >
                  <span className="truncate">{nombreLocal}</span>
                  <ChevronsUpDown size={15} className="shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder={t('admin.newEvent.searchVenue')} />
                  <CommandList>
                    <CommandEmpty>{t('admin.newEvent.noVenue')}</CommandEmpty>
                    <CommandGroup>
                      {[{ venueId: HOUSE, name: casa, city: null as string | null }, ...venues].map((v) => (
                        <CommandItem
                          key={v.venueId}
                          value={`${v.name} ${v.city ?? ''} ${v.venueId}`}
                          onSelect={() => {
                            setVenueId(v.venueId);
                            setBuscando(false);
                          }}
                        >
                          <Check size={15} className={cn('mr-2 shrink-0', venueId === v.venueId ? 'opacity-100' : 'opacity-0')} />
                          <span className="truncate">{v.name}</span>
                          {v.city && <span className="ml-auto pl-2 text-caption text-muted-foreground">{v.city}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {campo('ae-date', t('admin.newEvent.date'), (
          <Input id="ae-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        ))}
        {campo('ae-start', t('admin.newEvent.start'), (
          <Input id="ae-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        ))}
        {campo('ae-end', t('admin.newEvent.end'), (
          <Input id="ae-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {campo('ae-place', t('admin.newEvent.placeName'), (
          <Input id="ae-place" value={placeName} maxLength={120} onChange={(e) => setPlaceName(e.target.value)} />
        ))}
        {campo('ae-address', t('admin.newEvent.address'), (
          <Input id="ae-address" value={address} maxLength={240} onChange={(e) => setAddress(e.target.value)} />
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {campo('ae-city', t('admin.newEvent.city'), (
          <Input id="ae-city" value={city} maxLength={60} onChange={(e) => setCity(e.target.value)} />
        ))}
        {campo('ae-theme', t('admin.newEvent.theme'), (
          <Input id="ae-theme" value={theme} maxLength={40} onChange={(e) => setTheme(e.target.value)} />
        ))}
        {campo('ae-price', t('admin.newEvent.price'), (
          <Input id="ae-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        ))}
        {campo('ae-capacity', t('admin.newEvent.capacity'), (
          <Input id="ae-capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {campo('ae-dress', t('admin.newEvent.dressCode'), (
          <Input id="ae-dress" value={dressCode} maxLength={40} onChange={(e) => setDressCode(e.target.value)} />
        ))}
        {campo('ae-booking', t('admin.newEvent.bookingUrl'), (
          <Input id="ae-booking" type="url" inputMode="url" placeholder="https://" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} />
        ))}
        {campo('ae-poster', t('admin.newEvent.posterUrl'), (
          <Input id="ae-poster" type="url" inputMode="url" placeholder="https://" value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} />
        ))}
      </div>

      {campo('ae-desc', t('admin.newEvent.description'), (
        <Textarea id="ae-desc" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      ))}

      {/* Las fiestas de Fiestea se entran con la ubicación: sin punto en el
          mapa no se podría comprobar que la gente está allí. */}
      <div className="space-y-1">
        <Label className="text-caption">
          {t('admin.newEvent.location')} {deLaCasa ? '*' : `(${t('admin.newEvent.optional')})`}
        </Label>
        <p className="text-caption text-ink/60">
          {t(deLaCasa ? 'admin.newEvent.locationHouseHelp' : 'admin.newEvent.locationVenueHelp', { app: t('common.appName') })}
        </p>
        <LocationPicker
          value={lugar}
          onChange={(l) => {
            setLugar(l);
            if (l.label && !address.trim()) setAddress(l.label);
          }}
        />
      </div>

      <PartyButton
        className={bare ? 'w-full gap-2' : 'w-full gap-2 sm:w-auto'}
        disabled={enviando || name.trim().length < 2 || !date || (deLaCasa && !lugar)}
        onClick={() => void guardar()}
      >
        {enviando ? (
          <Loader2 size={15} className="animate-spin" />
        ) : editando ? (
          <Save size={15} />
        ) : (
          <CalendarPlus size={15} />
        )}
        {t(editando ? 'common.save' : 'admin.newEvent.create')}
      </PartyButton>
    </section>
  );
};

export default AdminEventForm;
