import { useNavigate, Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Building, User } from 'lucide-react';
import LanguageSwitcher from '@/components/language-switcher';
import { VybeMark } from '@/components/brand/vybe-logo';

/**
 * La bienvenida, según «Welcome» de Stitch: el símbolo, el nombre y la frase
 * en el centro, y abajo, a mano del pulgar, las dos formas de entrar.
 *
 * Antes las dos opciones estaban en mitad de la pantalla con una pregunta
 * encima; en un móvil grande quedaban fuera del alcance del pulgar.
 */
const Index = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="pt-safe pb-safe relative flex min-h-[100dvh] flex-col overflow-hidden">
      {/* Un halo amarillo muy tenue detrás del símbolo: la única luz de la
          pantalla, como un foco sobre el escenario vacío. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-party-primary/[0.07] blur-3xl"
      />

      <div className="relative z-10 flex justify-end px-margin pt-4">
        <LanguageSwitcher />
      </div>

      <div className="enter relative z-10 flex flex-1 flex-col items-center justify-center px-margin text-center">
        <VybeMark size={72} className="mb-5 drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]" />
        <h1 className="font-display text-[40px] font-extrabold leading-none tracking-tight">
          {t('common.appName')}
        </h1>
        <p className="mt-2 text-body-md text-party-gray">{t('common.tagline')}</p>
      </div>

      <div className="stagger relative z-10 mx-auto w-full max-w-md space-y-3 px-margin pb-6">
        <button
          type="button"
          style={{ '--i': 1 } as React.CSSProperties}
          onClick={() => navigate('/auth?type=user')}
          className="press flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-party-primary font-display text-title-card text-ink hover:bg-[#E0BC00]"
        >
          <User size={19} />
          {t('index.asUser')}
        </button>

        <button
          type="button"
          style={{ '--i': 2 } as React.CSSProperties}
          onClick={() => navigate('/auth?type=venue')}
          className="press flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-party-gray/40 font-display text-title-card text-foreground hover:bg-white/[0.04]"
        >
          <Building size={19} />
          {t('index.asVenue')}
        </button>

        <p className="pt-3 text-center text-caption font-normal text-party-gray">
          <Trans
            i18nKey="index.legal"
            components={{
              terms: <Link to="/legal/terms" className="underline underline-offset-2" />,
              privacy: <Link to="/legal/privacy" className="underline underline-offset-2" />,
            }}
          />
        </p>
      </div>
    </div>
  );
};

export default Index;
