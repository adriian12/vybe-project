import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, ImagePlus, Loader2, Lock, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import LocationPicker, { PickedLocation } from '@/components/venue/location-picker';
import { ApiError } from '@/services/api';
import { BusinessProfile, businessProfileService } from '@/services/business-profile';

/**
 * «Negocio»: el perfil que ve el público (ficha, compra de entradas y PDF de
 * la entrada). Logo, nombre, dirección en el mapa, contacto y las condiciones
 * de venta que el comprador acepta al comprar.
 */

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** «miweb.com» → «https://miweb.com»; vacío → null; basura → undefined. */
const normalizarWeb = (texto: string): string | null | undefined => {
  const limpio = texto.trim();
  if (!limpio) return null;
  const url = /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
  try {
    const u = new URL(url);
    return u.hostname.includes('.') ? u.toString() : undefined;
  } catch {
    return undefined;
  }
};

/** «@sala», «instagram.com/sala/» o «sala» → «sala». */
const normalizarInstagram = (texto: string): string | null | undefined => {
  const limpio = texto
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
  if (!limpio) return null;
  return /^[A-Za-z0-9._]{1,30}$/.test(limpio) ? limpio : undefined;
};

type Campos = {
  name: string;
  address: string;
  city: string;
  phone: string;
  contactEmail: string;
  website: string;
  instagram: string;
  businessTerms: string;
};

