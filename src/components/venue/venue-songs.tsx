import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Music, Music2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { nightService, SongRequest } from '@/services/night';

/**
 * Para el DJ: las canciones que pide la sala, por votos. Al marcar una como
 * puesta sale de la lista y pasa a «suena ahora» en el termómetro de la app.
 * El interruptor abre o cierra las peticiones de este evento.
 */
const VenueSongs = ({
  eventId,
  enabled,
  onToggle,
}: {
  eventId: string;
  enabled: boolean;
  onToggle: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [songs, setSongs] = useState<SongRequest[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setSongs(await nightService.getSongRanking(eventId));
  }, [eventId]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const interval = setInterval(() => void load(), 15_000);
    return () => clearInterval(interval);
  }, [enabled, load]);

  const cambiar = async (value: boolean) => {
    setBusy(true);
    try {
      await nightService.setEventSongs(eventId, value);
      onToggle();
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const puesta = async (id: string) => {
    setBusy(true);
    try {
      await nightService.markSongPlayed(id);
      await load();
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const pendientes = songs.filter((s) => !s.playedAt);

  return (
    <div className="surface-light rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
            <Music2 size={17} className="text-party-primary" />
            {t('venue.songs.title')}
          </h3>
          <p className="text-caption text-party-gray">{t('venue.songs.subtitle')}</p>
        </div>
        <Switch checked={enabled} disabled={busy} onCheckedChange={(v) => void cambiar(v)} aria-label={t('venue.songs.title')} />
      </div>

      {enabled &&
        (pendientes.length === 0 ? (
          <p className="mt-3 text-body-sm text-party-gray">{t('venue.songs.empty')}</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {pendientes.slice(0, 15).map((song, index) => (
              <li key={song.id} className="flex items-center gap-2.5 rounded-xl bg-black/[0.03] p-2">
                <span className="w-5 shrink-0 text-center font-display text-title-card text-party-gray tabular">
                  {index + 1}
                </span>
                {song.coverUrl ? (
                  <img src={song.coverUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-black/10">
                    <Music size={15} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-bold">{song.title}</span>
                  <span className="block truncate text-caption text-party-gray">
                    {song.artist ? `${song.artist} · ` : ''}
                    {t('venue.songs.votes', { count: song.votes })}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void puesta(song.id)}
                  className="press flex h-8 shrink-0 items-center gap-1 rounded-lg bg-party-primary px-2.5 text-caption font-bold text-ink"
                >
                  <Check size={13} />
                  {t('venue.songs.played')}
                </button>
              </li>
            ))}
          </ol>
        ))}
    </div>
  );
};

export default VenueSongs;
