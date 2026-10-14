/**
 * Redes sociales del negocio (migración 107). Se guarda sólo el usuario (en
 * YouTube, «@canal» o «channel/UC…») y la URL se arma al pintar. Los patrones
 * son los mismos que los CHECK de la tabla `venues`.
 */

export type SocialNetwork = 'instagram' | 'x' | 'youtube' | 'tiktok';
export const SOCIAL_NETWORKS: SocialNetwork[] = ['instagram', 'x', 'youtube', 'tiktok'];

/** Nombre de cada red tal y como lo escribe la marca. */
export const SOCIAL_NAME: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  x: 'X',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

const PATRON: Record<SocialNetwork, RegExp> = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  x: /^[A-Za-z0-9_]{1,15}$/,
  youtube: /^(@[A-Za-z0-9._-]{3,30}|channel\/UC[A-Za-z0-9_-]{22})$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
};

const DOMINIO: Record<SocialNetwork, RegExp> = {
  instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i,
  x: /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\//i,
  youtube: /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\//i,
  tiktok: /^(?:https?:\/\/)?(?:www\.|m\.)?tiktok\.com\//i,
};

/**
 * Lo que escribe el negocio («@sala», «sala», o el enlace del perfil) → lo que
 * se guarda. `null` si está vacío y `undefined` si no es válido.
 */
export const normalizeSocial = (network: SocialNetwork, raw: string): string | null | undefined => {
  let v = raw.trim();
  if (!v) return null;
  v = v.replace(DOMINIO[network], '').split(/[?#]/)[0].replace(/\/+$/, '');
  if (network === 'youtube') {
    // «youtube.com/@sala», «@sala», «sala» o «youtube.com/channel/UC…».
    if (!v.startsWith('channel/') && !v.startsWith('@')) v = `@${v}`;
    v = v.startsWith('@') ? v.split('/')[0] : v.split('/').slice(0, 2).join('/');
  } else {
    // En TikTok la ruta del perfil ya lleva la arroba («tiktok.com/@sala»).
    v = v.replace(/^@/, '').split('/')[0];
  }
  return PATRON[network].test(v) ? v : undefined;
};

export const socialUrl = (network: SocialNetwork, value: string): string => {
  switch (network) {
    case 'instagram':
      return `https://instagram.com/${value}`;
    case 'x':
      return `https://x.com/${value}`;
    case 'youtube':
      return `https://www.youtube.com/${value}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${value}`;
  }
};

/** Cómo se enseña en el formulario: con arroba delante. */
export const socialLabel = (network: SocialNetwork, value: string | null): string => {
  if (!value) return '';
  if (network === 'youtube') return value;
  return `@${value}`;
};
