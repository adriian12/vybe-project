import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { authEmailService, authEmailMessage } from '@/services/auth-email';

/**
 * «¿Olvidaste tu contraseña?».
 *
 * No existía. Quien olvidaba la suya no tenía ninguna salida dentro de la
 * aplicación, y en una app donde se entra un sábado por la noche y no se vuelve
 * hasta el siguiente, olvidarla es lo normal.
 *
 * El correo sale por Resend, igual que el de alta.
 */
const ForgotPassword: React.FC<{ defaultEmail?: string }> = ({ defaultEmail = '' }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [abierto, setAbierto] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const enviar = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      toast({ title: t('auth.errors.invalidEmail'), variant: 'destructive' });
      return;
    }

    setEnviando(true);
    try {
      await authEmailService.requestPasswordReset(email.trim());
      // Se responde igual exista o no la cuenta: decir «ese correo no está
      // registrado» permitiría averiguar quién usa una aplicación de ligar.
      setEnviado(true);
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t(authEmailMessage(error)),
        variant: 'destructive',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setEnviado(false);
          setAbierto(true);
        }}
        className="press text-sm text-party-gray hover:text-party-primary"
      >
        {t('auth.forgot.link')}
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('auth.forgot.title')}</DialogTitle>
            <DialogDescription>
              {enviado ? t('auth.forgot.sentBody', { email }) : t('auth.forgot.body')}
            </DialogDescription>
          </DialogHeader>

          {enviado ? (
            <PartyButton variant="outline" className="w-full" onClick={() => setAbierto(false)}>
              {t('common.close')}
            </PartyButton>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="forgot-email">{t('auth.email')}</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                />
              </div>

              <PartyButton
                variant="gradient"
                className="w-full"
                disabled={enviando}
                onClick={() => void enviar()}
              >
                {enviando ? t('auth.forgot.sending') : t('auth.forgot.send')}
              </PartyButton>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ForgotPassword;
