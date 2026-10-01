import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { nightService } from '@/services/night';

const clave = (venueId: string) => `vybe_followAsked_${venueId}`;

/**
 * «¿Quieres que {local} te avise de sus fiestas?», un rato después de entrar.
 *
 * Es cuando más sentido tiene: estás dentro y te lo estás pasando bien. Se
 * pregunta una sola vez por local y sólo si aún no lo sigues. Seguir es lo que
 * le da al local su propio público.
 */
const FollowVenuePrompt = ({ venueId, venueName }: { venueId: string; venueName: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let yaPreguntado = false;
    try {
      yaPreguntado = window.localStorage.getItem(clave(venueId)) === '1';
    } catch {
      // Sin almacenamiento se pregunta como si fuera la primera vez.
    }
    if (yaPreguntado) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const perfil = await nightService.getVenueProfile(venueId);
      if (cancelled || !perfil || perfil.iFollow) return;
      try {
        window.localStorage.setItem(clave(venueId), '1');
      } catch {
        // Igual que arriba.
      }
      setOpen(true);
    }, 20_000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [venueId]);

  const seguir = async () => {
    setBusy(true);
    try {
      await nightService.toggleFollow(venueId);
      toast({ title: t('venuePage.followed', { name: venueName }), description: t('venuePage.followedBody') });
      setOpen(false);
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader className="text-left">
          <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-party-primary text-ink">
            <Bell size={24} />
          </span>
          <DialogTitle className="font-display text-headline-md">{t('venuePage.promptTitle', { name: venueName })}</DialogTitle>
          <DialogDescription>{t('venuePage.promptBody')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <PartyButton className="w-full gap-2" disabled={busy} onClick={() => void seguir()}>
            <Bell size={16} />
            {t('venuePage.follow')}
          </PartyButton>
          <button type="button" onClick={() => setOpen(false)} className="press h-10 text-body-sm text-party-gray">
            {t('whereNext.notNow')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FollowVenuePrompt;
