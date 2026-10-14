import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Archive, ArchiveRestore, ChevronDown, FileUp, Loader2, MapPin, Ticket, Trash2, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ExternalTicket, externalTicketsService, matchEvent, readTicketFile, TicketReadError } from '@/services/external-tickets';
import type { ImportedTicket } from '@/lib/ticket-import';
import type { Event } from '@/types/venue';
import { cn } from '@/lib/utils';

/**
 * Entradas compradas en otras webs (Fourvenues…), con el formato de Fiestea
 * (migración 104). Se añaden subiendo el PDF o una captura: se lee en el
 * móvil y se guarda el QR tal cual, que es lo que valida la puerta.
 */

const NOMBRE_PLATAFORMA: Record<string, string> = { fourvenues: 'Fourvenues' };

/** Una entrada de una fiesta que ya terminó deja de salir (12 h después del inicio). */
const vigente = (t: ExternalTicket) => !t.startsAt || new Date(t.startsAt).getTime() + 12 * 3600 * 1000 > Date.now();

/** «LISTA» → «Lista»: los PDF ponen las tarifas en mayúsculas. */
const suave = (s: string | null) =>
  s && s.length < 30 && s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const horaCorta = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * La hoja «Añadir entrada» la abre el botón que hay junto a «Tus entradas»
 * (`TicketsPage`), así que se controla desde fuera.
 */
