import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, EyeOff, Loader2, Repeat2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { EventActionButton } from '@/components/ui-custom/event-action-button';
import { api } from '@/services/api';
import { useAppContext } from '@/context/app-context';

export type EventMode = 'vyber' | 'guest';

/**
 * Cómo se entra a una fiesta.
 *
 * `vyber`: foto del momento, sales en el tablón y deslizas.
 * `guest`: sin foto, ves las ofertas y los avisos del local, pero ni ves el
 * tablón ni apareces en él. No todo el mundo quiere salir en una lista por
 * tomarse algo.
 */
const Explicacion = ({ mode }: { mode: EventMode }) => {
  const { t } = useTranslation();
  const Icono = mode === 'vyber' ? Camera : EyeOff;

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-low p-3 text-left">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-party-primary text-ink">
        <Icono size={19} />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-title-card">{t(`eventMode.${mode}.title`)}</span>
        <span className="block text-body-sm text-party-gray">{t(`eventMode.${mode}.body`)}</span>
      </span>
    </div>
  );
};

/**
 * Sin uso desde que el tipo de cuenta decide cómo se entra; se conserva por si
 * hiciera falta preguntar en alguna fiesta concreta.
 */
export const EventModeChooser = ({
  eventName,
  onChoose,
}: {
  eventName: string;
  onChoose: (mode: EventMode) => Promise<void> | void;
}) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<EventMode | null>(null);

  const elegir = async (mode: EventMode) => {
    setBusy(mode);
    try {
      await onChoose(mode);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open>
      <DialogContent className="[&>button]:hidden">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-headline-md">
            {t('eventMode.chooseTitle', { name: eventName })}
          </DialogTitle>
          <DialogDescription>{t('eventMode.chooseBody')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Explicacion mode="vyber" />
          <Explicacion mode="guest" />
        </div>

        <div className="grid gap-2">
          <PartyButton className="w-full gap-2" disabled={busy !== null} onClick={() => void elegir('vyber')}>
            {busy === 'vyber' ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {t('eventMode.enterAsVyber')}
          </PartyButton>
          <PartyButton
            variant="outline"
            className="w-full gap-2"
            disabled={busy !== null}
            onClick={() => void elegir('guest')}
          >
            {busy === 'guest' ? <Loader2 size={16} className="animate-spin" /> : <EyeOff size={16} />}
            {t('eventMode.enterAsGuest')}
          </PartyButton>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Botón de cambio de modo, con su confirmación: enseña el modo al que se
 * cambiaría y lo que pasa al hacerlo.
 */
export const EventModeSwitch = ({ mode }: { mode: EventMode }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeEvent, refreshActiveEvent, loadProfiles } = useAppContext();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const otro: EventMode = mode === 'vyber' ? 'guest' : 'vyber';

  const cambiar = async () => {
    if (!activeEvent) return;
    setBusy(true);
    try {
      await api.setEventMode(activeEvent.eventId, otro, activeEvent.photoUrl);
      await refreshActiveEvent();
      if (otro === 'vyber') await loadProfiles();
      setOpen(false);
      toast({ title: t(`eventMode.switched.${otro}`) });
    } catch {
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <EventActionButton icon={Repeat2} label={t(`eventMode.${mode}.short`)} onClick={() => setOpen(true)} />

      <Dialog open={open} onOpenChange={(value) => !busy && setOpen(value)}>
        <DialogContent>
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-headline-md">
              {t('eventMode.switchTitle', { mode: t(`eventMode.${otro}.title`) })}
            </DialogTitle>
            <DialogDescription>{t(`eventMode.switchBody.${otro}`)}</DialogDescription>
          </DialogHeader>

          <Explicacion mode={otro} />

          <div className="grid gap-2">
            <PartyButton className="w-full" disabled={busy} onClick={() => void cambiar()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : t('eventMode.switchConfirm')}
            </PartyButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="press h-10 text-body-sm text-party-gray"
            >
              {t('common.cancel')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
