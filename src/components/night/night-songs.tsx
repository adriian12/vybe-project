import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronUp, Loader2, Music, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { nightService, SongRequest, SongResult } from '@/services/night';
import { cn } from '@/lib/utils';

/**
 * «Vota la próxima canción».
 *
 * Se busca en el catálogo de Deezer (`song-search`) para que todos elijan la
 * misma ficha y los votos se sumen: escrito a mano, «despacito» y «Despacito -
 * Luis Fonsi» serían dos peticiones. Si el buscador no encuentra algo, se puede
 * pedir tal cual. La lista se ordena por votos y la ve el DJ en el panel.
 */
const NightSongs = ({ eventId }: { eventId: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [ranking, setRanking] = useState<SongRequest[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const busqueda = useRef(0);

  const load = useCallback(async () => {
    setRanking(await nightService.getSongRanking(eventId));
  }, [eventId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 20_000);
    return () => clearInterval(interval);
  }, [load]);

  // Búsqueda con un respiro: no se pregunta por cada tecla.
  useEffect(() => {
    const texto = query.trim();
    if (texto.length < 2) {
      setResults([]);
      return;
    }
    const id = ++busqueda.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await nightService.searchSongs(texto);
      if (id === busqueda.current) {
        setResults(found);
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const fail = (error: unknown) =>
    toast({
      title: t('common.error'),
      description: t(error instanceof ApiError ? error.message : 'errors.generic'),
      variant: 'destructive',
    });

  const pedir = async (song: { title: string; artist?: string | null; deezerId?: number | null; cover?: string | null }) => {
    setBusy('request');
    try {
      await nightService.requestSong(eventId, song);
      setQuery('');
      setResults([]);
      await load();
      toast({ title: t('night.songs.requested') });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const votar = async (song: SongRequest) => {
    setBusy(song.id);
    // Se ve al instante; si falla, se vuelve a leer.
    setRanking((prev) =>
      prev.map((s) => (s.id === song.id ? { ...s, myVote: !s.myVote, votes: s.votes + (s.myVote ? -1 : 1) } : s)),
    );
    try {
      await nightService.toggleSongVote(song.id);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
      void load();
    }
  };

  const pendientes = ranking.filter((s) => !s.playedAt);
  const sonadas = ranking.filter((s) => s.playedAt).slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('night.songs.search')}
          aria-label={t('night.songs.search')}
          className="pl-9"
          maxLength={80}
        />
        {searching && (
          <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {query.trim().length >= 2 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {results.map((song) => (
            <li key={song.deezerId}>
              <button
                type="button"
                disabled={busy === 'request'}
                onClick={() => void pedir(song)}
                className="press flex w-full items-center gap-3 p-2.5 text-left"
              >
                {song.cover ? (
                  <img src={song.cover} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-high">
                    <Music size={16} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{song.title}</span>
                  <span className="block truncate text-caption text-muted-foreground">{song.artist}</span>
                </span>
                <Plus size={18} className="shrink-0 text-party-primary" />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              disabled={busy === 'request'}
              onClick={() => void pedir({ title: query.trim() })}
              className="press flex w-full items-center gap-2 p-2.5 text-left text-sm text-muted-foreground"
            >
              <Plus size={16} />
              {t('night.songs.requestAsTyped', { text: query.trim() })}
            </button>
          </li>
        </ul>
      )}

      <div>
        <p className="mb-2 text-label-pill uppercase tracking-wider text-muted-foreground">{t('night.songs.queue')}</p>
        {pendientes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('night.songs.empty')}</p>
        ) : (
          <ol className="space-y-2">
            {pendientes.map((song, index) => (
              <li key={song.id} className="flex items-center gap-3 rounded-lg bg-surface-low p-2.5">
                <span className="w-5 shrink-0 text-center font-display text-title-card text-muted-foreground tabular">
                  {index + 1}
                </span>
                {song.coverUrl ? (
                  <img src={song.coverUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-high">
                    <Music size={16} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{song.title}</span>
                  {song.artist && <span className="block truncate text-caption text-muted-foreground">{song.artist}</span>}
                </span>
                <button
                  type="button"
                  disabled={busy === song.id}
                  onClick={() => void votar(song)}
                  aria-pressed={song.myVote}
                  aria-label={t('night.songs.vote')}
                  className={cn(
                    'press flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-caption font-bold tabular',
                    song.myVote ? 'bg-party-primary text-ink' : 'bg-surface-high text-foreground',
                  )}
                >
                  <ChevronUp size={18} strokeWidth={3} />
                  {song.votes}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {sonadas.length > 0 && (
        <div>
          <p className="mb-2 text-label-pill uppercase tracking-wider text-muted-foreground">{t('night.songs.played')}</p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {sonadas.map((song) => (
              <li key={song.id} className="truncate">
                {song.title}
                {song.artist ? ` · ${song.artist}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default NightSongs;
