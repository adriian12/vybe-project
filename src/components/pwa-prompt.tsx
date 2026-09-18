import { useTranslation } from 'react-i18next';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { usePwa } from '@/hooks/use-pwa';
import { PartyButton } from '@/components/ui-custom/party-button';

/**
 * Avisos de instalación y actualización de la PWA.
 *
 * El usuario llega escaneando un QR en la puerta de una discoteca: poder
 * instalar desde el navegador evita perderlo en una tienda de aplicaciones.
 */
const PwaPrompt = () => {
  const { t } = useTranslation();
  const { needRefresh, update, canInstall, install, dismissInstall, isOffline } = usePwa();

  if (isOffline) {
    return (
      <div
        role="status"
        className="fixed top-0 inset-x-0 z-50 bg-destructive text-destructive-foreground text-sm text-center pb-2 pt-[calc(0.5rem+var(--safe-top))] px-4 flex items-center justify-center gap-2"
      >
        <WifiOff size={14} />
        {t('pwa.offline')}
      </div>
    );
  }

  if (needRefresh) {
    return (
      <div className="fixed bottom-[calc(var(--nav-h)+1rem)] inset-x-4 z-50 max-w-sm mx-auto rounded-xl border border-border bg-card p-4 shadow-lg">
        <p className="font-medium mb-1">{t('pwa.updateTitle')}</p>
        <p className="text-sm text-party-gray mb-3">{t('pwa.updateBody')}</p>
        <PartyButton variant="gradient" size="sm" className="w-full" onClick={update}>
          <RefreshCw size={14} className="mr-2" />
          {t('pwa.update')}
        </PartyButton>
      </div>
    );
  }

  if (canInstall) {
    return (
      <div className="fixed bottom-[calc(var(--nav-h)+1rem)] inset-x-4 z-50 max-w-sm mx-auto rounded-xl border border-border bg-card p-4 shadow-lg">
        <button
          type="button"
          onClick={dismissInstall}
          className="press absolute top-2 right-2 text-party-gray"
          aria-label={t('common.close')}
        >
          <X size={16} />
        </button>

        <p className="font-medium mb-1">{t('pwa.installTitle')}</p>
        <p className="text-sm text-party-gray mb-3">{t('pwa.installBody')}</p>
        <PartyButton variant="gradient" size="sm" className="w-full" onClick={() => void install()}>
          <Download size={14} className="mr-2" />
          {t('pwa.install')}
        </PartyButton>
      </div>
    );
  }

  return null;
};

export default PwaPrompt;
