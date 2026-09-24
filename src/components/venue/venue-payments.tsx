import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { PaymentsStatus, ticketsService } from '@/services/tickets';

/**
 * «Cobros»: la cuenta de Stripe del local (Connect Express).
 *
 * Activar es un botón: la cuenta se crea con lo que ya sabemos del local y en
 * Stripe sólo le queda lo que exige la ley (persona responsable, IBAN,
 * verificación). Si ya usa Stripe, entra con su cuenta y reutiliza sus datos.
 * Al volver (`?connect=return`) se pregunta a Stripe cómo ha quedado.
 */
const VenuePayments = ({ onStatus }: { onStatus?: (status: PaymentsStatus | null) => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);

  const aplicar = useCallback(
    (s: PaymentsStatus | null) => {
      setStatus(s);
      onStatus?.(s);
    },
    [onStatus],
  );

  const fail = useCallback(
    (error: unknown) => {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    },
    [t, toast],
  );

  const comprobar = useCallback(async () => {
    try {
      aplicar(await ticketsService.refreshPayments());
    } catch (error) {
      fail(error);
    }
  }, [aplicar, fail]);

  useEffect(() => {
    let vivo = true;
    const params = new URLSearchParams(window.location.search);
    const vuelta = params.get('connect');
    if (vuelta) {
      params.delete('connect');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }

    void (async () => {
      const guardado = await ticketsService.getPaymentsStatus();
      if (!vivo) return;
      aplicar(guardado);
      setCargando(false);
      // Al volver del alta, o si faltaba algo, se pregunta a Stripe.
      if (vuelta || (guardado?.connected && !(guardado.chargesEnabled && guardado.payoutsEnabled))) {
        await comprobar();
        if (vuelta === 'return') toast({ title: t('sales.payments.back') });
      }
    })();
    return () => {
      vivo = false;
    };
    // Sólo al abrir la sección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const irA = async (obtener: () => Promise<string>) => {
    setBusy(true);
    try {
      window.location.assign(await obtener());
    } catch (error) {
      fail(error);
      setBusy(false);
    }
  };

  if (cargando) {
    return (
      <div className="surface-light flex justify-center rounded-2xl p-4">
        <Loader2 className="h-5 w-5 animate-spin text-party-primary" />
      </div>
    );
  }

  const activo = Boolean(status?.chargesEnabled);
  const enRevision = Boolean(status?.connected && status.detailsSubmitted && !activo && status.pendingFields === 0);

  return (
    <div className="surface-light rounded-2xl p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={
            activo
              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700'
              : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-party-primary text-ink'
          }
        >
          {activo ? <CheckCircle2 size={20} /> : <CreditCard size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-title-card uppercase tracking-wide">
            {activo ? t('sales.payments.active') : t('sales.payments.title')}
          </p>
          <p className="mt-0.5 text-body-sm text-party-gray">
            {!status?.connected
              ? t('sales.payments.intro')
              : activo
                ? status.payoutsEnabled
                  ? t('sales.payments.activeBody')
                  : t('sales.payments.noPayouts')
                : enRevision
                  ? t('sales.payments.reviewing')
                  : t('sales.payments.missing', { count: status.pendingFields })}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!status?.connected && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void irA(ticketsService.startOnboarding)}
            className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-party-primary px-4 font-bold text-ink disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {t('sales.payments.activate')}
          </button>
        )}
        {status?.connected && (!activo || !status.payoutsEnabled) && !enRevision && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void irA(ticketsService.startOnboarding)}
            className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-party-primary px-4 font-bold text-ink disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} />}
            {t('sales.payments.complete')}
          </button>
        )}
        {status?.connected && !activo && (
          <button
            type="button"
            onClick={() => void comprobar()}
            className="press flex h-11 items-center gap-1.5 rounded-xl border border-black/15 px-3 text-caption font-bold"
          >
            <RefreshCw size={14} />
            {t('sales.payments.check')}
          </button>
        )}
        {activo && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void irA(ticketsService.paymentsDashboard)}
            className="press flex h-11 items-center gap-1.5 rounded-xl border border-black/15 px-4 text-caption font-bold disabled:opacity-50"
          >
            <ExternalLink size={14} />
            {t('sales.payments.dashboard')}
          </button>
        )}
      </div>
    </div>
  );
};

export default VenuePayments;
