import { isNative } from '@/services/native';

/**
 * Dirección pública de la web.
 *
 * Dentro de la aplicación instalada `window.location.origin` es
 * `https://localhost`, que no sirve para mandárselo a nadie. Si no hay
 * `VITE_SITE_URL` configurada se comparte el texto sin enlace antes que un
 * enlace roto.
 */
const siteUrl = (): string | null => {
  const configured = import.meta.env.VITE_SITE_URL as string | undefined;
  if (configured) return configured.replace(/\/+$/, '');
  return isNative() ? null : window.location.origin;
};

/** Enlace público a una ruta de la aplicación, o `null` si no hay dominio. */
export const publicLink = (path: string): string | null => {
  const base = siteUrl();
  return base ? `${base}${path}` : null;
};

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Comparte con la hoja del sistema y, donde no existe (la mayoría de
 * navegadores de escritorio y el WebView de Android), copia al portapapeles.
 */
export const shareOrCopy = async (data: {
  title: string;
  text: string;
  url?: string | null;
}): Promise<ShareResult> => {
  const payload = { title: data.title, text: data.text, ...(data.url ? { url: data.url } : {}) };

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(payload);
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Si la hoja falla por otra razón se intenta copiar.
    }
  }

  try {
    await navigator.clipboard.writeText([data.text, data.url].filter(Boolean).join('\n'));
    return 'copied';
  } catch {
    return 'failed';
  }
};
