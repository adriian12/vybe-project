import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Check, Loader2, Sparkles } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { eventActionClass } from '@/components/ui-custom/event-action-button';
import { socialService, EventOffer, ClaimedOffer } from '@/services/social';
import { Challenge, nightService, Raffle, StampCard } from '@/services/night';
import { useAppContext } from '@/context/app-context';
import { ApiError } from '@/services/api';
import { cn } from '@/lib/utils';
import NightChallenges from '@/components/night/night-challenges';
import NightRaffles from '@/components/night/night-raffles';
import NightStamps from '@/components/night/night-stamps';
import NightSongs from '@/components/night/night-songs';
import TicketCode from '@/components/night/ticket-code';

interface EventOffersProps {
  eventId: string;
}

type Tab = 'offers' | 'challenges' | 'raffles' | 'stamps' | 'songs';

/** Las promociones que se piden en la barra. Premios y retos van aparte. */
const PEDIBLES: EventOffer['kind'][] = ['offer', 'voucher', 'ticket'];

/**
 * «La noche»: todo lo que el local ofrece a quien está dentro, en una hoja.
 *
 *   · Ofertas: se piden y sale un código para la barra.
 *   · Retos: se cumplen dentro (entrar pronto, hacer vybes, venir en grupo…) y
 *     dan un vale.
 *   · Sorteos: participa quien sigue dentro a la hora.
 *   · Tarjeta de sellos del local, si la tiene.
 *   · Canciones: pedir y votar la siguiente, si el local lo ha activado.
 *
 * Sólo sale lo que existe: una fiesta sin sorteos no enseña la pestaña.
 */
const EventOffers = ({ eventId }: EventOffersProps) => {
  const { t } = useTranslation();
  const { currentUser, activeEvent } = useAppContext();
  // Invitado: la cuenta, o un vyber que esta noche ha entrado como invitado.
  const invitado = currentUser?.accountType === 'guest' || activeEvent?.mode === 'guest';
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('offers');
  const [offers, setOffers] = useState<EventOffer[]>([]);
  const [claimed, setClaimed] = useState<ClaimedOffer[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [card, setCard] = useState<StampCard | null>(null);
  const [songs, setSongs] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, mine, retos, sorteos, tarjeta, flags] = await Promise.all([
      socialService.getEventOffers(eventId),
      socialService.getMyClaimedOffers(),
      nightService.getChallenges(eventId),
      nightService.getRaffles(eventId),
      nightService.getMyStampCard(eventId),
      nightService.getEventFlags(eventId),
    ]);
    setOffers(list.filter((offer) => PEDIBLES.includes(offer.kind)));
    setClaimed(mine);
    setChallenges(retos);
    setRaffles(sorteos);
    setCard(tarjeta);
    setSongs(flags.songs);
    setIsLoading(false);
  }, [eventId]);

  // Se carga aunque la hoja esté cerrada: el contador del botón dice que hay
  // algo esperando. Y cada minuto, porque un sorteo o un reto pueden cambiar.
  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const claim = async (offerId: string) => {
    setBusyId(offerId);
    try {
      const { ticketCode, title } = await socialService.claimOffer(offerId);
      await load();
      toast({ title, description: t('offers.claimedWithCode', { code: ticketCode }) });
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const ticketFor = (offerId: string) => claimed.find((c) => c.promotionId === offerId);
  const sorteosVivos = raffles.filter((r) => r.status === 'scheduled' || r.status === 'drawn');

  // «Como invitado ves la fiesta; como Vyber la juegas»: retos, sorteos,
  // sellos y canciones son de Vyber (la base de datos también lo impide).
  const juega = !invitado;
  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'offers', label: t('night.tabs.offers'), show: true },
    { key: 'challenges', label: t('night.tabs.challenges'), show: juega && challenges.length > 0 },
    { key: 'raffles', label: t('night.tabs.raffles'), show: juega && sorteosVivos.length > 0 },
    { key: 'stamps', label: t('night.tabs.stamps'), show: juega && card !== null },
    { key: 'songs', label: t('night.tabs.songs'), show: juega && songs },
  ];
  const visibles = tabs.filter((item) => item.show);
  const activa = visibles.some((item) => item.key === tab) ? tab : 'offers';

  // Lo que espera a la persona: ofertas, retos cumplidos sin recoger y sorteos.
  const pendientes = juega
    ? offers.length +
      challenges.filter((c) => c.done && !c.ticketCode).length +
      raffles.filter((r) => r.status === 'scheduled').length +
      (card?.canClaim ? 1 : 0)
    : offers.length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={`relative ${eventActionClass}`} aria-label={t('night.title')}>
        <Sparkles size={20} />
        <span className="whitespace-nowrap">{t('night.short')}</span>
        {pendientes > 0 && (
          <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center bg-party-accent px-1 text-[10px] text-ink">
            {pendientes}
          </Badge>
        )}
      </SheetTrigger>

      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{t('night.title')}</SheetTitle>
          <SheetDescription>{t('night.subtitle')}</SheetDescription>
        </SheetHeader>

        {visibles.length > 1 && (
          <div className="no-scrollbar -mx-6 mt-4 flex gap-2 overflow-x-auto px-6">
            {visibles.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-pressed={activa === item.key}
                className={cn(
                  'press h-9 shrink-0 rounded-full px-4 text-caption font-bold',
                  activa === item.key ? 'bg-party-primary text-ink' : 'bg-surface-high text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="py-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
            </div>
          ) : activa === 'challenges' ? (
            <NightChallenges challenges={challenges} onChange={() => void load()} />
          ) : activa === 'raffles' ? (
            <NightRaffles raffles={raffles} />
          ) : activa === 'stamps' && card ? (
            <NightStamps eventId={eventId} card={card} onChange={() => void load()} />
          ) : activa === 'songs' ? (
            <NightSongs eventId={eventId} />
          ) : offers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('offers.empty')}</p>
          ) : (
            <ul className="space-y-3">
              {offers.map((offer) => {
                const ticket = ticketFor(offer.id);

                return (
                  <li key={offer.id} className="rounded-lg border border-border p-3">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="font-semibold">{offer.title}</p>
                      {offer.premiumOnly && <Crown size={14} className="mt-0.5 shrink-0 text-party-accent" />}
                    </div>

                    {offer.description && <p className="text-sm text-muted-foreground">{offer.description}</p>}

                    {offer.endsAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('offers.until', {
                          time: new Date(offer.endsAt).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                        })}
                      </p>
                    )}

                    {ticket ? (
                      <TicketCode code={ticket.ticketCode} used={Boolean(ticket.validatedAt)} />
                    ) : (
                      <PartyButton
                        size="sm"
                        className="mt-3 w-full gap-1.5"
                        disabled={busyId === offer.id}
                        onClick={() => void claim(offer.id)}
                      >
                        <Check size={14} />
                        {t('offers.claim')}
                      </PartyButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default EventOffers;
