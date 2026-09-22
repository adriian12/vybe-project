import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, PartyPopper, Trophy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const [enseñar, setEnseñar] = useState<Raffle | null>(null);
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
            {ganado && (
              <button
                type="button"
                onClick={() => setEnseñar(raffle)}
                className="press mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-party-primary font-display text-title-card text-ink"
              >
                <Trophy size={17} />
                {t('night.raffles.showAtBar')}
              </button>
            )}
            {ganado && raffle.ticketCode && <TicketCode code={raffle.ticketCode} />}
          </li>
        );
      })}

      {/* Lo que se enseña en la barra: premio, nombre y el código del ganador,
          que el local comprueba en su panel. */}
      <Dialog open={enseñar !== null} onOpenChange={(open) => !open && setEnseñar(null)}>
        <DialogContent className="border-0 bg-party-primary text-ink">
          {enseñar && (
            <div className="flex flex-col items-center py-4 text-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ink text-party-primary">
                <Trophy size={32} />
              </span>
              <DialogHeader className="items-center text-center">
                <DialogTitle className="font-display text-headline-lg text-ink">
                  {t('night.raffles.winnerTitle')}
                </DialogTitle>
                <DialogDescription className="text-body-md font-bold text-ink/80">«{enseñar.prize}»</DialogDescription>
              </DialogHeader>
              {enseñar.winnerName && <p className="mt-3 font-display text-headline-md">{enseñar.winnerName}</p>}
              {enseñar.winnerCode && (
                <p className="mt-4 rounded-2xl bg-ink px-6 py-3 font-display text-headline-xl tracking-widest text-party-primary tabular">
                  {enseñar.winnerCode}
                </p>
              )}
              <p className="mt-4 text-body-sm text-ink/70">{t('night.raffles.showHint')}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ul>
  );
};

export default NightRaffles;
