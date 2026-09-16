import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { PartyButton } from '@/components/ui-custom/party-button';
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { authEmailService, authEmailMessage } from '@/services/auth-email';

type Status = 'verifying' | 'success' | 'error' | 'pending';

interface LocationState {
  email?: string;
  type?: 'user' | 'venue';
  /** La cuenta se creó pero el correo no salió: hay que decirlo. */
  emailFailed?: boolean;
}

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const state = (location.state ?? {}) as LocationState;

  const [status, setStatus] = useState<Status>('verifying');
  const [email, setEmail] = useState(state.email ?? searchParams.get('email') ?? '');
  const [resending, setResending] = useState(false);

  // La verificación sólo debe ejecutarse una vez por carga.
  const hasRun = useRef(false);

  /** Tras confirmar, cada tipo de cuenta va a su propia zona. */
  const redirectAfterSuccess = useCallback(async () => {
    const venue = await api.getCurrentVenue();
    setTimeout(() => navigate(venue ? '/venue/dashboard' : '/home', { replace: true }), 1500);
  }, [navigate]);

  const finishSuccess = useCallback(
    async (confirmedEmail: string) => {
      setStatus('success');
      setEmail(confirmedEmail);
      toast({ title: t('auth.verify.successTitle'), description: t('auth.verify.successBody') });

      // Quitamos el token del hash para que no quede en el historial.
      window.history.replaceState({}, document.title, window.location.pathname);
      await redirectAfterSuccess();
    },
    [toast, t, redirectAfterSuccess],
  );

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const run = async () => {
      const isPendingRoute = location.pathname.includes('verify-email-pending');

      if (isPendingRoute) {
        setStatus('pending');
        return;
      }

      const token = searchParams.get('token_hash') ?? searchParams.get('token');
      const type = searchParams.get('type');
      const hasHashToken = window.location.hash.includes('access_token=');

      try {
        // Enlaces nuevos de Supabase: token en query, hay que canjearlo.
        if (token && (type === 'signup' || type === 'email' || type === 'magiclink')) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: type === 'magiclink' ? 'magiclink' : 'signup',
          });

          if (error) throw error;

          if (data.user?.email_confirmed_at) {
            await finishSuccess(data.user.email ?? '');
            return;
          }
        }

        // Enlaces antiguos: el SDK procesa el hash y crea la sesión solo.
        if (hasHashToken) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user?.email_confirmed_at) {
          await finishSuccess(session.user.email ?? '');
          return;
        }

        if (session?.user) {
          setStatus('error');
          toast({
            title: t('auth.verify.errorTitle'),
            description: t('auth.verify.errorBody'),
            variant: 'destructive',
          });
          return;
        }

        // Sin token ni sesión: probablemente ha llegado aquí a la espera del correo.
        setStatus(email ? 'pending' : 'error');
      } catch (error) {
        console.error('Error verifying email:', error);
        setStatus('error');
        toast({
          title: t('auth.verify.errorTitle'),
          description: errorMessage(error, t('errors.generic')),
          variant: 'destructive',
        });
      }
    };

    void run();
  }, [searchParams, location.pathname, email, finishSuccess, toast, t]);

  /**
   * Reenvía el correo por Resend, no por `supabase.auth.resend()`.
   *
   * El reenvío de Supabase usa su servicio de correo integrado, que es el que
   * no entrega: reenviar por ahí devolvía «enviado» y no llegaba nada, que es
   * peor que un error. Va por la misma función que el alta.
   */
  const resendEmail = async () => {
    if (!email) {
      toast({ title: t('auth.errors.invalidEmail'), variant: 'destructive' });
      return;
    }

    setResending(true);
    try {
      await authEmailService.resendConfirmation(email);
      toast({ title: t('auth.verify.resent') });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t(authEmailMessage(error)),
        variant: 'destructive',
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        {status === 'verifying' && (
          <>
            <Loader2 size={56} className="mx-auto mb-6 text-party-primary animate-spin" />
            <h1 className="text-2xl font-bold mb-2">{t('auth.verify.verifying')}</h1>
            <p className="text-party-gray">{t('auth.verify.verifyingBody')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle size={56} className="mx-auto mb-6 text-party-primary" />
            <h1 className="text-2xl font-bold mb-2">{t('auth.verify.successTitle')}</h1>
            <p className="text-party-gray mb-8">
              {t('auth.verify.successBody')}
            </p>
            <PartyButton variant="gradient" className="w-full" onClick={() => navigate('/home')}>
              {t('common.continue')}
            </PartyButton>
          </>
        )}

        {status === 'pending' && (
          <>
            <Mail size={56} className="mx-auto mb-6 text-party-primary" />
            <h1 className="text-2xl font-bold mb-2">{t('auth.verify.pendingTitle')}</h1>
            <p className="text-party-gray mb-2">
              {t('auth.verify.pendingBody', { email: email || '—' })}
            </p>
            <p className="text-party-gray text-sm mb-4">{t('auth.verify.pendingSpam')}</p>

            {state.emailFailed && (
              <p className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                {t('auth.verify.sendFailed')}
              </p>
            )}

            <div className="space-y-3">
              <PartyButton
                variant="outline"
                className="w-full"
                onClick={() => void resendEmail()}
                disabled={resending}
              >
                {resending ? t('auth.verify.resending') : t('auth.verify.resend')}
              </PartyButton>
              <Link to="/auth" className="block text-sm text-party-primary hover:underline">
                {t('auth.verify.backToLogin')}
              </Link>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={56} className="mx-auto mb-6 text-destructive" />
            <h1 className="text-2xl font-bold mb-2">{t('auth.verify.errorTitle')}</h1>
            <p className="text-party-gray mb-8">{t('auth.verify.errorBody')}</p>

            <div className="space-y-3">
              <PartyButton
                variant="gradient"
                className="w-full"
                onClick={() => void resendEmail()}
                disabled={resending}
              >
                {resending ? t('auth.verify.resending') : t('auth.verify.resend')}
              </PartyButton>
              <Link to="/auth" className="block text-sm text-party-primary hover:underline">
                {t('auth.verify.backToLogin')}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmailPage;
