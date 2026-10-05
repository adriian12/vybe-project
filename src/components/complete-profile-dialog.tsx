import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Loader2, Minus, Plus, Ticket } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';
import { cn } from '@/lib/utils';

/** Planes rápidos: un toque en vez de escribir. */
const PLANES = ['dance', 'meet', 'drinks', 'friends', 'whatever'] as const;

const Opciones = <T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T | null;
  options: readonly T[];
  label: (o: T) => string;
  onChange: (o: T) => void;
}) => (
  <div className={cn('grid gap-1 rounded-xl bg-card p-1', options.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
    {options.map((o) => (
      <button
        key={o}
        type="button"
        onClick={() => onChange(o)}
        aria-pressed={value === o}
        className={cn(
          'press h-11 rounded-lg text-sm font-bold',
          value === o ? 'bg-party-primary text-ink' : 'text-party-gray hover:text-foreground',
        )}
      >
        {label(o)}
      </button>
    ))}
  </div>
);

export interface FiesterData {
  age: number;
  gender: 'woman' | 'man';
  wants: 'women' | 'men' | 'all';
  planTonight: string;
  bio: string;
}

/**
 * Los datos de fiester@: edad, si es hombre o mujer, a quién quiere ver, el
 * plan de esta noche y una bio opcional. Lo usan el primer acceso y el paso de
 * invitado a fiester@; si la cuenta ya fue fiester@, llega rellenado.
 */
export const FiesterForm = ({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<FiesterData>;
  submitLabel?: string;
  onSubmit: (data: FiesterData) => Promise<void>;
}) => {
  const { t } = useTranslation();
  const [edad, setEdad] = useState(initial?.age && initial.age >= 18 ? initial.age : 18);
  const [genero, setGenero] = useState<'woman' | 'man' | null>(initial?.gender ?? null);
  const [quiere, setQuiere] = useState<'women' | 'men' | 'all' | null>(initial?.wants ?? null);
  const [plan, setPlan] = useState<string>('');
  const [otroPlan, setOtroPlan] = useState(initial?.planTonight ?? '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [enviando, setEnviando] = useState(false);

  const planFinal = otroPlan.trim() || (plan ? t(`completeProfile.plans.${plan}`) : '');
  const listo = edad >= 18 && edad <= 99 && genero !== null && quiere !== null;

  const guardar = async () => {
    if (!listo || !genero || !quiere) return;
    setEnviando(true);
    try {
      await onSubmit({ age: edad, gender: genero, wants: quiere, planTonight: planFinal, bio: bio.trim() });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-body-sm font-bold">{t('completeProfile.age')}</p>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="-1" onClick={() => setEdad((e) => Math.max(18, e - 1))} className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface-high">
            <Minus size={18} />
          </button>
          <Input
            type="number"
            inputMode="numeric"
            min={18}
            max={99}
            value={edad}
            onChange={(e) => setEdad(Math.floor(Number(e.target.value) || 0))}
            className="h-11 w-20 text-center font-display text-headline-md"
            aria-label={t('completeProfile.age')}
          />
          <button type="button" aria-label="+1" onClick={() => setEdad((e) => Math.min(99, e + 1))} className="press flex h-11 w-11 items-center justify-center rounded-full bg-party-primary text-ink">
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-body-sm font-bold">{t('completeProfile.gender')}</p>
        <Opciones value={genero} options={['woman', 'man'] as const} label={(o) => t(`auth.genders.${o}`)} onChange={(o) => setGenero(o as 'woman' | 'man')} />
        <p className="text-caption text-party-gray">{t('completeProfile.genderHelp')}</p>
      </div>

      <div className="space-y-2">
        <p className="text-body-sm font-bold">{t('completeProfile.wants')}</p>
        <Opciones value={quiere} options={['women', 'men', 'all'] as const} label={(o) => t(`auth.wantsOptions.${o}`)} onChange={(o) => setQuiere(o as 'women' | 'men' | 'all')} />
      </div>

      <div className="space-y-2">
        <p className="text-body-sm font-bold">{t('completeProfile.plan')}</p>
        <div className="flex flex-wrap gap-1.5">
          {PLANES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPlan(plan === p ? '' : p);
                setOtroPlan('');
              }}
              aria-pressed={plan === p && !otroPlan}
              className={cn(
                'press h-9 rounded-full px-3.5 text-caption font-bold',
                plan === p && !otroPlan ? 'bg-party-primary text-ink' : 'bg-surface-high text-foreground/80',
              )}
            >
              {t(`completeProfile.plans.${p}`)}
            </button>
          ))}
        </div>
        <Input
          value={otroPlan}
          maxLength={60}
          onChange={(e) => setOtroPlan(e.target.value)}
          placeholder={t('completeProfile.planPlaceholder')}
          aria-label={t('completeProfile.planPlaceholder')}
        />
      </div>

      <div className="space-y-2">
        <p className="text-body-sm font-bold">
          {t('completeProfile.bio')} <span className="font-normal text-party-gray">({t('completeProfile.optional')})</span>
        </p>
        <Textarea
          value={bio}
          maxLength={500}
          rows={3}
          onChange={(e) => setBio(e.target.value)}
          placeholder={t('completeProfile.bioPlaceholder')}
        />
      </div>

      <PartyButton size="lg" className="w-full" disabled={!listo || enviando} onClick={() => void guardar()}>
        {enviando && <Loader2 size={16} className="animate-spin" />}
        {submitLabel ?? t('completeProfile.save')}
      </PartyButton>
    </div>
  );
};

