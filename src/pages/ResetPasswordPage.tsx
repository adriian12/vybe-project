import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, KeyRound, Loader2, XCircle } from 'lucide-react';
import { PartyButton } from '@/components/ui-custom/party-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';
import { DOWNLOAD_PATH, DownloadReason, siteMode } from '@/lib/hosts';

/** ¿La cuenta con sesión es de un local o de administración? */
const esCuentaDeEquipo = async (): Promise<boolean> => {
  try {
    if (await api.getCurrentVenue()) return true;
    const profile = await api.getCurrentProfile();
    return profile?.role === 'admin';
  } catch {
    return false;
  }
};

type Estado = 'comprobando' | 'listo' | 'guardado' | 'caducado';

const MINIMO = 8;

/**
 * Elegir una contraseña nueva desde el enlace del correo.
 *
 * No había ninguna pantalla para esto: quien olvidaba su contraseña se quedaba
 * fuera de la aplicación para siempre, sin más salida que crearse otra cuenta.
 *
 * El enlace de recuperación trae una sesión válida pero limitada. Basta para
 * `updateUser`, que es lo único que se hace aquí.
 */
const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [estado, setEstado] = useState<Estado>('comprobando');
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;

    const comprobar = async () => {
      // El SDK necesita un instante para canjear el token que llega en el hash.
      if (window.location.hash.includes('access_token=')) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelado) return;
      setEstado(session ? 'listo' : 'caducado');

      // El token fuera de la barra de direcciones y del historial.
      if (session) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    void comprobar();
    return () => {
      cancelado = true;
    };
  }, []);

  const guardar = useCallback(async () => {
    if (password.length < MINIMO) {
      toast({ title: t('auth.errors.passwordShort'), variant: 'destructive' });
      return;
    }
    if (password !== repetida) {
      toast({ title: t('auth.errors.passwordMismatch'), variant: 'destructive' });
      return;
    }

    setGuardando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setEstado('guardado');
      toast({ title: t('auth.reset.savedTitle') });

      // En app.vybes.es una cuenta de clubber no puede entrar: se le dice que
      // use la contraseña nueva en la app. Hay que mirarlo antes de cerrar la
      // sesión, que es lo que dice de quién es la cuenta.
      const soloApp = siteMode() === 'app' && !(await esCuentaDeEquipo());

      // Se cierra la sesión del enlace y se entra con la contraseña nueva, que
      // es la forma de comprobar que de verdad ha quedado guardada.
      await supabase.auth.signOut();

      if (soloApp) {
        const state: { motivo: DownloadReason } = { motivo: 'password' };
        setTimeout(() => navigate(DOWNLOAD_PATH, { replace: true, state }), 1800);
      } else {
        setTimeout(() => navigate('/auth', { replace: true }), 1800);
      }
    } catch {
      toast({
        title: t('common.error'),
        description: t('errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setGuardando(false);
    }
  }, [password, repetida, navigate, toast, t]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 pt-[calc(1.5rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]">
      <div className="w-full max-w-sm text-center">
        {estado === 'comprobando' && (
          <Loader2 size={48} className="mx-auto text-party-primary animate-spin" />
        )}

        {estado === 'caducado' && (
          <>
            <XCircle size={48} className="mx-auto mb-6 text-destructive" />
            <h1 className="text-2xl font-bold mb-2">{t('auth.reset.expiredTitle')}</h1>
            <p className="text-party-gray mb-8">{t('auth.reset.expiredBody')}</p>
            <Link to="/auth" className="text-sm text-party-primary hover:underline">
              {t('auth.verify.backToLogin')}
            </Link>
          </>
        )}

        {estado === 'guardado' && (
          <>
            <CheckCircle size={48} className="mx-auto mb-6 text-party-primary" />
            <h1 className="text-2xl font-bold mb-2">{t('auth.reset.savedTitle')}</h1>
            <p className="text-party-gray">{t('auth.reset.savedBody')}</p>
          </>
        )}

        {estado === 'listo' && (
          <>
            <KeyRound size={48} className="mx-auto mb-6 text-party-primary" />
            <h1 className="text-2xl font-bold mb-2">{t('auth.reset.title')}</h1>
            <p className="text-party-gray mb-8">{t('auth.reset.body')}</p>

            <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-left enter">
              <div className="space-y-1">
                <Label htmlFor="nueva">{t('auth.password')}</Label>
                <Input
                  id="nueva"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="repetida">{t('auth.repeatPassword')}</Label>
                <Input
                  id="repetida"
                  type="password"
                  autoComplete="new-password"
                  value={repetida}
                  onChange={(e) => setRepetida(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <PartyButton
                variant="gradient"
                className="w-full"
                disabled={guardando}
                onClick={() => void guardar()}
              >
                {guardando ? t('common.saving') : t('auth.reset.save')}
              </PartyButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
