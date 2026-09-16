import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Send, Loader2, Check } from 'lucide-react';
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
}

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
const VenueBroadcast = ({ eventId }: VenueBroadcastProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [sent, setSent] = useState<Broadcast[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setSent(await venueService.getBroadcasts(eventId));
    setIsLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (!title.trim() || !body.trim()) return;

    setIsBusy(true);
    try {
      await venueService.queueBroadcast(title.trim(), body.trim(), eventId);
      setTitle('');
      setBody('');
      await load();
      toast({ title: t('venue.broadcast.queued') });
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

        <PartyButton
          size="sm"
          className="w-full gap-2"
          disabled={isBusy || !title.trim() || !body.trim()}
          onClick={() => void send()}
        >
          <Send size={14} />
          {t('venue.broadcast.send')}
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
