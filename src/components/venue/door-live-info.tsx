import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hourglass, Music2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { nightService, QueueLevel } from '@/services/night';
import { cn } from '@/lib/utils';
import InfoHelp from '@/components/venue/info-help';

const COLAS: QueueLevel[] = ['none', 'short', 'long'];

/**
 * Lo que la puerta cuenta al termómetro de la app: la cola y lo que suena.
 * Caduca solo (la cola a los 45 minutos, la canción a la media hora), así que
 * un dato olvidado no engaña a nadie.
 */
const DoorLiveInfo = ({
  eventId,
  queue,
  nowPlaying,
  onChange,
}: {
  eventId: string;
  queue: QueueLevel | null;
  nowPlaying: string | null;
  onChange: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [cancion, setCancion] = useState('');

  const guardar = async (info: { queue?: QueueLevel; nowPlaying?: string }) => {
    setBusy(true);
    try {
      await nightService.setLiveInfo(eventId, info);
      onChange();
      if (info.nowPlaying !== undefined) setCancion('');
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface-light rounded-2xl p-4">
      <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
        {t('venue.liveInfo.title')}
        <InfoHelp topic="thermometer" />
      </h3>
      <p className="mb-3 text-caption text-party-gray">{t('venue.liveInfo.subtitle')}</p>

      <p className="mb-1.5 flex items-center gap-1.5 text-caption font-bold uppercase text-party-gray">
        <Hourglass size={13} />
        {t('venue.liveInfo.queue')}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {COLAS.map((nivel) => (
          <button
            key={nivel}
            type="button"
            disabled={busy}
            onClick={() => void guardar({ queue: nivel })}
            aria-pressed={queue === nivel}
            className={cn(
              'press h-10 rounded-xl text-caption font-bold',
              queue === nivel ? 'bg-party-primary text-ink' : 'bg-black/[0.06]',
            )}
          >
            {t(`thermometer.queue.${nivel}`)}
          </button>
        ))}
      </div>

      <p className="mb-1.5 mt-4 flex items-center gap-1.5 text-caption font-bold uppercase text-party-gray">
        <Music2 size={13} />
        {t('venue.liveInfo.nowPlaying')}
      </p>
      {nowPlaying && <p className="mb-2 truncate text-body-sm font-semibold">{nowPlaying}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (cancion.trim()) void guardar({ nowPlaying: cancion.trim() });
        }}
      >
        <Input
          value={cancion}
          maxLength={80}
          onChange={(e) => setCancion(e.target.value)}
          placeholder={t('venue.liveInfo.nowPlayingPlaceholder')}
          aria-label={t('venue.liveInfo.nowPlaying')}
          className="h-10"
        />
        <PartyButton type="submit" size="sm" className="h-10 shrink-0" disabled={busy || !cancion.trim()}>
          {t('common.save')}
        </PartyButton>
      </form>
    </div>
  );
};

export default DoorLiveInfo;
