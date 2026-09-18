import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Stamp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { nightService, VenueStampCard as Card } from '@/services/night';

/**
 * La tarjeta de sellos del local, opcional. Cada noche que alguien entra en un
 * evento que da sellos suma uno; con la tarjeta llena, el premio. Aquí se
 * enciende para todo el local y, abajo, se elige si este evento da sello.
 */
const VenueStampCard = ({
  eventId,
  eventStamps,
  onEventChange,
}: {
  eventId: string;
  eventStamps: boolean;
  onEventChange: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [card, setCard] = useState<Card | null>(null);
  const [required, setRequired] = useState('5');
  const [reward, setReward] = useState('');
  const [rewardDescription, setRewardDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const actual = await nightService.getVenueStampCard();
    setCard(actual);
    if (actual) {
      setRequired(String(actual.required));
      setReward(actual.rewardTitle);
      setRewardDescription(actual.rewardDescription ?? '');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const guardar = async (enabled: boolean) => {
    const n = Number(required);
    if (!Number.isInteger(n) || n < 2 || n > 20 || reward.trim().length < 2) {
      toast({ title: t('venue.stamps.invalid'), variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await nightService.setVenueStampCard({
        enabled,
        required: n,
        rewardTitle: reward.trim(),
        rewardDescription: rewardDescription.trim() || undefined,
      });
      await load();
      toast({ title: t(enabled ? 'venue.stamps.saved' : 'venue.stamps.disabled') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const cambiarEvento = async (value: boolean) => {
    setBusy(true);
    try {
      await nightService.setEventStamps(eventId, value);
      onEventChange();
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!card) {
    return (
      <div className="surface-light flex justify-center rounded-2xl p-6">
        <Loader2 className="h-5 w-5 animate-spin text-party-primary" />
      </div>
    );
  }

  return (
    <div className="surface-light rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
            <Stamp size={17} className="text-party-primary" />
            {t('venue.stamps.title')}
          </h3>
          <p className="text-caption text-party-gray">{t('venue.stamps.subtitle')}</p>
        </div>
        <Switch checked={card.enabled} disabled={busy} onCheckedChange={(v) => void guardar(v)} aria-label={t('venue.stamps.title')} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="stamps-required" className="text-caption">
            {t('venue.stamps.required')}
          </Label>
          <Input
            id="stamps-required"
            type="number"
            min={2}
            max={20}
            value={required}
            onChange={(e) => setRequired(e.target.value)}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="stamps-reward" className="text-caption">
            {t('venue.stamps.reward')}
          </Label>
          <Input
            id="stamps-reward"
            value={reward}
            maxLength={60}
            onChange={(e) => setReward(e.target.value)}
            placeholder={t('venue.stamps.rewardPlaceholder')}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="stamps-desc" className="text-caption">
            {t('venue.stamps.rewardDetails')}
          </Label>
          <Input
            id="stamps-desc"
            value={rewardDescription}
            maxLength={200}
            onChange={(e) => setRewardDescription(e.target.value)}
            placeholder={t('venue.stamps.rewardDetailsPlaceholder')}
            className="h-10"
          />
        </div>
      </div>

      <PartyButton size="sm" className="mt-3 w-full" disabled={busy} onClick={() => void guardar(true)}>
        {card.enabled ? t('common.save') : t('venue.stamps.enable')}
      </PartyButton>

      {card.enabled && (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-3">
            <div>
              <p className="text-body-sm font-bold">{t('venue.stamps.thisEvent')}</p>
              <p className="text-caption text-party-gray">{t('venue.stamps.thisEventHelp')}</p>
            </div>
            <Switch checked={eventStamps} disabled={busy} onCheckedChange={(v) => void cambiarEvento(v)} aria-label={t('venue.stamps.thisEvent')} />
          </div>
          <p className="mt-3 text-caption text-party-gray">
            {t('venue.stamps.stats', { collectors: card.collectors, completed: card.completed })}
          </p>
        </>
      )}
    </div>
  );
};

export default VenueStampCard;
