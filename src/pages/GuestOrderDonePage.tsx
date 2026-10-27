import { useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Mail, Smartphone, XCircle } from 'lucide-react';
import { VybeMark } from '@/components/brand/vybe-logo';
import { DOWNLOAD_PATH, landingHref } from '@/lib/hosts';

/**
 * «Compra hecha»: adonde vuelve quien compra sin cuenta desde la web
 * (migración 125). Sus entradas no están en ninguna cuenta: van al correo.
 * Stripe vuelve con `?tickets=success` o `?tickets=cancelled`.
 */
const GuestOrderDonePage = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { state } = useLocation() as { state?: { email?: string } | null };
  const cancelada = params.get('tickets') === 'cancelled';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-margin py-4">
        <a href={landingHref('/')} className="flex w-fit items-center gap-2">
          <VybeMark size={34} />
          <span className="font-display text-title-card">Fiestea</span>
        </a>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-margin pb-16 text-center">
        {cancelada ? (
          <>
            <XCircle size={56} className="text-party-gray" />
            <h1 className="font-display text-headline-lg">{t('guestOrder.cancelledTitle')}</h1>
            <p className="text-body-md text-party-gray">{t('guestOrder.cancelledBody')}</p>
          </>
        ) : (
          <>
            <CheckCircle2 size={56} className="text-emerald-500" />
            <h1 className="font-display text-headline-lg">{t('guestOrder.title')}</h1>
            <p className="flex items-start gap-2 text-left text-body-md text-party-gray">
              <Mail size={18} className="mt-0.5 shrink-0 text-party-primary" />
              {state?.email ? t('guestOrder.bodyTo', { email: state.email }) : t('guestOrder.body')}
            </p>
            <p className="text-caption text-party-gray">{t('guestOrder.spam')}</p>
          </>
        )}
        <a href={DOWNLOAD_PATH} className="press mt-4 flex w-full items-center gap-3 rounded-3xl bg-party-primary p-4 text-left text-ink">
          <Smartphone size={26} className="shrink-0" />
          <span>
            <span className="block font-display text-title-card">{t('publicEvent.appTitle')}</span>
            <span className="block text-body-sm text-ink/75">{t('guestOrder.appBody')}</span>
          </span>
        </a>
      </main>
    </div>
  );
};

export default GuestOrderDonePage;