const VenueBusinessProfile = ({ venueId }: { venueId: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const archivo = useRef<HTMLInputElement | null>(null);
  const [perfil, setPerfil] = useState<BusinessProfile | null>(null);
  const [campos, setCampos] = useState<Campos | null>(null);
  const [ubicacion, setUbicacion] = useState<PickedLocation | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    void businessProfileService.get(venueId).then((p) => {
      if (!vivo || !p) return;
      setPerfil(p);
      setCampos({
        name: p.name,
        address: p.address ?? '',
        city: p.city ?? '',
        phone: p.phone ?? '',
        contactEmail: p.contactEmail ?? '',
        website: p.website ?? '',
        instagram: p.instagram ? `@${p.instagram}` : '',
        businessTerms: p.businessTerms ?? '',
      });
      if (p.latitude !== null && p.longitude !== null) setUbicacion({ latitude: p.latitude, longitude: p.longitude });
    });
    return () => {
      vivo = false;
    };
  }, [venueId]);

  if (!perfil || !campos) {
    return (
      <div className="surface-light flex justify-center rounded-2xl p-6">
        <Loader2 className="h-5 w-5 animate-spin text-party-primary" />
      </div>
    );
  }

  const error = (key: string) => toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
  const poner = (campo: keyof Campos, valor: string) => setCampos({ ...campos, [campo]: valor });

  const subirLogo = async (file: File | undefined) => {
    if (!file) return;
    setSubiendo(true);
    try {
      const url = await businessProfileService.uploadLogo(venueId, file);
      setPerfil({ ...perfil, logoUrl: url });
      toast({ title: t('venue.business.logoSaved') });
    } catch (e) {
      error(e instanceof ApiError ? e.message : 'errors.generic');
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = '';
    }
  };

  const quitarLogo = async () => {
    setSubiendo(true);
    try {
      await businessProfileService.removeLogo(venueId);
      setPerfil({ ...perfil, logoUrl: null });
    } catch (e) {
      error(e instanceof ApiError ? e.message : 'errors.generic');
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async () => {
    const web = normalizarWeb(campos.website);
    const instagram = normalizarInstagram(campos.instagram);
    const correo = campos.contactEmail.trim().toLowerCase();
    const telefono = campos.phone.trim();
    if (campos.name.trim().length < 2) return error('venue.business.errors.name');
    if (web === undefined) return error('venue.business.errors.website');
    if (instagram === undefined) return error('venue.business.errors.instagram');
    if (correo && !CORREO.test(correo)) return error('venue.business.errors.email');
    if (telefono && telefono.replace(/\D/g, '').length < 9) return error('venue.business.errors.phone');

    setGuardando(true);
    try {
      await businessProfileService.save(venueId, {
        name: campos.name.trim(),
        address: campos.address.trim() || null,
        city: campos.city.trim() || null,
        latitude: ubicacion?.latitude ?? null,
        longitude: ubicacion?.longitude ?? null,
        phone: telefono || null,
        contactEmail: correo || null,
        website: web,
        instagram,
        businessTerms: campos.businessTerms.trim() || null,
      });
      setCampos({ ...campos, website: web ?? '', instagram: instagram ? `@${instagram}` : '' });
      toast({ title: t('venue.business.saved') });
    } catch (e) {
      error(e instanceof ApiError ? e.message : 'errors.generic');
    } finally {
      setGuardando(false);
    }
  };

  const campo = (id: keyof Campos, props: React.ComponentProps<typeof Input> & { label: string; help?: string }) => {
    const { label, help, ...resto } = props;
    return (
      <div className="space-y-1">
        <Label htmlFor={`bp-${id}`} className="text-caption">
          {label}
        </Label>
        <Input id={`bp-${id}`} value={campos[id]} onChange={(e) => poner(id, e.target.value)} {...resto} />
        {help && <p className="text-caption text-party-gray">{help}</p>}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* ------------------------------------------------------------ logo */}
      <section className="surface-light rounded-2xl p-4">
        <h3 className="mb-1 flex items-center gap-2 font-display text-title-card uppercase">
          <Building2 size={17} />
          {t('venue.business.title')}
        </h3>
        <p className="mb-4 text-caption text-party-gray">{t('venue.business.hint')}</p>

        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-white">
            {perfil.logoUrl ? (
              <img src={perfil.logoUrl} alt={t('venue.business.logo')} className="h-full w-full object-contain" />
            ) : (
              <span className="font-display text-headline-md font-black text-ink/30">
                {campos.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-caption text-party-gray">{t('venue.business.logoHelp')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={subiendo}
                onClick={() => archivo.current?.click()}
                className="press flex h-10 items-center gap-1.5 rounded-lg bg-party-primary px-3 text-caption font-bold text-ink disabled:opacity-50"
              >
                {subiendo ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                {perfil.logoUrl ? t('venue.business.changeLogo') : t('venue.business.uploadLogo')}
              </button>
              {perfil.logoUrl && (
                <button
                  type="button"
                  disabled={subiendo}
                  onClick={() => void quitarLogo()}
                  className="press flex h-10 items-center gap-1.5 rounded-lg border border-black/15 px-3 text-caption font-bold disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  {t('venue.business.removeLogo')}
                </button>
              )}
            </div>
            <input
              ref={archivo}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => void subirLogo(e.target.files?.[0])}
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- datos */}
      <section className="surface-light space-y-3 rounded-2xl p-4">
        <div className="space-y-1">
          <Label htmlFor="bp-name" className="text-caption">
            {t('venue.business.name')}
          </Label>
          <div className="relative">
            <Input
              id="bp-name"
              value={campos.name}
              maxLength={80}
              disabled={perfil.isVerified}
              onChange={(e) => poner('name', e.target.value)}
            />
            {perfil.isVerified && (
              <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-party-gray" />
            )}
          </div>
          {perfil.isVerified && <p className="text-caption text-party-gray">{t('venue.business.nameLocked')}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            {campo('address', { label: t('venue.business.address'), maxLength: 200, autoComplete: 'street-address' })}
          </div>
          {campo('city', { label: t('venue.business.city'), maxLength: 80 })}
        </div>
        <div className="space-y-1">
          <p className="text-caption font-medium">{t('venue.business.map')}</p>
          <LocationPicker
            value={ubicacion}
            onChange={(lugar) => {
              setUbicacion(lugar);
              if (lugar.label && !campos.address.trim()) poner('address', lugar.label);
            }}
          />
          <p className="text-caption text-party-gray">{t('venue.business.mapHelp')}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {campo('phone', { label: t('venue.business.phone'), type: 'tel', inputMode: 'tel', maxLength: 24 })}
          {campo('contactEmail', {
            label: t('venue.business.contactEmail'),
            type: 'email',
            inputMode: 'email',
            autoCapitalize: 'none',
            maxLength: 120,
            help: t('venue.business.contactEmailHelp'),
          })}
          {campo('website', { label: t('venue.business.website'), inputMode: 'url', autoCapitalize: 'none', placeholder: 'https://', maxLength: 200 })}
          {campo('instagram', { label: t('venue.business.instagram'), autoCapitalize: 'none', placeholder: '@', maxLength: 60 })}
        </div>
      </section>

      {/* ------------------------------------------------------- condiciones */}
      <section className="surface-light space-y-2 rounded-2xl p-4">
        <Label htmlFor="bp-terms" className="font-display text-title-card uppercase">
          {t('venue.business.terms')}
        </Label>
        <p className="text-caption text-party-gray">{t('venue.business.termsHelp')}</p>
        <Textarea
          id="bp-terms"
          rows={8}
          maxLength={6000}
          value={campos.businessTerms}
          placeholder={t('venue.business.termsPlaceholder')}
          onChange={(e) => poner('businessTerms', e.target.value)}
        />
        <p className="text-right text-caption text-party-gray tabular">{campos.businessTerms.length}/6000</p>
      </section>

      <PartyButton className="w-full" disabled={guardando} onClick={() => void guardar()}>
        {guardando ? <Loader2 size={16} className="animate-spin" /> : t('common.save')}
      </PartyButton>
    </div>
  );
};

export default VenueBusinessProfile;
