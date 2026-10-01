import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const INSTALL_DISMISSED_KEY = 'vybe_installDismissed';

/**
 * Dentro de la app instalada no hay service worker. Los ficheros ya van dentro
 * del APK, así que no aporta nada, y estorba: la WebView de Android no pasa sus
 * peticiones por el servidor local de Capacitor (la precarga fallaba con 404) y,
 * si llegara a instalarse, seguiría sirviendo la versión anterior después de
 * actualizar la app desde la tienda.
 */
const useNoServiceWorker: typeof useRegisterSW = () => ({
  needRefresh: [false, () => undefined],
  offlineReady: [false, () => undefined],
  updateServiceWorker: async () => undefined,
});

const useServiceWorker = Capacitor.isNativePlatform() ? useNoServiceWorker : useRegisterSW;

/**
 * Actualización e instalación de la PWA.
 *
 * El usuario llega escaneando un QR en la puerta de una discoteca: mandarlo a
 * una tienda de aplicaciones ahí pierde a la mayoría, así que la app tiene que
 * poder instalarse desde el propio navegador.
 */
export const usePwa = () => {
  const navigate = useNavigate();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useServiceWorker({
    onRegisteredSW(_url, registration) {
      // Comprobamos actualizaciones cada hora: una noche de fiesta es larga.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      if (localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true') return;
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => setInstallPrompt(null);
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // El service worker pide navegar cuando se toca una notificación.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && typeof event.data.url === 'string') {
        navigate(event.data.url);
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  const install = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  const dismissInstall = useCallback(() => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    setInstallPrompt(null);
  }, []);

  const update = useCallback(() => {
    setNeedRefresh(false);
    void updateServiceWorker(true);
  }, [setNeedRefresh, updateServiceWorker]);

  return {
    needRefresh,
    update,
    canInstall: installPrompt !== null,
    install,
    dismissInstall,
    isOffline,
  };
};
