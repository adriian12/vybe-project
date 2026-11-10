import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Send, Loader2, Check, Clock, Crown, Users, X, CalendarDays, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { venueService, AudienceEvent, Broadcast, BroadcastAudience, VenuePlanStatus } from '@/services/venue-service';
import { planHas } from '@/lib/venue-plans';
import { cn } from '@/lib/utils';
import InfoHelp from '@/components/venue/info-help';

interface VenueBroadcastProps {
  /** Sin evento, el aviso va a toda la aplicación y sólo puede administración. */
  eventId?: string;
  /** Para saber cuántos avisos programados caben según el plan. */
  venueId?: string;
  /**
   * Con esto se puede elegir a quién va el aviso (seguidores, habituales…),
   * que es de Pro y Business. Sin ello, sólo a quien está dentro.
   */
  audiences?: { plan: VenuePlanStatus | null; onUpgrade: () => void };
}

const PUBLICOS: BroadcastAudience[] = ['inside', 'followers', 'regulars', 'no_show', 'never_came'];

/** Públicos que se pueden mandar a un evento concreto o a todos (migración 134). */
const POR_EVENTO: BroadcastAudience[] = ['no_show', 'never_came'];

/** «Todos los eventos» en el selector. */
const TODOS = 'all';

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
const VenueBroadcast = ({ eventId, venueId, audiences }: VenueBroadcastProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [body, setBody] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [sent, setSent] = useState<Broadcast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cuando, setCuando] = useState('');
  const [limite, setLimite] = useState(1);
  const [programar, setProgramar] = useState(false);
  const [publico, setPublico] = useState<BroadcastAudience>('inside');
  const [alcance, setAlcance] = useState<number | null>(null);
  const [eventos, setEventos] = useState<AudienceEvent[]>([]);
  // De qué evento: el que se está trabajando, otro o «todos». Sólo cuenta en
  // «Dijeron que venían» y «Nunca han venido»; los demás usan `eventId`.
  const [deEvento, setDeEvento] = useState<string>(eventId ?? TODOS);
  const cuerpo = useRef<HTMLInputElement>(null);
  const segmentos = audiences ? planHas(audiences.plan?.plan, 'audiences') : false;
  const porEvento = POR_EVENTO.includes(publico);
  /** El evento del aviso según el público elegido. Nulo: todos los eventos. */
  const eventoDelAviso = porEvento ? (deEvento === TODOS ? null : deEvento) : (eventId ?? null);

  useEffect(() => setDeEvento(eventId ?? TODOS), [eventId]);

  // Notificaciones personalizadas (Business, migración 135).
  const conMarca = audiences ? planHas(audiences.plan?.plan, 'brandedPush') : false;
  const [marca, setMarca] = useState({ enabled: false, hasLogo: true });
  const [guardandoMarca, setGuardandoMarca] = useState(false);

  useEffect(() => {
    if (venueId) void venueService.getBrandedPush(venueId).then(setMarca);
  }, [venueId]);

  const cambiarMarca = async (enabled: boolean) => {
    if (!conMarca) {
      audiences?.onUpgrade();
      return;
    }
    setGuardandoMarca(true);
    setMarca((m) => ({ ...m, enabled }));
    try {
      await venueService.setBrandedPush(enabled);
    } catch (error) {
      setMarca((m) => ({ ...m, enabled: !enabled }));
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    } finally {
      setGuardandoMarca(false);
    }
  };

  useEffect(() => {
    if (!venueId || !segmentos) return;
    void venueService.getAudienceEvents(venueId).then(setEventos);
  }, [venueId, segmentos]);

  // Cuánta gente recibiría el aviso: se cuenta en el servidor con la misma
  // definición con la que se envía.
  useEffect(() => {
    setAlcance(null);
    if (!eventId || publico === 'inside' || !segmentos) return;
    let vivo = true;
    void venueService.countAudience(publico, eventoDelAviso).then((n) => {
      if (vivo) setAlcance(n);
    });
    return () => {
      vivo = false;
    };
  }, [eventId, publico, segmentos, eventoDelAviso]);

  const load = useCallback(async () => {
    setSent(await venueService.getBroadcasts(eventId, venueId));
    setIsLoading(false);
  }, [eventId, venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (venueId) void venueService.getScheduledBroadcastLimit(venueId).then(setLimite);
  }, [venueId]);

  const programados = sent.filter((b) => b.status === 'pending' && b.scheduledAt);

  const send = async () => {
    const texto = body.trim();
    if (!texto) return;
    // El aviso ya sale con el nombre del negocio de título (`notify-events`),
    // así que sólo se escribe el mensaje. La base de datos sigue pidiendo un
    // título: va el principio del mensaje, que es lo que se ve en el historial.
    const titulo = texto.slice(0, 60);

    setIsBusy(true);
    try {
      // Con hora, el aviso espera a esa hora; sin ella, sale al momento.
      const programado = cuando ? new Date(cuando).toISOString() : null;
      if (publico !== 'inside' && eventId) {
        await venueService.queueAudienceBroadcast(publico, titulo, texto, eventoDelAviso, programado);
      } else {
        await venueService.queueBroadcast(titulo, texto, eventId, programado);
      }
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

  /**
   * «Volver a enviar»: rellena el formulario con el mensaje, el público y el
   * evento de un aviso anterior. No sale solo: se revisa y se pulsa «Enviar».
   */
  const reutilizar = (b: Broadcast) => {
    setBody(b.body);
    if (b.audience === 'inside' || segmentos) setPublico(b.audience);
    if (POR_EVENTO.includes(b.audience)) setDeEvento(b.eventId ?? TODOS);
    setCuando('');
    setProgramar(false);
    cuerpo.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => cuerpo.current?.focus(), 250);
  };

  const puedeEnviar = !isBusy && Boolean(body.trim()) && !(Boolean(cuando) && programados.length >= limite);
  const botonEnviar = (
    <>
      {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
      {t(cuando ? 'venue.broadcast.schedule' : 'venue.broadcast.send')}
    </>
  );

  const fechaEvento = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <section className="surface-light space-y-4 rounded-2xl p-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
          <Megaphone size={16} className="text-party-primary" />
          {t('venue.broadcast.title')}
          <InfoHelp topic="broadcast" />
        </h3>
        <p className="text-caption text-party-gray">
          {eventId ? t('venue.broadcast.subtitle') : t('venue.broadcast.subtitleGlobal')}
        </p>
      </header>

      <div className="space-y-3">
        {audiences && eventId && segmentos && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-caption font-bold">
              <Users size={12} />
              {t('venue.broadcast.audience.label')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PUBLICOS.map((clave) => {
                const bloqueado = clave !== 'inside' && !segmentos;
                return (
                  <button
                    key={clave}
                    type="button"
                    onClick={() => (bloqueado ? audiences.onUpgrade() : setPublico(clave))}
                    aria-pressed={publico === clave}
                    className={cn(
                      'press flex h-8 items-center gap-1 rounded-full px-3 text-caption font-bold',
                      publico === clave ? 'bg-party-primary text-ink' : 'bg-black/[0.06] text-ink/70',
                    )}
                  >
                    {bloqueado && <Crown size={11} />}
                    {t(`venue.broadcast.audience.${clave}`)}
                  </button>
                );
              })}
            </div>
            {porEvento && (
              <div className="space-y-1">
                <Label htmlFor="broadcast-event" className="flex items-center gap-1.5 text-caption font-bold">
                  <CalendarDays size={12} />
                  {t('venue.broadcast.audience.whichEvent')}
                </Label>
                <select
                  id="broadcast-event"
                  value={deEvento}
                  onChange={(e) => setDeEvento(e.target.value)}
                  className="h-10 w-full rounded-xl border border-black/10 bg-[#F5F5F7] px-3 text-body-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-party-primary"
                >
                  <option value={TODOS}>{t('venue.broadcast.audience.allEvents')}</option>
                  {eventos.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {fechaEvento(e.startDate)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="text-caption text-party-gray">
              {t(`venue.broadcast.audience.${publico}${porEvento && deEvento === TODOS ? 'AllHelp' : 'Help'}`)}
              {alcance !== null && ` · ${t('venue.broadcast.audience.reach', { count: alcance })}`}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="broadcast-body" className="text-caption">
            {t('venue.broadcast.message')}
          </Label>
          <Input
            id="broadcast-body"
            ref={cuerpo}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('venue.broadcast.messagePlaceholder')}
            maxLength={160}
          />
        </div>

        {/* Notificaciones personalizadas (Business): los avisos salen con el
            logo del negocio. Sin marcar, el aviso normal con el de Fiestea. */}
        {audiences && venueId && (
          <div className="rounded-xl border border-black/10 bg-black/[0.03] p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p id="broadcast-branded" className="flex items-center gap-1.5 text-body-sm font-bold">
                  {!conMarca && <Crown size={12} className="text-party-primary" />}
                  {t('venue.broadcast.branded.label')}
                </p>
                <p className="mt-0.5 text-caption text-party-gray">
                  {conMarca
                    ? marca.enabled && !marca.hasLogo
                      ? t('venue.broadcast.branded.noLogo')
                      : t('venue.broadcast.branded.help')
                    : t('venue.broadcast.branded.business')}
                </p>
              </div>
              <Switch
                aria-labelledby="broadcast-branded"
                checked={conMarca && marca.enabled}
                disabled={guardandoMarca}
                onCheckedChange={(v) => void cambiarMarca(v)}
                className="mt-0.5 shrink-0"
              />
            </div>
          </div>
        )}

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

        {/* En el móvil, debajo del mensaje; en escritorio va al final del
            panel, fijo abajo a la derecha (ver más abajo). */}
        <PartyButton className="w-full gap-2 lg:hidden" disabled={!puedeEnviar} onClick={() => void send()}>
          {botonEnviar}
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
                  {broadcast.audience !== 'inside' && (
                    <p className="text-[11px] font-bold uppercase tracking-wide text-party-gray">
                      {t(`venue.broadcast.audience.${broadcast.audience}`)}
                    </p>
                  )}
                  {/* Los antiguos llevaban título aparte; los nuevos, sólo el mensaje. */}
                  {broadcast.body.startsWith(broadcast.title) ? (
                    <p className="line-clamp-2 text-body-sm font-bold">{broadcast.body}</p>
                  ) : (
                    <>
                      <p className="truncate text-body-sm font-bold">{broadcast.title}</p>
                      <p className="truncate text-caption text-party-gray">{broadcast.body}</p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => reutilizar(broadcast)}
                    className="press mt-1.5 inline-flex items-center gap-1 rounded-full bg-black/[0.06] px-2.5 py-1 text-caption font-bold text-ink hover:bg-black/10"
                  >
                    <RotateCcw size={11} />
                    {t('venue.broadcast.resend')}
                  </button>
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

      {/* Escritorio: el botón se queda fijo abajo a la derecha mientras se baja
          por el historial (pegado al fondo del panel, que es el que se desplaza). */}
      <div className="pointer-events-none sticky bottom-4 z-10 hidden justify-end lg:flex">
        <PartyButton
          className="pointer-events-auto gap-2 px-6 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
          disabled={!puedeEnviar}
          onClick={() => void send()}
        >
          {botonEnviar}
        </PartyButton>
      </div>
    </section>
  );
};

export default VenueBroadcast;
