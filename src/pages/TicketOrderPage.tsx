import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, Loader2, Mail, XCircle } from 'lucide-react';
import Header from '@/components/header';
import TicketDownloadButtons from '@/components/ticket-download-buttons';
import { onAppResume } from '@/services/native';
import { euros, TicketOrderResult, ticketsService } from '@/services/tickets';

/**
 * «Proceso completado»: el resultado de una compra de entradas.
 *
 * Al volver de Stripe el webhook puede tardar unos segundos en emitir las
 * entradas, así que mientras el pedido siga pendiente se vuelve a preguntar.
 * Con las entradas emitidas: descargar el PDF, añadirlas a Apple Wallet y el
 * aviso de que la copia ya va de camino al correo.
 */
const TicketOrderPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { orderId = '' } = useParams();
  const [pedido, setPedido] = useState<TicketOrderResult | null | undefined>(undefined);
  const [agotado, setAgotado] = useState(false);

  useEffect(() => {
    let vivo = true;
    let intentos = 0;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const mirar = async () => {
      const datos = await ticketsService.getOrder(orderId);
      if (!vivo) return;
      setPedido(datos);
      intentos += 1;
      // Pendiente: el pago está en Stripe o el webhook aún no ha llegado.
      if (datos?.status === 'pending') {
        if (intentos < 40) temporizador = setTimeout(() => void mirar(), 3000);
        else setAgotado(true);
      }
    };
    void mirar();

    // En la app instalada se vuelve del navegador del sistema: se mira otra vez.
    const quitar = onAppResume(() => {
      intentos = 0;
      setAgotado(false);
      clearTimeout(temporizador);
      void mirar();
    });
    return () => {
      vivo = false;
      clearTimeout(temporizador);
      quitar();
    };
  }, [orderId]);

  const volver = (
    <button
      type="button"
      onClick={() => navigate('/tickets')}
      aria-label={t('common.back')}
      className="press flex h-10 w-10 items-center justify-center rounded-full bg-surface-low"
    >
      <ArrowLeft size={20} />
    </button>
  );

  const contenido = () => {
    if (pedido === undefined || (pedido?.status === 'pending' && !agotado)) {
      return (
        <section className="flex flex-col items-center gap-3 rounded-3xl bg-surface-low p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
          <p className="font-display text-headline-md">{t('tickets.order.waiting')}</p>
          <p className="text-body-sm text-party-gray">{t('tickets.order.waitingBody')}</p>
        </section>
      );
    }

    if (!pedido || pedido.status !== 'paid') {
      return (
        <section className="flex flex-col items-center gap-3 rounded-3xl bg-surface-low p-8 text-center">
          <XCircle className="h-10 w-10 text-destructive" />
          <p className="font-display text-headline-md">
            {pedido?.status === 'refunded' ? t('tickets.order.refunded') : t('tickets.order.notCompleted')}
          </p>
          <p className="text-body-sm text-party-gray">
            {pedido?.status === 'pending' ? t('tickets.order.stillPending') : t('tickets.order.notCompletedBody')}
          </p>
          <Link to="/tickets" className="press mt-2 text-body-sm font-bold underline">
            {t('tickets.order.goTickets')}
          </Link>
        </section>
      );
    }

    const correo = pedido.tickets[0]?.holderEmail;
    return (
      <>
        <section className="flex flex-col items-center gap-2 rounded-3xl bg-surface-low p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-party-primary" />
          <h1 className="font-display text-headline-lg">{t('tickets.order.done')}</h1>
          <p className="text-body-sm text-party-gray">
            {t('tickets.order.doneBody', { count: pedido.tickets.length, event: pedido.eventName })}
          </p>
        </section>

        <section className="rounded-2xl bg-white p-4 text-ink">
          <p className="text-caption font-bold uppercase text-ink/50">{pedido.venueName}</p>
          <p className="font-display text-title-card">{pedido.eventName}</p>
          <p className="text-caption text-ink/60 first-letter:uppercase">
            {new Date(pedido.startDate).toLocaleString(i18n.language, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <ul className="mt-3 space-y-1.5 border-t border-dashed border-black/15 pt-3">
            {pedido.tickets.map((ticket) => (
              <li key={ticket.id} className="flex items-center justify-between gap-3 text-body-sm">
                <span className="min-w-0 truncate">{ticket.holderName ?? pedido.typeName}</span>
                <span className="shrink-0 font-mono font-bold tracking-wider">{ticket.code}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-black/10 pt-2 text-body-sm font-bold">
            <span>
              {pedido.quantity} × {pedido.typeName}
            </span>
            <span className="tabular">{pedido.amountCents ? euros(pedido.amountCents) : t('tickets.buy.free')}</span>
          </p>
        </section>

        {pedido.downloadToken && (
          <TicketDownloadButtons
            token={pedido.downloadToken}
            walletCodes={pedido.tickets.map((x) => x.code)}
            names={Object.fromEntries(pedido.tickets.map((x) => [x.code, x.holderName]))}
          />
        )}

        {correo && (
          <p className="flex items-start gap-2 rounded-2xl bg-surface-low p-4 text-body-sm text-party-gray">
            <Mail size={16} className="mt-0.5 shrink-0 text-party-primary" />
            {t('tickets.order.emailSent', { email: correo })}
          </p>
        )}

        {pedido.addToAccount && (
          <Link
            to="/tickets"
            className="press flex h-11 items-center justify-center rounded-xl border border-white/15 font-bold"
          >
            {t('tickets.order.goTickets')}
          </Link>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
      <Header />
      <main className="mx-auto max-w-2xl space-y-4 px-margin pt-3">
        {volver}
        {contenido()}
      </main>
    </div>
  );
};

export default TicketOrderPage;
