import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, Check } from 'lucide-react';
import { PartyButton } from './ui-custom/party-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { api, ApiError } from '@/services/api';

interface PhoneVerificationProps {
  phone?: string;
  isVerified: boolean;
  onVerified: () => void | Promise<void>;
}

/**
 * Verificación de teléfono por SMS.
 *
 * El flujo existía en la API pero no había forma de iniciarlo desde la
 * interfaz, y la tabla `verification_codes` no tenía policies, así que el
 * código nunca se podía leer ni marcar como verificado.
 */
const PhoneVerification: React.FC<PhoneVerificationProps> = ({
  phone,
  isVerified,
  onVerified,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [phoneNumber, setPhoneNumber] = useState(phone ?? '');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  if (isVerified) {
    return (
      <div className="flex items-center justify-between p-2">
        <span>{t('profile.phone')}</span>
        <span className="text-sm text-party-primary flex items-center gap-1">
          <Check size={14} />
          {phone ?? t('phoneVerification.verified')}
        </span>
      </div>
    );
  }

  const sendCode = async () => {
    if (!/^\+?[0-9]{9,15}$/.test(phoneNumber.trim())) {
      toast({
        title: t('phoneVerification.invalidNumber'),
        description: t('phoneVerification.invalidNumberBody'),
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      await api.requestPhoneVerification(phoneNumber.trim());
      setCodeSent(true);
      toast({
        title: t('phoneVerification.codeSent'),
        description: t('phoneVerification.codeSentBody'),
      });
    } catch (error) {
      toast({
        title: t('phoneVerification.sendFailed'),
        description: error instanceof ApiError ? error.message : t('errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const confirmCode = async () => {
    setIsVerifying(true);
    try {
      const ok = await api.verifyPhoneCode(code.trim());

      if (ok) {
        toast({ title: t('phoneVerification.verified') });
        await onVerified();
      } else {
        toast({
          title: t('phoneVerification.wrongCode'),
          description: t('phoneVerification.wrongCodeBody'),
          variant: 'destructive',
        });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-3 p-2">
      <div className="flex items-center gap-2">
        <Phone size={16} className="text-party-gray" />
        <span className="text-sm font-medium">{t('phoneVerification.title')}</span>
      </div>

      {!codeSent ? (
        <div className="space-y-2">
          <Label htmlFor="phone-number" className="sr-only">
            {t('safety.contactPhone')}
          </Label>
          <Input
            id="phone-number"
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder={t('phoneVerification.placeholder')}
          />
          <PartyButton
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void sendCode()}
            disabled={isSending}
          >
            {isSending ? t('phoneVerification.sending') : t('phoneVerification.sendCode')}
          </PartyButton>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="phone-code" className="sr-only">
            {t('phoneVerification.codePlaceholder')}
          </Label>
          <Input
            id="phone-code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('phoneVerification.codePlaceholder')}
            className="text-center tracking-widest"
          />
          <div className="flex gap-2">
            <PartyButton
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setCodeSent(false)}
            >
              {t('phoneVerification.changeNumber')}
            </PartyButton>
            <PartyButton
              variant="gradient"
              size="sm"
              className="flex-1"
              onClick={() => void confirmCode()}
              disabled={isVerifying || code.trim().length < 6}
            >
              {isVerifying ? t('phoneVerification.checking') : t('phoneVerification.verify')}
            </PartyButton>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhoneVerification;
