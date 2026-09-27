import { APP_URL } from '@/lib/hosts';
import { isNative, openExternal } from '@/services/native';

/**
 * Enlace público a una ruta de la aplicación.
 *
 * Siempre en `app.fiestea.es` (en producción y dentro de la app instalada,
 * donde `window.location.origin` es `https://localhost`). Ese dominio abre la
 * app si está instalada (App Links / Universal Links) y, si no, lleva a
 * descargarla. Antes salía de `VITE_SITE_URL`, que seguía apuntando al
 * dominio antiguo.
 */
export const publicLink = (path: string): string => `${APP_URL}${path}`;

export interface ShareData {
  title: string;
  text: string;
  url?: string | null;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

const mensaje = (data: ShareData) => [data.text, data.url].filter(Boolean).join('\n');

const copiar = async (texto: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
};

/** WhatsApp con el mensaje ya escrito: el usuario sólo elige el chat. */
export const shareWhatsApp = async (data: ShareData): Promise<ShareResult> => {
  await openExternal(`https://wa.me/?text=${encodeURIComponent(mensaje(data))}`, { system: true });
  return 'shared';
};

/**
 * Instagram no deja abrir un chat con un texto ya escrito: se copia el
 * mensaje con el enlace y se abre Instagram en los mensajes directos, para
 * pegarlo en un chat o en una historia.
 */
export const shareInstagram = async (data: ShareData): Promise<ShareResult> => {
  const copiado = await copiar(mensaje(data));
  await openExternal(isNative() ? 'instagram://direct-inbox' : 'https://www.instagram.com/direct/inbox/', {
    system: true,
  });
  return copiado ? 'copied' : 'failed';
};

export const copyShareLink = async (data: ShareData): Promise<ShareResult> =>
  (await copiar(data.url ?? mensaje(data))) ? 'copied' : 'failed';

/**
 * La hoja de compartir del sistema (todas las apps). En la app instalada va
 * por el plugin de Capacitor, porque el WebView de Android no tiene
 * `navigator.share`; en el navegador, por `navigator.share`, y si no existe
 * se copia al portapapeles.
 */
export const shareOrCopy = async (data: ShareData): Promise<ShareResult> => {
  if (isNative()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: data.title, text: data.text, url: data.url ?? undefined, dialogTitle: data.title });
      return 'shared';
    } catch {
      // Cancelado o sin plugin: se copia.
    }
  } else if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: data.title, text: data.text, ...(data.url ? { url: data.url } : {}) });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copiar(mensaje(data))) ? 'copied' : 'failed';
};
