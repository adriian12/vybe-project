import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, Plus, Loader2, Crown, ScanLine, Check, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import {
  venueService,
  Promotion,
  PromotionStats,
  VenuePlanStatus,
} from '@/services/venue-service';
import { nightService } from '@/services/night';
import VenuePromoTemplates from '@/components/venue/venue-promo-templates';
import VenueRaffles from '@/components/venue/venue-raffles';
import VenueStampCard from '@/components/venue/venue-stamp-card';

interface VenuePromotionsProps {
  event: { id: string; startDate: string; endDate: string };
  venueId: string;
  plan: VenuePlanStatus | null;
  onUpgrade: () => void;
}

/** Duraciones habituales de una oferta de barra. */
const DURATIONS = [30, 60, 120, 240];

/**
 * Ofertas y vales del evento, y la validación en barra.
 *
 * Una promoción sólo la ve quien ha hecho check-in, así que sirve para mover
 * consumo en las horas en que la sala está llena pero nadie pide nada. El vale
 * se valida escribiendo el código que enseña la persona: es lo que hay que
 * hacer con una mano y sin soltar la copa.
 */
const VenuePromotions = ({ event, venueId, plan, onUpgrade }: VenuePromotionsProps) => {
  const eventId = event.id;
  const { t } = useTranslation();
  const [eventStamps, setEventStamps] = useState(true);
  const { toast } = useToast();

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [stats, setStats] = useState<PromotionStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<Promotion['kind']>('offer');
  const [duration, setDuration] = useState('60');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [premiumOnly, setPremiumOnly] = useState(false);

  const [ticket, setTicket] = useState('');
  const [lastValidation, setLastValidation] = useState<{
    title: string;
    holderName: string;
    alreadyUsed: boolean;
  } | null>(null);

  const canUse = plan?.promotions ?? false;

  const fail = useCallback(
    (error: unknown) => {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    },
    [t, toast],
  );

  const load = useCallback(async () => {
    const [list, result, live] = await Promise.all([
      venueService.getPromotions(eventId),
      venueService.getPromotionStats(eventId),
      nightService.getEventLive(eventId),
    ]);
    setPromotions(list);
    setStats(result);
    setEventStamps(live.stamps);
    setIsLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!title.trim()) return;

    if (!canUse) {
      onUpgrade();
      return;
    }

    setIsBusy(true);
    try {
      await venueService.createPromotion(venueId, {
        eventId,
        title: title.trim(),
        description: description.trim() || undefined,
        kind,
        endsAt: new Date(Date.now() + Number(duration) * 60_000).toISOString(),
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
        premiumOnly,
      });

      setTitle('');
      setDescription('');
      setMaxRedemptions('');
      setPremiumOnly(false);
      await load();
      toast({ title: t('venue.promotions.created') });
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  const toggle = async (promotionId: string, active: boolean) => {
    setIsBusy(true);
    try {
      await venueService.setPromotionActive(promotionId, active);
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  const validate = async () => {
    if (!ticket.trim()) return;

    setIsBusy(true);
    setLastValidation(null);
    try {
      const result = await venueService.validateTicket(ticket.trim());
      setLastValidation(result);
      setTicket('');
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-party-primary" />
      </div>
    );
  }

  const statsFor = (promotionId: string) => stats.find((s) => s.promotionId === promotionId);
  // En la lista, las que se crean a mano: las de plantilla tienen su tarjeta y
  // los premios (sorteos, sellos) no son promociones que el local gestione aquí.
  const propias = promotions.filter((p) => !p.templateKey && p.kind !== 'prize');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <VenuePromoTemplates
          event={event}
          venueId={venueId}
          promotions={promotions}
          canUse={canUse}
          onUpgrade={onUpgrade}
          onChange={() => void load()}
        />
      </div>
      <div className="space-y-4">
        <VenueRaffles event={event} />
        <VenueStampCard eventId={eventId} eventStamps={eventStamps} onEventChange={() => void load()} />
      {/* ---------------------------------------------------------------- */}
      {/* Validar un vale en barra                                        */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-title-card uppercase tracking-wide">
            <ScanLine size={16} className="text-party-primary" />
            {t('venue.promotions.validateTitle')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('venue.promotions.validateSubtitle')}
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void validate();
            }}
          >
            <Input
              value={ticket}
              onChange={(e) => setTicket(e.target.value.toUpperCase())}
              placeholder={t('venue.promotions.ticketPlaceholder')}
              maxLength={8}
              className="tracking-widest font-mono"
              autoComplete="off"
            />
            <PartyButton type="submit" size="sm" disabled={isBusy || !ticket.trim()}>
              {t('venue.promotions.validate')}
            </PartyButton>
          </form>

          {lastValidation && (
            <div
              className={`flex items-start gap-2 rounded-lg p-3 ${
                lastValidation.alreadyUsed ? 'bg-destructive/10' : 'bg-party-primary/10'
              }`}
            >
              {lastValidation.alreadyUsed ? (
                <AlertTriangle size={16} className="text-destructive shrink-0 mt-0.5" />
              ) : (
                <Check size={16} className="text-party-primary shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {lastValidation.alreadyUsed
                    ? t('venue.promotions.alreadyUsed')
                    : t('venue.promotions.validated')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lastValidation.title} · {lastValidation.holderName}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Crear una promoción                                             */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-title-card uppercase tracking-wide">
            <Tag size={16} className="text-party-primary" />
            {t('venue.promotions.title')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t('venue.promotions.subtitle')}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {!canUse && (
            <button
              type="button"
              onClick={onUpgrade}
              className="press flex w-full items-center justify-center gap-2 rounded-lg bg-party-primary py-2.5 text-caption font-bold text-ink"
            >
              <Crown size={14} />
              {t('venue.promotions.needsPlan')}
            </button>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="promo-title" className="text-xs">
              {t('venue.promotions.name')}
            </Label>
            <Input
              id="promo-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('venue.promotions.namePlaceholder')}
              maxLength={60}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="promo-desc" className="text-xs">
              {t('venue.promotions.details')}
            </Label>
            <Input
              id="promo-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('venue.promotions.detailsPlaceholder')}
              maxLength={140}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="promo-kind" className="text-xs">
                {t('venue.promotions.kind')}
              </Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Promotion['kind'])}>
                <SelectTrigger id="promo-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="offer">{t('venue.promotions.kinds.offer')}</SelectItem>
                  <SelectItem value="voucher">{t('venue.promotions.kinds.voucher')}</SelectItem>
                  <SelectItem value="ticket">{t('venue.promotions.kinds.ticket')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="promo-duration" className="text-xs">
                {t('venue.promotions.duration')}
              </Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="promo-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {t('venue.promotions.minutes', { count: minutes })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="promo-max" className="text-xs">
                {t('venue.promotions.maxRedemptions')}
              </Label>
              <Input
                id="promo-max"
                type="number"
                min={1}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder={t('venue.promotions.unlimited')}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
            <div>
              <p className="text-sm">{t('venue.promotions.premiumOnly')}</p>
              <p className="text-xs text-muted-foreground">
                {t('venue.promotions.premiumOnlyHelp')}
              </p>
            </div>
            <Switch checked={premiumOnly} onCheckedChange={setPremiumOnly} />
          </div>

          <PartyButton
            size="sm"
            className="w-full gap-2"
            disabled={isBusy || !title.trim()}
            onClick={() => void create()}
          >
            <Plus size={14} />
            {t('venue.promotions.create')}
          </PartyButton>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Resultado de cada promoción                                     */}
      {/* ---------------------------------------------------------------- */}
      {propias.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-title-card uppercase tracking-wide">{t('venue.promotions.active')}</CardTitle>
          </CardHeader>

          <CardContent>
            <ul className="space-y-2">
              {propias.map((promotion) => {
                const result = statsFor(promotion.id);
                const ended = promotion.endsAt && new Date(promotion.endsAt) < new Date();

                return (
                  <li key={promotion.id} className="rounded-lg bg-muted/50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{promotion.title}</p>
                          <Badge variant="secondary" className="text-[10px]">
                            {t(`venue.promotions.kinds.${promotion.kind}`)}
                          </Badge>
                          {promotion.premiumOnly && (
                            <Crown size={12} className="text-party-accent shrink-0" />
                          )}
                        </div>
                        {promotion.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {promotion.description}
                          </p>
                        )}
                        {promotion.endsAt && (
                          <p className="text-xs text-muted-foreground">
                            {ended
                              ? t('venue.promotions.ended')
                              : t('venue.promotions.until', {
                                  time: new Date(promotion.endsAt).toLocaleTimeString(undefined, {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }),
                                })}
                          </p>
                        )}
                      </div>

                      <Switch
                        checked={promotion.active}
                        disabled={isBusy}
                        onCheckedChange={(value) => void toggle(promotion.id, value)}
                      />
                    </div>

                    <div className="mt-2 flex gap-4 text-xs">
                      <span>
                        <strong className="text-base">{result?.claimed ?? 0}</strong>{' '}
                        {t('venue.promotions.claimed')}
                      </span>
                      <span className="text-party-primary">
                        <strong className="text-base">{result?.validated ?? 0}</strong>{' '}
                        {t('venue.promotions.used')}
                      </span>
                      {promotion.maxRedemptions && (
                        <span className="text-muted-foreground">
                          {t('venue.promotions.ofLimit', { limit: promotion.maxRedemptions })}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
};

export default VenuePromotions;
