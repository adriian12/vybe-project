import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { adminService, AdminVenue } from '@/services/admin';

/**
 * Fiestas creadas por administración: verbenas, fiestas de pueblo, festivales.
 *
 * Sin elegir local van al local de la casa («Fiestea»), porque en la base de
 * datos cada evento cuelga de uno. Se puede asignar a un local de verdad si la
 * fiesta es suya.
 */
const AdminEventForm = ({ onCreated, bare }: { onCreated?: () => void; bare?: boolean }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [venueId, setVenueId] = useState('house');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('23:00');
  const [endTime, setEndTime] = useState('06:00');
  const [price, setPrice] = useState('');
  const [capacity, setCapacity] = useState('');
  const [theme, setTheme] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void adminService.listVenues().then(setVenues).catch(() => undefined);
  }, []);

  const crear = async () => {
    // La hora de fin anterior a la de inicio es de madrugada: el día siguiente.
    const inicio = new Date(`${date}T${startTime}`);
    const fin = new Date(`${date}T${endTime}`);
    if (fin <= inicio) fin.setDate(fin.getDate() + 1);

    setEnviando(true);
    try {
      await adminService.createEvent({
        name: name.trim(),
        start: inicio.toISOString(),
        end: fin.toISOString(),
        venueId: venueId === 'house' ? null : venueId,
        city: city.trim() || null,
        price: price ? Number(price) : null,
        capacity: capacity ? Number(capacity) : null,
        theme: theme.trim() || null,
      });
      setName('');
      setCity('');
      setPrice('');
      setCapacity('');
      setTheme('');
      onCreated?.();
      toast({ title: t('admin.newEvent.done') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className={bare ? 'space-y-3 text-ink' : 'space-y-3 rounded-2xl bg-white p-4 text-ink'}>
      {!bare && (
        <div>
          <h3 className="font-display text-title-card uppercase tracking-wide">{t('admin.newEvent.title')}</h3>
          <p className="text-caption text-ink/60">{t('admin.newEvent.subtitle')}</p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ae-name" className="text-caption">
            {t('admin.newEvent.name')}
          </Label>
          <Input id="ae-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ae-venue" className="text-caption">
            {t('admin.newEvent.venue')}
          </Label>
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger id="ae-venue">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="house">{t('admin.newEvent.house')}</SelectItem>
              {venues.map((v) => (
                <SelectItem key={v.venueId} value={v.venueId}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="ae-date" className="text-caption">
            {t('admin.newEvent.date')}
          </Label>
          <Input id="ae-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ae-start" className="text-caption">
            {t('admin.newEvent.start')}
          </Label>
          <Input id="ae-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ae-end" className="text-caption">
            {t('admin.newEvent.end')}
          </Label>
          <Input id="ae-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="ae-city" className="text-caption">
            {t('admin.newEvent.city')}
          </Label>
          <Input id="ae-city" value={city} maxLength={60} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ae-theme" className="text-caption">
            {t('admin.newEvent.theme')}
          </Label>
          <Input id="ae-theme" value={theme} maxLength={40} onChange={(e) => setTheme(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ae-price" className="text-caption">
            {t('admin.newEvent.price')}
          </Label>
          <Input id="ae-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ae-capacity" className="text-caption">
            {t('admin.newEvent.capacity')}
          </Label>
          <Input
            id="ae-capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
      </div>

      <PartyButton
        className={bare ? 'w-full gap-2' : 'w-full gap-2 sm:w-auto'}
        disabled={enviando || name.trim().length < 2 || !date}
        onClick={() => void crear()}
      >
        {enviando ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} />}
        {t('admin.newEvent.create')}
      </PartyButton>
    </section>
  );
};

export default AdminEventForm;
