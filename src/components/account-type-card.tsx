import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Heart, Info, Loader2, Repeat2, Ticket } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import AccountKindInfo, { AccountKind } from '@/components/account-kind-info';
import { api, AccountTypeStatus, ApiError } from '@/services/api';
import { useAppContext } from '@/context/app-context';
import { cn } from '@/lib/utils';

/**
 * El tipo de cuenta en el perfil: Vyber o invitado, y el cambio de uno a otro.
 *
 * Pasar a invitado se puede siempre: es lo que protege a quien no quiere salir
 * en ningún tablón. Volver a Vyber está limitado (una vez al mes, tres con
 * Premium) para que nadie entre y salga sólo para mirar, y hace falta rellenar
 * lo que el registro de invitado no pide.
 */
const AccountTypeCard = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentUser, refreshProfile } = useAppContext();

  const [estado, setEstado] = useState<AccountTypeStatus | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [info, setInfo] = useState<AccountKind | null>(null);
  const [gender, setGender] = useState<'man' | 'woman' | null>(null);
  const [wants, setWants] = useState<'men' | 'women' | 'all'>('all');
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => setEstado(await api.getAccountTypeStatus()), []);

  useEffect(() => {
    void cargar();
  }, [cargar, currentUser?.accountType]);

  if (!estado) return null;

  const actual: AccountKind = comoTipo(estado.accountType);
  const otro: AccountKind = actual === 'vyber' ? 'guest' : 'vyber';
  const fecha = estado.nextAllowedAt ? new Date(estado.nextAllowedAt).toLocaleDateString() : null;
  const bloqueado = otro === 'vyber' && estado.changesUsed >= estado.maxChanges;

  const cambiar = async () => {
    setBusy(true);
    try {
      if (otro === 'vyber' && estado.needsProfile) {
        if (!gender) {
          toast({ title: t('auth.errors.genderRequired'), variant: 'destructive' });
          return;
        }
        await api.setMyGender(gender);
        await api.updateProfile({ wants });
      }

      await api.setAccountType(otro);
      await refreshProfile();
      await cargar();
      setAbierto(false);
      toast({ title: t(`accountKind.${otro}.switched`) });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : '';
      toast({
        title: t('common.error'),
        description:
          code === 'SWITCH_LIMIT'
            ? t('accountKind.limitReached', { date: fecha ?? '' })
            : t('errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const Icono = actual === 'guest' ? Ticket : Heart;

  return (
    <section className="space-y-3 rounded-2xl bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-party-primary text-ink">
          <Icono size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-title-card">{t(`accountKind.${actual}.tab`)}</p>
          <p className="text-body-sm text-party-gray">{t(`accountKind.${actual}.short`)}</p>
        </div>
        <button
          type="button"
          onClick={() => setInfo(actual)}
          aria-label={t(`accountKind.${actual}.infoCta`)}
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-high"
        >
          <Info size={17} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={cn(
          'press flex h-11 w-full items-center justify-center gap-2 rounded-xl text-body-sm font-bold',
          bloqueado ? 'bg-surface-high text-party-gray' : 'bg-surface-high text-foreground',
        )}
      >
        <Repeat2 size={16} />
        {t('accountKind.switchTo', { kind: t(`accountKind.${otro}.tab`) })}
      </button>

      {otro === 'vyber' && (
        <p className="text-caption text-party-gray">
          {bloqueado && fecha
            ? t('accountKind.limitReached', { date: fecha })
            : t('accountKind.changesLeft', { count: Math.max(estado.maxChanges - estado.changesUsed, 0) })}
        </p>
      )}

      <Dialog open={abierto} onOpenChange={(value) => !busy && setAbierto(value)}>
        <DialogContent>
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-headline-md">
              {t('accountKind.switchTitle', { kind: t(`accountKind.${otro}.tab`) })}
            </DialogTitle>
            <DialogDescription>{t(`accountKind.${otro}.switchBody`)}</DialogDescription>
          </DialogHeader>

          {otro === 'guest' && (
            <div className="flex items-start gap-2 rounded-2xl bg-party-accent/15 p-3 text-body-sm">
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-party-accent" />
              <span>{t('accountKind.guestWarning')}</span>
            </div>
          )}

          {otro === 'vyber' && bloqueado && fecha && (
            <div className="flex items-start gap-2 rounded-2xl bg-party-accent/15 p-3 text-body-sm">
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-party-accent" />
              <span>{t('accountKind.limitReached', { date: fecha })}</span>
            </div>
          )}

          {/* Al registrarse como invitado no se pidieron: se piden ahora. */}
          {otro === 'vyber' && !bloqueado && estado.needsProfile && (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-body-sm font-bold">{t('auth.gender')}</p>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-low p-1">
                  {(['woman', 'man'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setGender(option)}
                      aria-pressed={gender === option}
                      className={cn(
                        'press h-10 rounded-lg text-body-sm font-bold',
                        gender === option ? 'bg-party-primary text-ink' : 'text-party-gray',
                      )}
                    >
                      {t(`auth.genders.${option}`)}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-caption text-party-gray">{t('auth.genderHelp')}</p>
              </div>

              <div>
                <p className="mb-1 text-body-sm font-bold">{t('auth.wants')}</p>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-low p-1">
                  {(['women', 'men', 'all'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setWants(option)}
                      aria-pressed={wants === option}
                      className={cn(
                        'press h-10 rounded-lg text-body-sm font-bold',
                        wants === option ? 'bg-party-primary text-ink' : 'text-party-gray',
                      )}
                    >
                      {t(`auth.wantsOptions.${option}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <PartyButton
              className="w-full"
              disabled={busy || (otro === 'vyber' && bloqueado)}
              onClick={() => void cambiar()}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : t('accountKind.switchConfirm')}
            </PartyButton>
            <button type="button" onClick={() => setAbierto(false)} className="press h-10 text-body-sm text-party-gray">
              {t('common.cancel')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AccountKindInfo kind={info} onClose={() => setInfo(null)} />
    </section>
  );
};

/** El tipo que guarda la base de datos, ya saneado. */
const comoTipo = (valor: string): AccountKind => (valor === 'guest' ? 'guest' : 'vyber');

export default AccountTypeCard;
