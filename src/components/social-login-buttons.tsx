import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import { api } from '@/services/api';
import { SocialLoginCancelled, signInWithProvider, SocialProvider, socialProviders } from '@/services/social-auth';

/** El logo de Google, con sus colores. */
const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const AppleLogo = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M16.37 12.62c-.03-2.7 2.2-4 2.3-4.07-1.26-1.84-3.21-2.09-3.9-2.12-1.66-.17-3.24.98-4.08.98-.85 0-2.14-.96-3.52-.93-1.81.03-3.48 1.05-4.41 2.67-1.88 3.26-.48 8.08 1.35 10.73.9 1.29 1.96 2.74 3.35 2.69 1.35-.05 1.86-.87 3.49-.87 1.62 0 2.08.87 3.5.84 1.45-.03 2.37-1.31 3.25-2.61 1.03-1.5 1.45-2.95 1.47-3.03-.03-.01-2.82-1.08-2.85-4.28zM13.7 4.7c.74-.9 1.24-2.14 1.1-3.38-1.07.04-2.36.71-3.13 1.61-.68.79-1.28 2.06-1.12 3.27 1.19.09 2.41-.61 3.15-1.5z" />
  </svg>
);

/**
 * «Continuar con Google» y «Continuar con Apple» (sólo en la app instalada).
 * En el registro, `kind` es el tipo de cuenta elegido: si la cuenta es nueva
 * y se eligió invitado, se aplica al entrar.
 */
const SocialLoginButtons = ({ kind }: { kind?: 'vyber' | 'guest' }) => {
  const proveedores = socialProviders();
  // En la web (y en las pruebas) no hay botones: ni se monta lo de dentro.
  if (proveedores.length === 0) return null;
  return <Botones kind={kind} proveedores={proveedores} />;
};

const Botones = ({ kind, proveedores }: { kind?: 'vyber' | 'guest'; proveedores: SocialProvider[] }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { refreshSession } = useAppContext();
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  const entrar = async (provider: SocialProvider) => {
    setBusy(provider);
    try {
      const { isNew } = await signInWithProvider(provider);
      if (isNew && kind === 'guest') await api.setAccountType('guest').catch(() => undefined);
      await refreshSession();
      navigate('/home', { replace: true });
    } catch (error) {
      if (error instanceof SocialLoginCancelled) return;
      console.error('social login', error);
      toast({ title: t('common.error'), description: t('auth.social.failed'), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2.5">
      {proveedores.includes('apple') && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void entrar('apple')}
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-bold text-black disabled:opacity-60"
        >
          {busy === 'apple' ? <Loader2 size={17} className="animate-spin" /> : <AppleLogo />}
          {t('auth.social.apple')}
        </button>
      )}
      {proveedores.includes('google') && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void entrar('google')}
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-surface-highest bg-card font-bold text-foreground disabled:opacity-60"
        >
          {busy === 'google' ? <Loader2 size={17} className="animate-spin" /> : <GoogleLogo />}
          {t('auth.social.google')}
        </button>
      )}
      <div className="flex items-center gap-3 py-1 text-caption text-party-gray">
        <span className="h-px flex-1 bg-surface-highest" />
        {t('auth.social.orEmail')}
        <span className="h-px flex-1 bg-surface-highest" />
      </div>
    </div>
  );
};

export default SocialLoginButtons;
