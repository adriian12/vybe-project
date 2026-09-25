import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PartyButton } from '@/components/ui-custom/party-button';
import PhoneInput from '@/components/ui-custom/phone-input';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';

/**
 * Entrar o registrarse con el móvil: número → código por SMS (o WhatsApp,
 * según Twilio Verify) → dentro. El móvil queda verificado de verdad: a un
 * número inventado no le llega el código.
 *
 * Apagado por ahora (`PHONE_SIGNUP` en `lib/features.ts`). Supabase crea la
 * cuenta si no existía; la ficha de fiester@ se pide después, como con Google.
 */
const PhoneAuthForm = ({ kind }: { kind?: 'vyber' | 'guest' }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { refreshSession } = useAppContext();
  const [phone, setPhone] = useState('+34');
  const [code, setCode] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [busy, setBusy] = useState(false);

  const limpio = phone.replace(/\s/g, '');
  const valido = /^\+[1-9]\d{7,14}$/.test(limpio);

  const fallo = () => toast({ title: t('common.error'), description: t('auth.phoneAuth.failed'), variant: 'destructive' });

  const pedir = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: limpio });
    setBusy(false);
    if (error) return fallo();
    setEnviado(true);
  };

  const verificar = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.verifyOtp({ phone: limpio, token: code.trim(), type: 'sms' });
    if (error || !data.user) {
      setBusy(false);
      return fallo();
    }
    const nueva = Date.now() - new Date(data.user.created_at).getTime() < 5 * 60_000;
    if (nueva && kind === 'guest') await api.setAccountType('guest').catch(() => undefined);
    await refreshSession();
    setBusy(false);
    navigate('/home', { replace: true });
  };

  return (
    <div className="space-y-3">
      {!enviado ? (
        <>
          <PhoneInput value={phone} onChange={setPhone} id="phone-auth" />
          <PartyButton size="lg" className="w-full" disabled={!valido || busy} onClick={() => void pedir()}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {t('auth.phoneAuth.send')}
          </PartyButton>
        </>
      ) : (
        <>
          <p className="text-body-sm text-party-gray">{t('auth.phoneAuth.sent', { phone: limpio })}</p>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="h-12 text-center font-display text-headline-md tracking-[0.4em]"
            aria-label={t('auth.phoneAuth.code')}
          />
          <PartyButton size="lg" className="w-full" disabled={code.length !== 6 || busy} onClick={() => void verificar()}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {t('auth.phoneAuth.verify')}
          </PartyButton>
          <button type="button" onClick={() => setEnviado(false)} className="press w-full text-caption text-party-gray underline">
            {t('auth.phoneAuth.change')}
          </button>
        </>
      )}
    </div>
  );
};

export default PhoneAuthForm;
