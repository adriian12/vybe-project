import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Send, Loader2, Check, Clock, X } from 'lucide-react';
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
 * Sin hora sale al momento; con hora, espera a esa hora. Cuántos avisos se
 * pueden dejar programados a la vez depende del plan.
 *
 * La tarjeta se pinta con el mismo estilo que el resto del panel
 * (`surface-light`, títulos en mayúsculas, campos claros): antes usaba los
 * colores por defecto de shadcn y en el móvil desentonaba con todo lo demás.
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
  const [programar, setProgramar] = useState(false);

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
      // Con hora, el aviso espera a esa hora; sin ella, sale al momento.
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
    <section className="surface-light space-y-4 rounded-2xl p-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
          <Megaphone size={16} className="text-party-primary" />
          {t('venue.broadcast.title')}
        </h3>
        <p className="text-caption text-party-gray">
          {eventId ? t('venue.broadcast.subtitle') : t('venue.broadcast.subtitleGlobal')}
        </p>
      </header>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="broadcast-title" className="text-caption">
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
          <Label htmlFor="broadcast-body" className="text-caption">
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

        {/* La hora sólo aparece si se pide: en el móvil, un campo de fecha y
            hora ocupaba media tarjeta para algo que casi nunca se usa. */}
        {programar ? (
          <div className="space-y-1.5">
            <Label htmlFor="broadcast-when" className="flex items-center gap-1.5 text-caption">
              <Clock size={12} />
              {t('venue.broadcast.when')}
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="broadcast-when"
                type="datetime-local"
                value={cuando}
                min={paraInput(new Date())}
                onChange={(e) => setCuando(e.target.value)}
                className="min-w-[11rem] flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  setCuando('');
                  setProgramar(false);
                }}
                className="press h-9 shrink-0 rounded-full px-3 text-caption font-bold text-party-gray"
              >
                {t('venue.broadcast.now')}
              </button>
            </div>
            <p className="text-caption text-party-gray">
              {t('venue.broadcast.scheduledCount', { count: programados.length, max: limite })}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setProgramar(true)}
            className="press flex items-center gap-1.5 text-caption font-bold text-party-gray"
          >
            <Clock size={13} />
            {t('venue.broadcast.scheduleCta')}
          </button>
        )}

        <PartyButton
          className="w-full gap-2"
          disabled={isBusy || !title.trim() || !body.trim() || (Boolean(cuando) && programados.length >= limite)}
          onClick={() => void send()}
        >
          {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {t(cuando ? 'venue.broadcast.schedule' : 'venue.broadcast.send')}
        </PartyButton>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-party-primary" />
        </div>
      ) : sent.length > 0 ? (
        <ul className="space-y-2">
          {sent.map((broadcast) => (
            <li key={broadcast.id} className="rounded-xl bg-black/[0.04] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-bold">{broadcast.title}</p>
                  <p className="truncate text-caption text-party-gray">{broadcast.body}</p>
                </div>

                {broadcast.status === 'sent' ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-bold text-emerald-800">
                    <Check size={11} />
                    {t('venue.broadcast.reached', { count: broadcast.recipients ?? 0 })}
                  </span>
                ) : broadcast.status === 'cancelled' ? (
                  <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-caption font-bold text-red-700">
                    {t('venue.broadcast.cancelled')}
                  </span>
                ) : broadcast.scheduledAt ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-caption font-bold text-sky-800">
                      <Clock size={11} />
                      {new Date(broadcast.scheduledAt).toLocaleString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <button
                      type="button"
                      aria-label={t('common.cancel')}
                      onClick={() =>
                        void venueService
                          .cancelBroadcast(broadcast.id)
                          .then(load)
                          .catch(() => toast({ title: t('common.error'), variant: 'destructive' }))
                      }
                      className="press flex h-6 w-6 items-center justify-center rounded-full text-party-gray hover:bg-black/5"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-caption font-bold text-amber-800">
                    {t('venue.broadcast.pending')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

export default VenueBroadcast;
