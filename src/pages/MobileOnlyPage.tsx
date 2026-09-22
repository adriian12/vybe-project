import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building, CheckCircle2, Smartphone } from 'lucide-react';
import LanguageSwitcher from '@/components/language-switcher';
import StoreButtons from '@/components/store-buttons';
import { VybeMark } from '@/components/brand/vybe-logo';
import { DownloadReason, landingHref } from '@/lib/hosts';

const MOTIVOS: DownloadReason[] = ['clubber', 'verified', 'password'];

/**
 * Lo que se ve en `app.vybes.es` al abrir una pantalla de clubber.
 *
 * La web es sólo para locales y administración: descubrir fiestas, entrar con
 * el QR y hacer Vybe Check se hace desde la app del móvil. Si el enlace venía de
 * compartir una fiesta y la app está instalada, Android lo abre directamente en
 * la app y esta página ni llega a verse.
 *
 * Una cuenta de clubber nunca tiene sesión aquí (`StaffOnlyWeb` la cierra), así
 * que no hace falta botón de salir. Si se llega desde un trámite —confirmar el
 * email, cambiar la contraseña— o tras intentar entrar, una línea lo explica.
 */
const MobileOnlyPage = () => {
  const { t } = useTranslation();
  const { state } = useLocation();
  const motivo = MOTIVOS.find((m) => m === (state as { motivo?: unknown } | null)?.motivo);

  return (
    <div className="pt-safe pb-safe flex min-h-[100dvh] flex-col px-margin">
      <div className="flex items-center justify-between pt-4">
        <a href={landingHref('/')} className="flex items-center gap-2" aria-label="Fiestea">
          <VybeMark size={32} />
          <span className="font-display text-headline-lg uppercase tracking-tight">Fiestea</span>
        </a>
        <LanguageSwitcher />
      </div>

      <main className="enter mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 text-center">
        {motivo && (
          <p
            role="status"
            className="mb-8 flex items-start gap-2 rounded-2xl bg-surface-low px-4 py-3 text-left text-body-sm"
          >
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-party-primary" />
            {t(`mobileOnly.reason.${motivo}`)}
          </p>
        )}

        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-party-primary text-ink">
          <Smartphone size={30} />
        </span>
        <h1 className="mt-6 font-display text-headline-xl">{t('mobileOnly.title')}</h1>
        <p className="mt-2 text-body-md text-party-gray">{t('mobileOnly.body')}</p>

        <StoreButtons className="mt-8 justify-center" />

        <div className="mt-10 space-y-3 border-t border-white/[0.06] pt-6">
          <Link
            to="/auth?type=venue"
            className="press mx-auto flex h-11 w-fit items-center gap-2 rounded-xl bg-surface-low px-4 font-display text-title-card"
          >
            <Building size={17} />
            {t('mobileOnly.venueAccess')}
          </Link>
        </div>
      </main>
    </div>
  );
};

export default MobileOnlyPage;
