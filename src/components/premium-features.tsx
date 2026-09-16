import React from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Star, Bookmark, Users, RotateCcw, Rocket, Eye, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PartyButton } from './ui-custom/party-button';
import { usePremium } from '@/context/premium-context';
import { useAppContext } from '@/context/app-context';

/**
 * Lo que se ofrece, en el orden en que convence.
 *
 * Primero lo que sólo tiene sentido aquí —rescatar una conexión antes de que
 * caduque, saber quién va, recuperar a quien descartaste, destacar una hora— y
 * al final lo que tiene cualquier aplicación de citas.
 *
 * «Mensajes directos» estaba en esta lista y **no existía**: la policy de
 * `messages` exige conexión desde la primera migración, así que se vendía algo
 * que la base de datos nunca permitió. Y aunque se hubiera implementado, cobrar
 * por escribir sin permiso a alguien que está a diez metros es vender acoso.
 */
const FEATURES = [
  { icon: <Bookmark size={20} />, key: 'keepAlone' },
  { icon: <Users size={20} />, key: 'whoIsGoing' },
  { icon: <RotateCcw size={20} />, key: 'secondChance' },
  { icon: <Rocket size={20} />, key: 'boost' },
  { icon: <Eye size={20} />, key: 'seeWhoLiked' },
  { icon: <Star size={20} />, key: 'superLikes' },
] as const;

/**
 * Diálogo de Vybe Premium.
 *
 * El componente existía pero no estaba montado en ninguna parte, así que no
 * había forma de contratar Premium. Ahora lo controla PremiumProvider y el
 * cobro pasa por Stripe cuando está configurado.
 */
const PremiumFeatures: React.FC = () => {
  const { t } = useTranslation();
  const {
    showPremiumDialog,
    setShowPremiumDialog,
    upgradeToPremium,
    getPremiumForEvent,
    isPremium,
  } = usePremium();
  const { activeEvent } = useAppContext();

  const [isProcessing, setIsProcessing] = React.useState(false);

  const run = async (action: () => Promise<boolean>) => {
    setIsProcessing(true);
    try {
      await action();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={showPremiumDialog} onOpenChange={setShowPremiumDialog}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-md">
        {/* Amarillo plano con tinta oscura, como la tarjeta de Premium del
            perfil. Era un degradado con texto blanco encima: 1,4:1 de
            contraste justo en lo que se vende. */}
        <div className="bg-party-primary p-6 text-center text-ink">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-party-primary">
            <Crown size={26} />
          </span>
          <DialogTitle className="font-display text-headline-lg">{t('premium.title')}</DialogTitle>
          <DialogDescription className="mt-1 text-body-md text-ink/75">{t('premium.subtitle')}</DialogDescription>
        </div>

        <div className="p-2">
          {FEATURES.map((feature) => (
            <div key={feature.key} className="flex items-start gap-3 border-b border-white/[0.06] p-3 last:border-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-high text-party-primary">
                {feature.icon}
              </span>
              <div>
                <h3 className="mb-0.5 font-display text-title-card">{t(`premium.features.${feature.key}`)}</h3>
                <p className="text-body-sm text-party-gray">{t(`premium.features.${feature.key}Body`)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 space-y-3 border-t border-border">
          {isPremium ? (
            <p className="text-center text-sm text-party-primary flex items-center justify-center gap-2">
              <Check size={16} />
              {t('premium.active')}
            </p>
          ) : (
            <>
              <PartyButton
                size="lg"
                className="w-full"
                disabled={isProcessing}
                onClick={() => void run(upgradeToPremium)}
              >
                {isProcessing ? t('premium.redirecting') : t('premium.monthly')}
              </PartyButton>

              <PartyButton
                variant="outline"
                className="w-full"
                disabled={isProcessing || !activeEvent}
                onClick={() => void run(getPremiumForEvent)}
              >
                {activeEvent
                  ? t('premium.forEvent', { name: activeEvent.eventName })
                  : t('premium.needEvent')}
              </PartyButton>
            </>
          )}

          <button
            type="button"
            className="press w-full text-sm text-party-gray"
            onClick={() => setShowPremiumDialog(false)}
          >
            {t('premium.notNow')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PremiumFeatures;