const ExternalTickets = ({
  events,
  addOpen,
  onAddOpenChange,
}: {
  events: Event[];
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<ExternalTicket[]>([]);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => setTickets(await externalTicketsService.getMine()), []);
  useEffect(() => {
    void load();
  }, [load]);

  const vivas = useMemo(() => tickets.filter(vigente), [tickets]);
  const vigentes = vivas.filter((x) => !x.archived);
  const archivadas = vivas.filter((x) => x.archived);
  const fichas = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const archivar = async (ticket: ExternalTicket, archived: boolean) => {
    setTickets((l) => l.map((x) => (x.id === ticket.id ? { ...x, archived } : x)));
    try {
      await externalTicketsService.setArchived(ticket.id, archived);
      toast({ title: archived ? t('tickets.mine.archived') : t('tickets.mine.restored') });
    } catch {
      setTickets((l) => l.map((x) => (x.id === ticket.id ? { ...x, archived: !archived } : x)));
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    }
  };

  const quitar = async (ticket: ExternalTicket) => {
    setTickets((l) => l.filter((x) => x.id !== ticket.id));
    try {
      await externalTicketsService.remove(ticket.id);
      toast({ title: t('tickets.external.removed') });
    } catch {
      void load();
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    }
  };

  const tarjeta = (ticket: ExternalTicket) => {
    const ficha = ticket.eventId ? fichas.get(ticket.eventId) : undefined;
    const plataforma = NOMBRE_PLATAFORMA[ticket.source] ?? t('tickets.external.otherSource');
    const detallesAbiertos = abiertos[ticket.id];
    return (
      <li key={ticket.id} className="overflow-hidden rounded-2xl bg-white text-ink">
        {ficha?.posterUrl && (
          <div className="relative h-28 overflow-hidden">
            <img src={ficha.posterUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          </div>
        )}
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-party-primary">
            <Ticket size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-title-card leading-tight">{ticket.eventName ?? ticket.organizer ?? '—'}</p>
            <p className="mt-0.5 text-caption text-ink/60">
              {[
                ticket.organizer && ticket.organizer !== ticket.eventName ? ticket.organizer : null,
                ticket.startsAt ? fechaLarga(ticket.startsAt) : null,
                ticket.startsAt
                  ? `${horaCorta(ticket.startsAt)}${ticket.endsLabel ? ` – ${/^\d/.test(ticket.endsLabel) ? ticket.endsLabel : t('tickets.external.untilClose')}` : ''}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {ticket.holderName && <p className="mt-1 truncate text-caption font-bold text-ink/80">{ticket.holderName}</p>}
            <p className="mt-1 text-body-sm font-bold">
              {suave(ticket.ticketType ?? ticket.kind)}
              {ticket.priceCents != null &&
                ` · ${ticket.priceCents === 0 ? t('tickets.external.free') : (ticket.priceCents / 100).toLocaleString(undefined, { style: 'currency', currency: 'EUR' })}`}
            </p>
            <p className="mt-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/60">
              {t('tickets.external.from', { source: plataforma })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void archivar(ticket, !ticket.archived)}
            aria-label={ticket.archived ? t('tickets.mine.restore') : t('tickets.mine.archive')}
            className="press flex h-9 shrink-0 items-center gap-1 rounded-full border border-black/15 px-3 text-caption font-bold"
          >
            {ticket.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {ticket.archived ? t('tickets.mine.restore') : t('tickets.mine.archive')}
          </button>
        </div>

        {!ticket.archived && (
          <div className="flex flex-col items-center gap-2 border-t border-dashed border-black/15 p-4">
            <QRCodeSVG value={ticket.qrText} size={180} level="M" />
            {ticket.code && <p className="font-mono text-body-md font-bold tracking-[0.2em]">{ticket.code}</p>}
            {ticket.people && (
              <p className="flex items-center gap-1 text-caption font-bold">
                <Users size={13} />
                {t('tickets.external.validFor', { count: ticket.people })}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2 border-t border-black/10 px-4 py-3">
          {ticket.address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ticket.address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-1.5 text-caption text-ink/70 underline-offset-2 hover:underline"
            >
              <MapPin size={13} className="mt-0.5 shrink-0" />
              {ticket.address}
            </a>
          )}
          {ticket.details && (
            <div>
              <button
                type="button"
                aria-expanded={detallesAbiertos}
                onClick={() => setAbiertos((a) => ({ ...a, [ticket.id]: !a[ticket.id] }))}
                className="press flex items-center gap-1 text-caption font-bold"
              >
                {t('tickets.external.details')}
                <ChevronDown size={13} className={cn('transition-transform', detallesAbiertos && 'rotate-180')} />
              </button>
              {detallesAbiertos && <p className="mt-1 whitespace-pre-line text-caption text-ink/70">{ticket.details}</p>}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            {ficha ? (
              <Link to={`/event/${ficha.id}`} className="text-caption font-bold underline underline-offset-2">
                {t('tickets.external.seeEvent')}
              </Link>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => void quitar(ticket)}
              className="press flex items-center gap-1 text-caption font-bold text-ink/50"
            >
              <Trash2 size={13} />
              {t('tickets.external.remove')}
            </button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      {vigentes.length > 0 && <ul className="space-y-3">{vigentes.map(tarjeta)}</ul>}

      {archivadas.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            aria-expanded={verArchivadas}
            onClick={() => setVerArchivadas((v) => !v)}
            className="press flex items-center gap-1.5 text-body-sm font-bold text-party-gray"
          >
            <Archive size={14} />
            {t('tickets.mine.archivedList', { count: archivadas.length })}
            <ChevronDown size={14} className={cn('transition-transform', verArchivadas && 'rotate-180')} />
          </button>
          {verArchivadas && <ul className="space-y-3">{archivadas.map(tarjeta)}</ul>}
        </div>
      )}

      <AddTicketSheet
        open={addOpen}
        onOpenChange={onAddOpenChange}
        events={events}
        onSaved={(nueva) => setTickets((l) => [...l.filter((x) => x.id !== nueva.id), nueva])}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Hoja «Añadir entrada»
// ---------------------------------------------------------------------------

const AddTicketSheet = ({
  open,
  onOpenChange,
  events,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: Event[];
  onSaved: (ticket: ExternalTicket) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leida, setLeida] = useState<ImportedTicket | null>(null);
  const [enlazar, setEnlazar] = useState(true);

  const ficha = useMemo(() => (leida ? matchEvent(leida, events) : null), [leida, events]);

  const reiniciar = () => {
    setLeida(null);
    setError(null);
    setEnlazar(true);
    if (input.current) input.current.value = '';
  };

  const leer = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setLeida(null);
    setLeyendo(true);
    try {
      const r = await readTicketFile(file);
      if (!r.qrText) setError(t('tickets.external.noQr'));
      else setLeida(r);
    } catch (e) {
      setError(
        e instanceof TicketReadError && e.code === 'UNSUPPORTED' ? t('tickets.external.unsupported') : t('tickets.external.unreadable'),
      );
    } finally {
      setLeyendo(false);
    }
  };

  const completa = Boolean(leida?.eventName?.trim() && leida?.startsLocal);

  const guardar = async () => {
    if (!leida || !completa) return;
    setGuardando(true);
    try {
      const nueva = await externalTicketsService.add(leida, enlazar && ficha ? ficha.id : null);
      onSaved(nueva);
      toast({ title: t('tickets.external.saved') });
      onOpenChange(false);
      reiniciar();
    } catch (e) {
      toast({
        title: e instanceof Error && e.message === 'DUPLICATE' ? t('tickets.external.duplicate') : t('common.error'),
        variant: e instanceof Error && e.message === 'DUPLICATE' ? 'default' : 'destructive',
      });
    } finally {
      setGuardando(false);
    }
  };

  const cambia = (campo: keyof ImportedTicket, valor: string) =>
    setLeida((l) => (l ? { ...l, [campo]: valor || null } : l));

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reiniciar();
      }}
    >
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{t('tickets.external.addTitle')}</SheetTitle>
          <SheetDescription>{t('tickets.external.addBody')}</SheetDescription>
        </SheetHeader>

        <input
          ref={input}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => void leer(e.target.files?.[0])}
        />

        <div className="space-y-4 py-4">
          {!leida && (
            <p className="flex items-center gap-3 rounded-2xl border border-dashed border-white/20 p-4 text-body-sm text-party-gray">
              <FileUp size={20} className="shrink-0 text-party-primary" />
              {t('tickets.external.addHint')}
            </p>
          )}
          {!leida && (
            <PartyButton className="w-full" size="lg" disabled={leyendo} onClick={() => input.current?.click()}>
              {leyendo ? <Loader2 size={16} className="mr-2 animate-spin" /> : <FileUp size={16} className="mr-2" />}
              {leyendo ? t('tickets.external.reading') : t('tickets.external.choose')}
            </PartyButton>
          )}
          {error && <p className="rounded-xl bg-destructive/15 p-3 text-body-sm text-destructive">{error}</p>}

          {leida && (
            <>
              <div className="flex gap-4 rounded-2xl bg-white p-4 text-ink">
                <QRCodeSVG value={leida.qrText} size={96} level="M" className="shrink-0" />
                <div className="min-w-0 text-body-sm">
                  <p className="font-display text-title-card leading-tight">{leida.eventName ?? '—'}</p>
                  {leida.organizer && <p className="text-caption text-ink/60">{leida.organizer}</p>}
                  {leida.code && <p className="mt-1 font-mono font-bold tracking-widest">{leida.code}</p>}
                  {leida.people && <p className="text-caption">{t('tickets.external.validFor', { count: leida.people })}</p>}
                  {leida.ticketType && <p className="text-caption font-bold">{leida.ticketType}</p>}
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-caption font-bold uppercase tracking-wide text-party-gray">{t('tickets.external.eventName')}</span>
                <Input value={leida.eventName ?? ''} onChange={(e) => cambia('eventName', e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className="text-caption font-bold uppercase tracking-wide text-party-gray">{t('tickets.external.date')}</span>
                <Input
                  type="datetime-local"
                  value={leida.startsLocal ?? ''}
                  onChange={(e) => cambia('startsLocal', e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-caption font-bold uppercase tracking-wide text-party-gray">{t('tickets.external.holder')}</span>
                <Input value={leida.holderName ?? ''} onChange={(e) => cambia('holderName', e.target.value)} />
              </label>

              {ficha && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-card p-3">
                  <span className="text-body-sm">{t('tickets.external.linked', { name: ficha.name })}</span>
                  <Switch checked={enlazar} onCheckedChange={setEnlazar} aria-label={t('tickets.external.linkToggle')} />
                </div>
              )}

              {!completa && <p className="text-caption text-party-gray">{t('tickets.external.needFields')}</p>}

              <PartyButton className="w-full" size="lg" disabled={!completa || guardando} onClick={() => void guardar()}>
                {guardando && <Loader2 size={16} className="mr-2 animate-spin" />}
                {t('tickets.external.save')}
              </PartyButton>
              <button
                type="button"
                onClick={() => {
                  reiniciar();
                  input.current?.click();
                }}
                className="press w-full text-center text-body-sm font-bold text-party-gray"
              >
                {t('tickets.external.another')}
              </button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ExternalTickets;
