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

/**
 * La marca de esta rama. El backend es el mismo para las dos apps y lo usa
 * para los correos (`auth-email`): nombre, colores y enlace a su web.
 */
export const BRAND = 'fiestea' as const;

const PROD_LANDING = 'https://fiestea.es';
const PROD_APP = 'https://app.fiestea.es';

/**
 * En los dominios de producción mandan siempre `vybes.es` y `app.vybes.es`.
 * Las variables sólo sirven para probar en local: en Vercel estaban puestas a
 * `vybe.com`, la web no reconocía su propio dominio y `app.vybes.es` enseñaba
 * la landing.
 */
const enProduccion =
  isNative() ||
  (typeof window !== 'undefined' && /(^|\.)fiestea\.es$/.test(window.location.hostname));

export const LANDING_URL = enProduccion
  ? PROD_LANDING
  : clean(import.meta.env.VITE_LANDING_URL as string | undefined, PROD_LANDING);
export const APP_URL = enProduccion
  ? PROD_APP
  : clean(import.meta.env.VITE_APP_URL as string | undefined, PROD_APP);

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

/** Página de «descarga la app» de `app.vybes.es` (`MobileOnlyPage`). */
export const DOWNLOAD_PATH = '/descargar';

/**
 * Por qué se llega a la página de descarga; cambia la línea de aviso. Se pasa
 * en `location.state.motivo`.
 */
export type DownloadReason = 'clubber' | 'verified' | 'password';

/** ¿Hay que salir de este dominio para abrir `href`? */
export const isExternalHref = (href: string): boolean => /^https?:\/\//.test(href);
