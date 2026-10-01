import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Archive, ArchiveRestore, Armchair, CheckCircle2, ChevronDown, Crown, Loader2, Ticket } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatHourRange } from '@/components/event-bits';
import TicketDownloadButtons from '@/components/ticket-download-buttons';
import { euros, MyTicket, ticketsService } from '@/services/tickets';
import { cn } from '@/lib/utils';

/**
 * Las entradas y mesas compradas en la app, cada una con su QR y su código.
 * La puerta del local las escanea en «Validar entrada».
 *
 * Al volver de pagar (`?tickets=success`) el webhook puede tardar unos
 * segundos en emitirlas, así que se vuelve a mirar durante medio minuto.
 *
 * Quien compra para sus amigos puede archivar las entradas que no son suyas
 * (migración 088): dejan de salir aquí, siguen valiendo en la puerta y se
 * recuperan en «Archivadas».
 */
const PurchasedTickets = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [esperando, setEsperando] = useState(false);
  const [verArchivadas, setVerArchivadas] = useState(false);

  const load = useCallback(async () => {
    const lista = await ticketsService.getMine();
    setTickets(lista);
    return lista;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const vuelta = searchParams.get('tickets');
    if (!vuelta) return;
    const pedido = searchParams.get('order');
    const params = new URLSearchParams(searchParams);
    params.delete('tickets');
    params.delete('order');
    setSearchParams(params, { replace: true });

    // Al volver de Stripe con el pedido: «Proceso completado».
    if (vuelta === 'success' && pedido) {
      navigate(`/tickets/order/${pedido}`, { replace: true });
      return;
    }

    if (vuelta !== 'success') {
      toast({ title: t('tickets.mine.cancelled') });
      return;
    }

    toast({ title: t('tickets.mine.paid'), description: t('tickets.mine.paidBody') });
    let intentos = 0;
    const antes = tickets.length;
    setEsperando(true);
    const intervalo = setInterval(() => {
      intentos += 1;
      void load().then((lista) => {
        if (lista.length > antes || intentos >= 10) {
          clearInterval(intervalo);
          setEsperando(false);
        }
      });
    }, 3000);
    return () => clearInterval(intervalo);
    // Sólo al volver de la pasarela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sólo las de fiestas que no han terminado.
  const vivas = useMemo(
    () => tickets.filter((ticket) => new Date(ticket.endDate).getTime() > Date.now() && ticket.status !== 'refunded'),
    [tickets],
  );
  const vigentes = vivas.filter((ticket) => !ticket.archived);
  const archivadas = vivas.filter((ticket) => ticket.archived);

  const archivar = async (ticket: MyTicket, archived: boolean) => {
    setTickets((lista) => lista.map((x) => (x.id === ticket.id ? { ...x, archived } : x)));
    try {
      await ticketsService.setArchived(ticket.id, archived);
      toast({
        title: archived ? t('tickets.mine.archived') : t('tickets.mine.restored'),
        description: archived ? t('tickets.mine.archivedBody') : undefined,
      });
    } catch {
      setTickets((lista) => lista.map((x) => (x.id === ticket.id ? { ...x, archived: !archived } : x)));
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    }
  };

  if (vivas.length === 0 && !esperando) return null;

  const tarjeta = (ticket: MyTicket) => {
    const usada = ticket.status === 'used';
    const Icono = ticket.kind === 'table' ? Armchair : ticket.kind === 'vip' ? Crown : Ticket;
    return (
      <li key={ticket.id} className={cn('overflow-hidden rounded-2xl bg-white text-ink', usada && 'opacity-60')}>
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-party-primary">
            <Icono size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-title-card">{ticket.eventName}</p>
            <p className="truncate text-caption text-ink/60">
              {ticket.venueName} ·{' '}
              {new Date(ticket.startDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
              {formatHourRange(ticket.startDate, ticket.endDate)}
            </p>
            {ticket.holderName && <p className="mt-1 truncate text-caption font-bold text-ink/80">{ticket.holderName}</p>}
            <p className="mt-1 text-body-sm font-bold">
              {ticket.typeName}
              {ticket.kind === 'table' && ticket.guests ? ` · ${t('tickets.buy.guests', { count: ticket.guests })}` : ''}
            </p>
            {ticket.kind === 'table' && (
              <p className="text-caption text-ink/60">
                {t('tickets.mine.depositPaid', { amount: euros(ticket.unitCents) })}
                {ticket.minSpendCents ? ` · ${t('tickets.buy.minSpend', { amount: euros(ticket.minSpendCents) })}` : ''}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void archivar(ticket, !ticket.archived)}
            aria-label={ticket.archived ? t('tickets.mine.restore') : t('tickets.mine.archive')}
            title={ticket.archived ? t('tickets.mine.restore') : t('tickets.mine.archive')}
            className="press flex h-9 shrink-0 items-center gap-1 rounded-full border border-black/15 px-3 text-caption font-bold"
          >
            {ticket.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {ticket.archived ? t('tickets.mine.restore') : t('tickets.mine.archive')}
          </button>
        </div>
        {ticket.archived ? null : usada ? (
          <p className="flex items-center justify-center gap-1.5 border-t border-dashed border-black/15 py-3 text-caption font-bold uppercase">
            <CheckCircle2 size={14} />
            {t('tickets.mine.used', {
              time: ticket.usedAt
                ? new Date(ticket.usedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                : '',
            })}
          </p>
        ) : (
          <div className="flex flex-col items-center gap-2 border-t border-dashed border-black/15 p-4">
            <QRCodeSVG value={ticket.code} size={168} level="M" />
            <p className="font-mono text-body-md font-bold tracking-[0.2em]">{ticket.code}</p>
            <p className="text-caption text-ink/60">{t('tickets.mine.showAtDoor')}</p>
            {ticket.downloadToken && (
              <TicketDownloadButtons
                token={ticket.downloadToken}
                code={ticket.code}
                names={{ [ticket.code]: ticket.holderName }}
                tone="light"
                className="w-full pt-1"
              />
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-display text-headline-md uppercase">
        {t('tickets.mine.title')}
        {esperando && <Loader2 size={16} className="animate-spin text-party-primary" />}
      </h2>
      {esperando && vigentes.length === 0 && (
        <p className="rounded-2xl bg-card p-4 text-body-sm text-party-gray">{t('tickets.mine.waiting')}</p>
      )}
      {vigentes.length > 0 && <ul className="space-y-3">{vigentes.map(tarjeta)}</ul>}
      {vigentes.length === 0 && archivadas.length > 0 && (
        <p className="rounded-2xl bg-card p-4 text-body-sm text-party-gray">{t('tickets.mine.allArchived')}</p>
      )}
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
    </section>
  );
};

export default PurchasedTickets;
