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

  // Instalar: sólo en ordenador y como un botón pequeño abajo a la derecha. En
  // el móvil era un cuadro que tapaba la landing y molestaba; allí la app se
  // descarga de la tienda.
  if (canInstall) {
    return (
      <div className="fixed bottom-4 right-4 z-50 hidden items-center gap-1 rounded-full border border-border bg-card py-1 pl-1 pr-1.5 shadow-lg lg:flex">
        <button
          type="button"
          onClick={() => void install()}
          className="press flex items-center gap-1.5 rounded-full bg-party-primary px-3 py-1.5 text-caption font-bold text-ink"
        >
          <Download size={13} />
          {t('pwa.installTitle')}
        </button>
        <button
          type="button"
          onClick={dismissInstall}
          className="press flex h-6 w-6 items-center justify-center rounded-full text-party-gray hover:text-foreground"
          aria-label={t('common.close')}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return null;
};

export default PwaPrompt;
