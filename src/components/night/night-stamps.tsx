import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, Loader2, Stamp } from 'lucide-react';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { nightService, StampCard } from '@/services/night';
import { cn } from '@/lib/utils';
import TicketCode from './ticket-code';

/**
 * La tarjeta de sellos del local: un sello por cada noche que entras en un
 * evento que los da. Con la tarjeta llena, un premio que se canjea en la barra.
 */
const NightStamps = ({
  eventId,
  card,
  onChange,
}: {
  eventId: string;
  card: StampCard;
  onChange: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const canjear = async () => {
    setBusy(true);
    try {
      setCode(await nightService.claimStampReward(eventId));
      onChange();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const llenos = Math.min(card.stamps, card.required);

  return (
    <div className="rounded-2xl bg-party-primary p-4 text-ink">
      <p className="flex items-center gap-2 text-label-pill uppercase tracking-wider">
        <Stamp size={15} />
        {t('night.stamps.title', { venue: card.venueName })}
      </p>
      <p className="mt-1 font-display text-headline-md">{t('night.stamps.progress', { stamps: llenos, total: card.required })}</p>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {Array.from({ length: card.required }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'flex aspect-square items-center justify-center rounded-full border-2 border-ink/80',
              i < llenos ? 'bg-ink text-party-primary' : 'bg-transparent',
            )}
            aria-hidden
          >
            {i < llenos && <Stamp size={16} />}
          </span>
        ))}
      </div>

      <p className="mt-3 flex items-start gap-2 text-body-sm font-semibold">
        <Gift size={16} className="mt-0.5 shrink-0" />
        <span>
          {card.rewardTitle}
          {card.rewardDescription && <span className="font-normal"> · {card.rewardDescription}</span>}
        </span>
      </p>

      {!card.eventCounts && <p className="mt-2 text-caption">{t('night.stamps.notThisEvent')}</p>}

      {code ? (
        <div className="mt-3 rounded-xl bg-white/90">
          <TicketCode code={code} />
        </div>
      ) : card.canClaim ? (
        <PartyButton
          size="sm"
          className="mt-3 w-full gap-1.5 bg-ink text-party-primary hover:bg-ink/90"
          disabled={busy}
          onClick={() => void canjear()}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
          {t('night.stamps.claim')}
        </PartyButton>
      ) : (
        <p className="mt-3 text-caption">
          {t('night.stamps.missing', { count: Math.max(card.required - card.stamps, 0) })}
        </p>
      )}
    </div>
  );
};

export default NightStamps;
