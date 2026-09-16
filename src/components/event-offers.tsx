import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, Crown, Check, Loader2, X } from 'lucide-react';
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
import { ApiError } from '@/services/api';

interface EventOffersProps {
  eventId: string;
}

/**
 * Ofertas del local, vistas desde dentro del evento.
 *
 * Sólo aparecen si has hecho check-in, así que abrir esto es la razón para
 * sacar el móvil en la barra. Al pedir una sale un código corto que se enseña
 * al camarero; se valida desde el panel del local y deja de servir.
 */
const EventOffers = ({ eventId }: EventOffersProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [offers, setOffers] = useState<EventOffer[]>([]);
  const [claimed, setClaimed] = useState<ClaimedOffer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, mine] = await Promise.all([
      socialService.getEventOffers(eventId),
      socialService.getMyClaimedOffers(),
    ]);
    setOffers(list);
    setClaimed(mine);
    setIsLoading(false);
  }, [eventId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // El contador del disparador se carga aunque el panel esté cerrado: si no,
  // nadie sabría que hay una oferta esperando.
  useEffect(() => {
    void socialService.getEventOffers(eventId).then(setOffers);
  }, [eventId]);

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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={`relative ${eventActionClass}`} aria-label={t('offers.title')}>
        <Tag size={20} />
        <span className="whitespace-nowrap">{t('offers.short')}</span>
        {offers.length > 0 && (
          <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px] bg-party-accent text-ink">
            {offers.length}
          </Badge>
        )}
      </SheetTrigger>

      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{t('offers.title')}</SheetTitle>
          <SheetDescription>{t('offers.subtitle')}</SheetDescription>
        </SheetHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-party-primary" />
            </div>
          ) : offers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('offers.empty')}</p>
          ) : (
            <ul className="space-y-3">
              {offers.map((offer) => {
                const ticket = ticketFor(offer.id);

                return (
                  <li key={offer.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold">{offer.title}</p>
                      {offer.premiumOnly && (
                        <Crown size={14} className="text-party-accent shrink-0 mt-0.5" />
                      )}
                    </div>

                    {offer.description && (
                      <p className="text-sm text-muted-foreground">{offer.description}</p>
                    )}

                    {offer.endsAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('offers.until', {
                          time: new Date(offer.endsAt).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                        })}
                      </p>
                    )}

                    {ticket ? (
                      <div
                        className={`mt-3 rounded-lg p-3 text-center ${
                          ticket.validatedAt ? 'bg-muted' : 'bg-party-primary/10'
                        }`}
                      >
                        {ticket.validatedAt ? (
                          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                            <X size={14} />
                            {t('offers.used')}
                          </p>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground mb-1">
                              {t('offers.showThis')}
                            </p>
                            <p className="font-mono text-2xl font-bold tracking-[0.2em] text-party-primary">
                              {ticket.ticketCode}
                            </p>
                          </>
                        )}
                      </div>
                    ) : (
                      <PartyButton
                        size="sm"
                        className="w-full mt-3 gap-1.5"
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
