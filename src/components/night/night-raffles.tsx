import { useTranslation } from 'react-i18next';
import { Gift, PartyPopper } from 'lucide-react';
import { Raffle } from '@/services/night';
import { cn } from '@/lib/utils';
import TicketCode from './ticket-code';

const hora = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Sorteos de la noche. Participa todo el que sigue dentro a la hora del
 * sorteo, sin apuntarse: por eso lo que se enseña es la hora, que es lo que
 * hace que la gente llegue antes y no se vaya.
 */
const NightRaffles = ({ raffles }: { raffles: Raffle[] }) => {
  const { t } = useTranslation();
  const visibles = raffles.filter((r) => r.status === 'scheduled' || r.status === 'drawn');

  if (visibles.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t('night.raffles.empty')}</p>;
  }

  return (
    <ul className="space-y-3">
      {visibles.map((raffle) => {
        const ganado = raffle.status === 'drawn' && raffle.isMe;
        return (
          <li
            key={raffle.id}
            className={cn('rounded-lg border p-3', ganado ? 'border-party-primary bg-party-primary/10' : 'border-border')}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-high text-party-primary">
                {ganado ? <PartyPopper size={18} /> : <Gift size={17} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{raffle.prize}</p>
                {raffle.description && <p className="text-sm text-muted-foreground">{raffle.description}</p>}
                <p className="mt-1 text-sm font-bold text-party-primary">
                  {raffle.status === 'scheduled'
                    ? raffle.drawAt
                      ? t('night.raffles.at', { time: hora(raffle.drawAt) })
                      : t('night.raffles.live')
                    : ganado
                      ? t('night.raffles.youWon')
                      : t('night.raffles.wonBy', { name: raffle.winnerName ?? '—' })}
                </p>
                {raffle.status === 'scheduled' && (
                  <p className="text-caption text-muted-foreground">{t('night.raffles.stayInside')}</p>
                )}
              </div>
            </div>
            {ganado && raffle.ticketCode && <TicketCode code={raffle.ticketCode} />}
          </li>
        );
      })}
    </ul>
  );
};

export default NightRaffles;