/**
 * Primer acceso de una cuenta de fiester@ sin ficha (migración 075).
 *
 * Con Google o Apple la cuenta se crea sin haber elegido nada, así que antes
 * se pregunta cómo quiere entrar:
 *   · Invitado: entra con el nombre de su cuenta de Google; para ver fiestas y
 *     comprar entradas no hace falta nada más.
 *   · Fiester@: la ficha de siempre (edad, género, a quién quiere ver, plan).
 * Quien se registra con correo ya lo eligió en el alta y va directo a la ficha.
 * No se puede cerrar sin terminar: sin esos datos el tablón no funciona.
 */
const CompleteProfileDialog = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentUser, userType, refreshProfile } = useAppContext();
  const [paso, setPaso] = useState<'tipo' | 'datos' | null>(null);
  const [eligiendo, setEligiendo] = useState(false);

  const abierto =
    userType === 'user' &&
    Boolean(currentUser) &&
    currentUser?.role !== 'admin' &&
    !currentUser?.staffOnly &&
    currentUser?.accountType === 'vyber' &&
    currentUser?.profileCompleted === false;

  // ¿Viene de Google o Apple? Entonces aún no ha elegido el tipo de cuenta.
  useEffect(() => {
    if (!abierto) {
      setPaso(null);
      return;
    }
    let vivo = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!vivo) return;
      const proveedor = String(data.user?.app_metadata?.provider ?? 'email');
      setPaso(proveedor === 'email' ? 'datos' : 'tipo');
    });
    return () => {
      vivo = false;
    };
  }, [abierto]);

  const entrarComoInvitado = async () => {
    setEligiendo(true);
    try {
      await api.setAccountType('guest');
      await refreshProfile();
      toast({ title: t('accountKind.guest.switched') });
    } catch {
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    } finally {
      setEligiendo(false);
    }
  };

  const guardar = async (data: FiesterData) => {
    try {
      await api.completeProfile({
        age: data.age,
        gender: data.gender,
        wants: data.wants,
        planTonight: data.planTonight,
        bio: data.bio,
      });
      await refreshProfile();
      toast({ title: t('completeProfile.done') });
    } catch {
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={abierto && paso !== null}>
      <DialogContent
        className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-md [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {paso === 'tipo' ? (
          <>
            <div className="bg-party-primary p-5 text-ink">
              <DialogTitle className="font-display text-headline-md">{t('completeProfile.chooseTitle')}</DialogTitle>
              <DialogDescription className="mt-1 text-body-sm text-ink/75">
                {t('completeProfile.chooseBody', { name: currentUser?.name ?? '' })}
              </DialogDescription>
            </div>
            <div className="space-y-3 p-5">
              <button
                type="button"
                disabled={eligiendo}
                onClick={() => setPaso('datos')}
                className="press flex w-full items-start gap-3 rounded-2xl border-2 border-party-primary bg-card p-4 text-left disabled:opacity-50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-party-primary text-ink">
                  <Heart size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-title-card">{t('accountKind.vyber.tab')}</span>
                  <span className="block text-body-sm text-party-gray">{t('completeProfile.chooseVyber')}</span>
                </span>
              </button>
              <button
                type="button"
                disabled={eligiendo}
                onClick={() => void entrarComoInvitado()}
                className="press flex w-full items-start gap-3 rounded-2xl border-2 border-white/10 bg-card p-4 text-left disabled:opacity-50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-high text-foreground">
                  {eligiendo ? <Loader2 size={20} className="animate-spin" /> : <Ticket size={20} />}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-title-card">{t('accountKind.guest.tab')}</span>
                  <span className="block text-body-sm text-party-gray">{t('completeProfile.chooseGuest')}</span>
                </span>
              </button>
              <p className="text-center text-caption text-party-gray">{t('completeProfile.chooseLater')}</p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-party-primary p-5 text-ink">
              <DialogTitle className="font-display text-headline-md">{t('completeProfile.title')}</DialogTitle>
              <DialogDescription className="mt-1 text-body-sm text-ink/75">{t('completeProfile.body')}</DialogDescription>
            </div>
            <div className="p-5">
              <FiesterForm onSubmit={guardar} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CompleteProfileDialog;
