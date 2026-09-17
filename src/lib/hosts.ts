import { isNative } from '@/services/native';

/**
 * Qué parte de Vybe se sirve en cada dominio.
 *
 *   - `vybes.es` (y `www.`): la landing y los textos legales. Cualquier otra
 *     ruta se manda a la aplicación.
 *   - `app.vybes.es`: la web de locales y administración. Las pantallas de
 *     clubber no se abren aquí: se usan desde la app del móvil.
 *   - Todo lo demás (localhost, las previews de Vercel, la app instalada): todo
 *     a la vez, como hasta ahora, para poder desarrollar y probar.
 *
 * Los dominios salen de `VITE_LANDING_URL` y `VITE_APP_URL`; si no están, los
 * de producción.
 */

const clean = (value: string | undefined, fallback: string): string => (value || fallback).replace(/\/+$/, '');

export const LANDING_URL = clean(import.meta.env.VITE_LANDING_URL as string | undefined, 'https://vybes.es');
export const APP_URL = clean(import.meta.env.VITE_APP_URL as string | undefined, 'https://app.vybes.es');

/** Enlaces a las tiendas. Mientras no existan, la landing dice «Próximamente». */
export const PLAY_STORE_URL = (import.meta.env.VITE_PLAY_STORE_URL as string | undefined) || null;
export const APP_STORE_URL = (import.meta.env.VITE_APP_STORE_URL as string | undefined) || null;

export type SiteMode = 'landing' | 'app' | 'all';

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export const siteMode = (): SiteMode => {
  if (typeof window === 'undefined' || isNative()) return 'all';
  const host = window.location.hostname.replace(/^www\./, '');
  if (host === hostOf(LANDING_URL)) return 'landing';
  if (host === hostOf(APP_URL)) return 'app';
  return 'all';
};

/** Ruta de la aplicación: absoluta desde la landing, relativa en el resto. */
export const appHref = (path = '/'): string => (siteMode() === 'landing' ? `${APP_URL}${path}` : path);

/** Ruta de la landing: absoluta desde la aplicación, relativa en el resto. */
export const landingHref = (path = '/'): string => (siteMode() === 'app' ? `${LANDING_URL}${path}` : path);

/** ¿Hay que salir de este dominio para abrir `href`? */
export const isExternalHref = (href: string): boolean => /^https?:\/\//.test(href);
