import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import { privacyService } from '@/services/privacy';
import { supabase } from '@/integrations/supabase/client';

/**
 * Bloquea la app hasta que el usuario acepta términos, privacidad y mayoría de
 * edad.
 *
 * La pantalla inicial decía "al continuar aceptas…" en texto plano, sin enlaces
 * y sin dejar constancia. El RGPD exige consentimiento informado y registrado.
 */
const ConsentGate = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isLoggedIn, userType, isLoading } = useAppContext();

  const [checked, setChecked] = useState<boolean | null>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [age, setAge] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const verify = useCallback(async () => {
    // Mientras se comprueba no se decide nada. Antes se conservaba el resultado
    // de la comprobación anterior, así que al iniciar sesión se pintaba primero
    // la aplicación —con la sesión todavía a medias— y un instante después
    // aparecía esta pantalla encima. Parecía que volvía a pedir permiso.
    setChecked(null);

    if (!isLoggedIn) {
      setChecked(true);
      return;
    }

    if (await privacyService.hasCurrentConsent()) {
      setChecked(true);
      return;
    }

    // Quien se registró por el formulario ya aceptó allí los tres documentos,
    // con los enlaces delante y antes de entregar ningún dato. Volver a
    // preguntárselo al entrar sería pedir dos veces lo mismo, así que aquí sólo
    // se deja constancia en la base de datos de lo que ya consintió.
    //
    // Esta pantalla sigue existiendo para las cuentas creadas por otra vía
    // (las de administración, o cualquiera anterior a este cambio) y para
    // cuando cambie la versión de los documentos.
    const { data } = await supabase.auth.getUser();
    const aceptado = data.user?.user_metadata?.consent_accepted_at;

    if (typeof aceptado === 'string' && aceptado) {
      try {
        await privacyService.recordConsent(false);
        setChecked(true);
        return;
      } catch {
        // Si no se puede escribir, se pregunta: es preferible molestar a
        // quedarse sin constancia del consentimiento.
      }
    }

    setChecked(false);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoading) void verify();
  }, [isLoading, verify]);

  const accept = async () => {
    if (!terms || !privacy || !age) {
      toast({ title: t('consent.required'), variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      await privacyService.recordConsent(marketing);
      setChecked(true);
    } catch {
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Los locales tienen su propio flujo contractual, fuera de esta pantalla, y
  // la cuenta de administración es la del responsable del tratamiento: no tiene
  // a quién dar consentimiento porque el consentimiento se le da a ella.
  if (isLoading || checked === null || !isLoggedIn || userType === 'venue' || userType === 'admin') {
    if (isLoading || checked === null) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-party-primary" />
        </div>
      );
    }
    return <>{children}</>;
  }

  if (checked) return <>{children}</>;

  const linkProps = { className: 'text-party-primary underline', target: '_blank' as const };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t('consent.title')}</h1>
          <p className="text-party-gray">{t('consent.intro')}</p>
        </div>

        <div className="space-y-4 bg-muted p-5 rounded-lg">
          <label className="flex gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              className="mt-1 shrink-0"
            />
            <span>
              <Trans
                i18nKey="consent.terms"
                components={{ terms: <Link to="/legal/terms" {...linkProps} /> }}
              />
            </span>
          </label>

          <label className="flex gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={privacy}
              onChange={(e) => setPrivacy(e.target.checked)}
              className="mt-1 shrink-0"
            />
            <span>
              <Trans
                i18nKey="consent.privacy"
                components={{ privacy: <Link to="/legal/privacy" {...linkProps} /> }}
              />
            </span>
          </label>

          <label className="flex gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={age}
              onChange={(e) => setAge(e.target.checked)}
              className="mt-1 shrink-0"
            />
            <span>{t('consent.age')}</span>
          </label>

          <label className="flex gap-3 text-sm cursor-pointer border-t border-border pt-4">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="mt-1 shrink-0"
            />
            <span className="text-party-gray">{t('consent.marketing')}</span>
          </label>
        </div>

        <PartyButton
          variant="gradient"
          className="w-full"
          onClick={() => void accept()}
          disabled={isSaving}
        >
          {isSaving ? t('common.saving') : t('consent.accept')}
        </PartyButton>

        <p className="text-xs text-party-gray text-center">{t('consent.readDocs')}</p>
      </div>
    </div>
  );
};

export default ConsentGate;
