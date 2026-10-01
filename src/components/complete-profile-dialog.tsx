import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Minus, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
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

/**
 * La ficha de fiester@ (migración 075): al entrar por primera vez con una
 * cuenta de fiester@ se pide la edad, si es hombre o mujer, a quién quiere
 * ver, el plan de esta noche (botones rápidos o texto) y una bio opcional.
 * No se puede cerrar sin rellenarla: sin esos datos el tablón no funciona.
 */
const CompleteProfileDialog = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentUser, userType, refreshProfile } = useAppContext();

  const [edad, setEdad] = useState(18);
  const [genero, setGenero] = useState<'woman' | 'man' | null>(null);
  const [quiere, setQuiere] = useState<'women' | 'men' | 'all' | null>(null);
  const [plan, setPlan] = useState<string>('');
  const [otroPlan, setOtroPlan] = useState('');
  const [bio, setBio] = useState('');
  const [enviando, setEnviando] = useState(false);

  const abierto =
    userType === 'user' &&
    Boolean(currentUser) &&
    currentUser?.role !== 'admin' &&
    !currentUser?.staffOnly &&
    currentUser?.accountType === 'vyber' &&
    currentUser?.profileCompleted === false;

  const planFinal = otroPlan.trim() || (plan ? t(`completeProfile.plans.${plan}`) : '');
  const listo = edad >= 18 && edad <= 99 && genero !== null && quiere !== null;

  const guardar = async () => {
    if (!listo || !genero || !quiere) return;
    setEnviando(true);
    try {
      await api.completeProfile({ age: edad, gender: genero, wants: quiere, planTonight: planFinal, bio: bio.trim() });
      await refreshProfile();
      toast({ title: t('completeProfile.done') });
    } catch {
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={abierto}>
      <DialogContent
        className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-md [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="bg-party-primary p-5 text-ink">
          <DialogTitle className="font-display text-headline-md">{t('completeProfile.title')}</DialogTitle>
          <DialogDescription className="mt-1 text-body-sm text-ink/75">{t('completeProfile.body')}</DialogDescription>
        </div>

        <div className="space-y-5 p-5">
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
            {t('completeProfile.save')}
          </PartyButton>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CompleteProfileDialog;
