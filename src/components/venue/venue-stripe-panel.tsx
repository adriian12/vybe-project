import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadConnectAndInitialize, type StripeConnectInstance } from '@stripe/connect-js';
import {
  ConnectAccountManagement,
  ConnectComponentsProvider,
  ConnectNotificationBanner,
  ConnectPayments,
  ConnectPayouts,
} from '@stripe/react-connect-js';
import { cn } from '@/lib/utils';
import { ticketsService } from '@/services/tickets';

/**
 * Los cobros del negocio dentro de Fiestea, con los componentes integrados de
 * Stripe: las cuentas se crean sin panel de Stripe (`dashboard: 'none'`), así
 * que el negocio no tiene usuario de Stripe y todo lo ve aquí:
 *   · avisos de Stripe (datos que faltan, verificaciones);
 *   · cobros, devoluciones y contracargos (con la respuesta al contracargo);
 *   · transferencias al banco y su calendario;
 *   · datos de la cuenta y cuenta bancaria.
 *
 * Va aparte y con `lazy()`: la librería de Stripe sólo se descarga al abrirlo.
 */

type Pestana = 'payments' | 'payouts' | 'account';

const VenueStripePanel = () => {
  const { t, i18n } = useTranslation();
  const [pestana, setPestana] = useState<Pestana>('payments');
  const [error, setError] = useState(false);

  const [conexion, setConexion] = useState<StripeConnectInstance | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        // La primera sesión trae también la clave pública del modo actual; las
        // siguientes (Stripe las pide al caducar) se piden otra vez.
        let pendiente: Promise<{ clientSecret: string; publishableKey: string }> | null =
          ticketsService.paymentsSession();
        const { publishableKey } = await pendiente;
        if (!vivo) return;
        setConexion(
          loadConnectAndInitialize({
            publishableKey,
            fetchClientSecret: async () => {
              const sesion = pendiente ?? ticketsService.paymentsSession();
              pendiente = null;
              return (await sesion).clientSecret;
            },
            locale: i18n.language === 'ca' ? 'es-ES' : i18n.language,
            appearance: {
              variables: {
                colorPrimary: '#111114',
                colorText: '#111114',
                colorBackground: '#FFFFFF',
                borderRadius: '12px',
                fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
              },
            },
          }),
        );
      } catch {
        if (vivo) setError(true);
      }
    })();
    return () => {
      vivo = false;
    };
    // Una sola instancia mientras el panel esté abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <p className="rounded-xl bg-black/5 p-3 text-body-sm">{t('sales.payments.errors.generic')}</p>;
  }
  if (!conexion) {
    return <div className="h-40 animate-pulse rounded-xl bg-black/5" />;
  }

  const pestanas: { id: Pestana; label: string }[] = [
    { id: 'payments', label: t('sales.payments.tabs.payments') },
    { id: 'payouts', label: t('sales.payments.tabs.payouts') },
    { id: 'account', label: t('sales.payments.tabs.account') },
  ];

  return (
    <ConnectComponentsProvider connectInstance={conexion}>
      <div className="space-y-3">
        <ConnectNotificationBanner />
        <div role="tablist" className="flex gap-1 rounded-xl bg-black/5 p-1">
          {pestanas.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pestana === p.id}
              onClick={() => setPestana(p.id)}
              className={cn(
                'press h-9 flex-1 rounded-lg text-caption font-bold',
                pestana === p.id ? 'bg-white text-ink shadow-sm' : 'text-party-gray',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="min-h-40">
          {pestana === 'payments' && <ConnectPayments />}
          {pestana === 'payouts' && <ConnectPayouts />}
          {pestana === 'account' && <ConnectAccountManagement />}
        </div>
      </div>
    </ConnectComponentsProvider>
  );
};

export default VenueStripePanel;
