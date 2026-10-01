import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Trophy } from 'lucide-react';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { Challenge, nightService } from '@/services/night';
import { cn } from '@/lib/utils';
import TicketCode from './ticket-code';

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Retos de la noche: lo que hay que hacer, cuánto falta y, al cumplirlo, el
 * vale. La comprobación la hace el servidor (`challenge_progress`): la app sólo
 * enseña el progreso que devuelve.
 */
const NightChallenges = ({ challenges, onChange }: { challenges: Challenge[]; onChange: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const recoger = async (challenge: Challenge) => {
    setBusy(challenge.promotionId);
    try {
      const code = await nightService.claimChallenge(challenge.promotionId);
      toast({ title: challenge.title, description: t('offers.claimedWithCode', { code }) });
      onChange();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  if (challenges.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t('night.challenges.empty')}</p>;
  }

  return (
    <ul className="space-y-3">
      {challenges.map((challenge) => {
        const porcentaje = Math.round((Math.min(challenge.progress, challenge.target) / challenge.target) * 100);
        return (
          <li key={challenge.promotionId} className="rounded-lg border border-border p-3">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  challenge.done ? 'bg-party-primary text-ink' : 'bg-surface-high text-party-primary',
                )}
              >
                {challenge.done ? <Check size={18} /> : <Trophy size={17} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{challenge.title}</p>
                <p className="text-sm text-muted-foreground">
                  {challenge.description ??
                    t(`night.challenges.hints.${challenge.type}`, {
                      count: challenge.target,
                      time: hora(challenge.deadline),
                    })}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-party-primary transition-[width] duration-500"
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
              <span className="text-caption font-bold tabular">
                {Math.min(challenge.progress, challenge.target)}/{challenge.target}
              </span>
            </div>

            {challenge.ticketCode ? (
              <TicketCode code={challenge.ticketCode} used={challenge.validated} />
            ) : challenge.done ? (
              <PartyButton
                size="sm"
                className="mt-3 w-full gap-1.5"
                disabled={busy === challenge.promotionId}
                onClick={() => void recoger(challenge)}
              >
                {busy === challenge.promotionId ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />}
                {t('night.challenges.claim')}
              </PartyButton>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};

export default NightChallenges;
