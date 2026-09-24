import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Mail, MapPin, Store, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import LocationPicker, { PickedLocation } from '@/components/venue/location-picker';
import { adminService } from '@/services/admin';
import type { VenueType } from '@/types/venue';
import { cn } from '@/lib/utils';

interface AdminCreateProps {
  /** Para refrescar la lista de debajo cuando se crea algo. */
  onCreated?: () => void;
  /** Con un tipo fijo no se enseñan las pestañas de persona o local. */
  type?: 'user' | 'venue';
  /** Dentro de una ventana no hace falta ni tarjeta ni título. */
  bare?: boolean;
}

/** Tipos de local que se pueden elegir al darlo de alta. */
const TIPOS_LOCAL: VenueType[] = ['discoteca', 'bar', 'festival', 'fiesta_privada', 'evento_empresarial', 'local'];

/**
 * Alta de cuentas desde administración.
 *
 * Una persona se crea sólo con nombre y correo. Un local pide además su tipo y
 * su ubicación, porque sin coordenadas sus códigos QR no funcionan. En los dos
 * casos no se pone contraseña: a esa dirección le llega un enlace para
 * elegirla, así administración nunca ve la contraseña de nadie.
 */
const AdminCreate = ({ onCreated, type: tipoFijo, bare }: AdminCreateProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [tipo, setTipo] = useState<'user' | 'venue'>(tipoFijo ?? 'user');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [venueType, setVenueType] = useState<VenueType>('discoteca');
  const [city, setCity] = useState('');
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [enviando, setEnviando] = useState(false);

  const esLocal = tipo === 'venue';

  const crear = async () => {
    setEnviando(true);
    try {
      const { emailSent } = await adminService.createAccount(tipo, name.trim(), email.trim(), {
        venueType,
        city: city.trim() || null,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      });
      setName('');
      setEmail('');
      setCity('');
      setLocation(null);
      onCreated?.();
      toast({
        title: t(esLocal ? 'admin.create.venueDone' : 'admin.create.userDone'),
        description: t(emailSent ? 'admin.create.mailSent' : 'admin.create.mailFailed'),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const conocidos: Record<string, string> = {
        EMAIL_TAKEN: 'admin.create.emailTaken',
        EMAIL_INVALID: 'admin.create.emailInvalid',
        NAME_REQUIRED: 'admin.create.nameRequired',
      };
      toast({
        title: t('common.error'),
        description: conocidos[code] ? t(conocidos[code]) : t('errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setEnviando(false);
    }
  };

  const pill = (activo: boolean) =>
    cn(
      'press flex h-10 items-center gap-1.5 rounded-full px-4 text-label-pill',
      activo ? 'bg-party-primary text-ink' : 'bg-black/[0.06] text-ink/70',
    );

  return (
    <section className={bare ? 'space-y-3 text-ink' : 'space-y-3 rounded-2xl bg-white p-4 text-ink'}>
      {!bare && (
        <div>
          <h3 className="font-display text-title-card uppercase tracking-wide">{t('admin.create.title')}</h3>
          <p className="text-caption text-ink/60">{t('admin.create.subtitle')}</p>
        </div>
      )}

      {!tipoFijo && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setTipo('user')} className={pill(tipo === 'user')}>
            <UserPlus size={15} />
            {t('admin.create.user')}
          </button>
          <button type="button" onClick={() => setTipo('venue')} className={pill(esLocal)}>
            <Store size={15} />
            {t('admin.create.venue')}
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="alta-nombre" className="text-caption">
            {t('admin.create.name')}
          </Label>
          <Input id="alta-nombre" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="alta-email" className="text-caption">
            {t('admin.create.email')}
          </Label>
          <Input
            id="alta-email"
            type="email"
            value={email}
            maxLength={120}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      {esLocal && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="alta-tipo" className="text-caption">
              {t('admin.create.venueType')}
            </Label>
            <Select value={venueType} onValueChange={(v) => setVenueType(v as VenueType)}>
              <SelectTrigger id="alta-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_LOCAL.map((tp) => (
                  <SelectItem key={tp} value={tp}>
                    {t(`venueTypes.${tp}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="alta-ciudad" className="text-caption">
              {t('admin.create.city')}
            </Label>
            <Input id="alta-ciudad" value={city} maxLength={60} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>
      )}

      {esLocal && (
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5 text-caption">
            <MapPin size={13} />
            {t('admin.create.location')}
          </Label>
          <LocationPicker value={location} onChange={setLocation} />
          <p className="text-caption text-ink/50">{t('admin.create.locationHelp')}</p>
        </div>
      )}

      <PartyButton
        className={bare ? 'w-full gap-2' : 'gap-2 sm:w-auto'}
        disabled={enviando || name.trim().length < 2 || !email.includes('@')}
        onClick={() => void crear()}
      >
        {enviando ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
        {t('admin.create.send')}
      </PartyButton>
    </section>
  );
};

export default AdminCreate;
