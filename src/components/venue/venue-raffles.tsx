import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, Loader2, Lock, LockOpen, PartyPopper, Plus, RotateCcw, Shuffle, Users, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { nightService, Raffle } from '@/services/night';
import { cn } from '@/lib/utils';

const hora = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** «02:30» → la fecha del evento a esa hora (de madrugada, el día siguiente). */
const horaDelEvento = (valor: string, startDate: string): string | null => {
  const [h, m] = valor.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  const inicio = new Date(startDate);
  const fecha = new Date(inicio);
  fecha.setHours(h, m, 0, 0);
  if (fecha.getTime() < inicio.getTime() - 6 * 3_600_000) fecha.setDate(fecha.getDate() + 1);
  return fecha.toISOString();
};

/**
 * Sorteos en directo. Se anuncian a quien está dentro («a las 2:00, para
 * participar sigue dentro») y a la hora se sortea solo, entre quien sigue en la
 * sala. También se puede sortear en el momento. El premio le llega a quien gana
 * como un vale que se valida en barra, igual que cualquier otro.
 */
const VenueRaffles = ({ event }: { event: { id: string; startDate: string; endDate: string } }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [creando, setCreando] = useState(false);
  const [prize, setPrize] = useState('');
  const [description, setDescription] = useState('');
  const [at, setAt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRaffles(await nightService.getRaffles(event.id));
  }, [event.id]);

  useEffect(() => {
    void load();
    // Mientras hay un sorteo abierto, el número de participantes cambia solo.
    const interval = setInterval(() => void load(), 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const fail = (error: unknown) =>
    toast({
      title: t('common.error'),
      description: t(error instanceof ApiError ? error.message : 'errors.generic'),
      variant: 'destructive',
    });

  const crear = async () => {
    if (prize.trim().length < 2) return;
    setBusy(true);
    try {
      await nightService.createRaffle(
        event.id,
        prize.trim(),
        description.trim() || undefined,
        at ? horaDelEvento(at, event.startDate) ?? undefined : undefined,
      );
      setPrize('');
      setDescription('');
      setAt('');
      setCreando(false);
      await load();
      toast({ title: t('venue.raffles.created') });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const sortear = async (raffle: Raffle) => {
    setBusy(true);
    try {
      const ganador = await nightService.drawRaffle(raffle.id);
      await load();
      toast({
        title: ganador ? t('venue.raffles.winner', { name: ganador }) : t('venue.raffles.nobody'),
        description: raffle.prize,
      });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const cancelar = async (raffle: Raffle) => {
    setBusy(true);
    try {
      await nightService.cancelRaffle(raffle.id);
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  /** Cierra o reabre la lista de participantes. */
  const cambiarEntradas = async (raffle: Raffle, cerrar: boolean) => {
    setBusy(true);
    try {
      await nightService.setRaffleEntries(raffle.id, cerrar);
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  /** Deshace el sorteo para repetirlo. */
  const reiniciar = async (raffle: Raffle) => {
    setBusy(true);
    try {
      await nightService.resetRaffle(raffle.id);
      await load();
      toast({ title: t('venue.raffles.reset') });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface-light rounded-2xl p-4">
      <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
        <Gift size={17} className="text-party-primary" />
        {t('venue.raffles.title')}
      </h3>
      <p className="mb-3 text-caption text-party-gray">{t('venue.raffles.subtitle')}</p>

      {raffles.length > 0 && (
        <ul className="mb-3 space-y-2">
          {raffles.map((raffle) => (
            <li key={raffle.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/[0.03] p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-party-primary text-ink">
                {raffle.status === 'drawn' ? <PartyPopper size={16} /> : <Gift size={16} />}
              </span>
              <div className="min-w-[8rem] flex-1">
                <p className="truncate text-body-sm font-bold">{raffle.prize}</p>
                <p className="truncate text-caption text-party-gray">
                  {raffle.status === 'drawn'
                    ? t('venue.raffles.wonByCode', { name: raffle.winnerName ?? '—', code: raffle.winnerCode ?? '—' })
                    : raffle.status === 'cancelled'
                      ? t('venue.raffles.cancelled')
                      : raffle.status === 'no_participants'
                        ? t('venue.raffles.nobody')
                        : raffle.drawAt
                          ? t('venue.raffles.at', { time: hora(raffle.drawAt) })
                          : t('venue.raffles.manual')}
                </p>
              </div>
              {raffle.status === 'scheduled' && (
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {/* Cuánta gente participa: sube mientras entra gente, y se
                      queda fija en cuanto se cierra la lista. */}
                  <span
                    className={cn(
                      'flex h-8 items-center gap-1 rounded-lg px-2 text-caption font-bold',
                      raffle.entriesClosedAt ? 'bg-destructive/12 text-destructive' : 'bg-black/[0.06] text-ink/70',
                    )}
                    title={
                      raffle.entriesClosedAt
                        ? t('venue.raffles.entriesClosedAt', { time: hora(raffle.entriesClosedAt) })
                        : t('venue.raffles.entriesOpen')
                    }
                  >
                    <Users size={13} />
                    {raffle.participants ?? 0}
                  </span>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cambiarEntradas(raffle, !raffle.entriesClosedAt)}
                    className={cn(
                      'press flex h-8 items-center gap-1 rounded-lg px-2.5 text-caption font-bold',
                      raffle.entriesClosedAt ? 'bg-black/[0.06] text-ink/70' : 'bg-destructive text-white',
                    )}
                  >
                    {raffle.entriesClosedAt ? <LockOpen size={13} /> : <Lock size={13} />}
                    {t(raffle.entriesClosedAt ? 'venue.raffles.reopenEntries' : 'venue.raffles.closeEntries')}
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void sortear(raffle)}
                    className="press flex h-8 items-center gap-1 rounded-lg bg-party-primary px-2.5 text-caption font-bold text-ink"
                  >
                    <Shuffle size={13} />
                    {t('venue.raffles.drawNow')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancelar(raffle)}
                    aria-label={t('common.cancel')}
                    className="press flex h-8 w-8 items-center justify-center rounded-lg text-party-gray"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {(raffle.status === 'drawn' || raffle.status === 'no_participants') && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reiniciar(raffle)}
                  className="press flex h-8 shrink-0 items-center gap-1 rounded-lg bg-black/[0.06] px-2.5 text-caption font-bold text-ink/70"
                >
                  <RotateCcw size={13} />
                  {t('venue.raffles.resetCta')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {creando ? (
        <div className="space-y-2 rounded-xl bg-black/[0.03] p-3">
          <div className="space-y-1.5">
            <Label htmlFor="raffle-prize" className="text-caption">
              {t('venue.raffles.prize')}
            </Label>
            <Input
              id="raffle-prize"
              value={prize}
              maxLength={80}
              onChange={(e) => setPrize(e.target.value)}
              placeholder={t('venue.raffles.prizePlaceholder')}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="raffle-desc" className="text-caption">
              {t('venue.raffles.details')}
            </Label>
            <Input
              id="raffle-desc"
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('venue.raffles.detailsPlaceholder')}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="raffle-at" className="text-caption">
              {t('venue.raffles.time')}
            </Label>
            <Input id="raffle-at" type="time" value={at} onChange={(e) => setAt(e.target.value)} className="h-10" />
            <p className="text-caption text-party-gray">{t('venue.raffles.timeHelp')}</p>
          </div>
          <div className="flex gap-2 pt-1">
            <PartyButton variant="outline" size="sm" className="border-black/15 text-ink" onClick={() => setCreando(false)}>
              {t('common.cancel')}
            </PartyButton>
            <PartyButton size="sm" className="flex-1 gap-1.5" disabled={busy || prize.trim().length < 2} onClick={() => void crear()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {t('venue.raffles.create')}
            </PartyButton>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="press flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/15 text-body-sm font-bold hover:bg-black/[0.03]"
        >
          <Plus size={16} />
          {t('venue.raffles.new')}
        </button>
      )}
    </div>
  );
};

export default VenueRaffles;
