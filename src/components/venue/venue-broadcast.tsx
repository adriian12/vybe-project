import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Send, Loader2, Check, Clock, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { venueService, Broadcast } from '@/services/venue-service';

interface VenueBroadcastProps {
  /** Sin evento, el aviso va a toda la aplicación y sólo puede administración. */
  eventId?: string;
  /** Para saber cuántos avisos programados caben según el plan. */
  venueId?: string;
}

/** «2026-09-20T23:45» para el campo de fecha y hora, en hora local. */
const paraInput = (fecha: Date): string => {
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

/**
 * Avisos a quien está dentro del evento.
 *
 * Sirve para mover gente entre salas —«en diez minutos, sesión en la dos»— y
 * para lo que haga falta decir en el momento. Va sólo a quien ha hecho check-in
 * en las últimas horas: una app que manda publicidad a quien no está en el local
 * se desinstala esa misma noche.
 *
 * El envío no es inmediato: la nota se encola y sale en la siguiente pasada del
 * programador, como mucho unos minutos después.
 */
const VenueBroadcast = ({ eventId, venueId }: VenueBroadcastProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [sent, setSent] = useState<Broadcast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cuando, setCuando] = useState('');
  const [limite, setLimite] = useState(1);

  const load = useCallback(async () => {
    setSent(await venueService.getBroadcasts(eventId));
    setIsLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (venueId) void venueService.getScheduledBroadcastLimit(venueId).then(setLimite);
  }, [venueId]);

  const programados = sent.filter((b) => b.status === 'pending' && b.scheduledAt);

  const send = async () => {
    if (!title.trim() || !body.trim()) return;

    setIsBusy(true);
    try {
      // Con hora, el aviso espera a esa hora; sin ella, sale en la siguiente
      // pasada del programador.
      const programado = cuando ? new Date(cuando).toISOString() : null;
      await venueService.queueBroadcast(title.trim(), body.trim(), eventId, programado);
      setTitle('');
      setBody('');
      setCuando('');
      await load();
      toast({ title: t(programado ? 'venue.broadcast.scheduled' : 'venue.broadcast.queued') });
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-title-card uppercase tracking-wide">
          <Megaphone size={16} className="text-party-primary" />
          {t('venue.broadcast.title')}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {eventId ? t('venue.broadcast.subtitle') : t('venue.broadcast.subtitleGlobal')}
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="broadcast-title" className="text-xs">
            {t('venue.broadcast.heading')}
          </Label>
          <Input
            id="broadcast-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('venue.broadcast.headingPlaceholder')}
            maxLength={60}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="broadcast-body" className="text-xs">
            {t('venue.broadcast.message')}
          </Label>
          <Input
            id="broadcast-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('venue.broadcast.messagePlaceholder')}
            maxLength={160}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="broadcast-when" className="flex items-center gap-1.5 text-xs">
            <Clock size={12} />
            {t('venue.broadcast.when')}
          </Label>
          <div className="flex gap-2">
            <Input
              id="broadcast-when"
              type="datetime-local"
              value={cuando}
              min={paraInput(new Date())}
              onChange={(e) => setCuando(e.target.value)}
              className="flex-1"
            />
            {cuando && (
              <PartyButton variant="outline" size="sm" onClick={() => setCuando('')}>
                {t('venue.broadcast.now')}
              </PartyButton>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('venue.broadcast.scheduledCount', { count: programados.length, max: limite })}
          </p>
        </div>

        <PartyButton
          size="sm"
          className="w-full gap-2"
          disabled={isBusy || !title.trim() || !body.trim() || (Boolean(cuando) && programados.length >= limite)}
          onClick={() => void send()}
        >
          <Send size={14} />
          {t(cuando ? 'venue.broadcast.schedule' : 'venue.broadcast.send')}
        </PartyButton>

        <p className="text-[11px] text-muted-foreground">{t('venue.broadcast.delayNote')}</p>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-party-primary" />
          </div>
        ) : sent.length > 0 ? (
          <ul className="space-y-2 pt-2">
            {sent.map((broadcast) => (
              <li key={broadcast.id} className="rounded-lg bg-muted/50 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{broadcast.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{broadcast.body}</p>
                  </div>

                  {broadcast.status === 'sent' ? (
                    <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                      <Check size={10} />
                      {t('venue.broadcast.reached', { count: broadcast.recipients ?? 0 })}
                    </Badge>
                  ) : broadcast.status === 'cancelled' ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {t('venue.broadcast.cancelled')}
                    </Badge>
                  ) : broadcast.scheduledAt ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Clock size={10} />
                        {new Date(broadcast.scheduledAt).toLocaleString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Badge>
                      <button
                        type="button"
                        aria-label={t('common.cancel')}
                        onClick={() =>
                          void venueService
                            .cancelBroadcast(broadcast.id)
                            .then(load)
                            .catch(() => toast({ title: t('common.error'), variant: 'destructive' }))
                        }
                        className="press flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-black/5"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {t('venue.broadcast.pending')}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default VenueBroadcast;
