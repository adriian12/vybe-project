import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

/**
 * Iniciar sesión con Google o con Apple en la app (migración 075).
 *
 * El plugin nativo (`@capgo/capacitor-social-login`) abre la hoja del sistema
 * y devuelve el `idToken`; Supabase lo verifica con `signInWithIdToken` y crea
 * la cuenta si no existía (el perfil lo hace `handle_new_user`, con el nombre
 * que mandan Google o Apple).
 *
 * Sólo en la app instalada: la web de `app.fiestea.es` es para negocios y
 * administración. Apple sólo en iPhone (en Android pediría un Services ID y
 * un flujo web). Sin los IDs de cliente de Google (`VITE_GOOGLE_*`), el botón
 * de Google no sale.
 *
 * El plugin se importa donde se usa y nunca se devuelve desde una promesa (es
 * un Proxy de Capacitor; véase `auth-storage.ts`).
 */

export type SocialProvider = 'google' | 'apple';

const GOOGLE_WEB_CLIENT_ID = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined) ?? '';
const GOOGLE_IOS_CLIENT_ID = (import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined) ?? '';

export const socialProviders = (): SocialProvider[] => {
  if (!Capacitor.isNativePlatform()) return [];
  const platform = Capacitor.getPlatform();
  const lista: SocialProvider[] = [];
  if (GOOGLE_WEB_CLIENT_ID && (platform === 'android' || GOOGLE_IOS_CLIENT_ID)) lista.push('google');
  if (platform === 'ios') lista.push('apple');
  return lista;
};

/** La persona cerró la hoja sin elegir cuenta. */
export class SocialLoginCancelled extends Error {}

let iniciado = false;

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const sha256 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

/** El `nonce` de dentro del token (sin verificar: eso lo hace Supabase). */
const nonceDelToken = (idToken: string): string | undefined => {
  try {
    const payload = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(payload)) as { nonce?: string }).nonce;
  } catch {
    return undefined;
  }
};

/**
 * Inicia sesión y devuelve si la cuenta es nueva (para aplicar el tipo de
 * cuenta elegido en el registro).
 */
export const signInWithProvider = async (provider: SocialProvider): Promise<{ isNew: boolean }> => {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  if (!iniciado) {
    await SocialLogin.initialize({
      google: GOOGLE_WEB_CLIENT_ID
        ? { webClientId: GOOGLE_WEB_CLIENT_ID, iOSClientId: GOOGLE_IOS_CLIENT_ID || undefined, mode: 'online' }
        : undefined,
      apple: Capacitor.getPlatform() === 'ios' ? {} : undefined,
    });
    iniciado = true;
  }

  // Supabase compara sha256(nonce en claro) con el `nonce` del token. Se le
  // da al proveedor el hash y a Supabase el valor en claro.
  const crudo = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const hash = await sha256(crudo);

  let idToken: string | undefined;
  try {
    const res = await SocialLogin.login({
      provider,
      options: provider === 'google' ? { scopes: ['email', 'profile'], nonce: hash } : { scopes: ['email', 'name'], nonce: hash },
    } as never);
    idToken = (res as { result?: { idToken?: string | null } }).result?.idToken ?? undefined;
  } catch (error) {
    if (/cancel/i.test(error instanceof Error ? error.message : String(error))) throw new SocialLoginCancelled();
    throw error;
  }
  if (!idToken) throw new Error('NO_ID_TOKEN');

  // Según la plataforma, el proveedor guarda el hash tal cual o lo vuelve a
  // pasar por sha256: se manda a Supabase el valor que corresponda.
  const enToken = nonceDelToken(idToken);
  const nonce = !enToken ? undefined : enToken === hash ? crudo : enToken === (await sha256(hash)) ? hash : crudo;

  const { data, error } = await supabase.auth.signInWithIdToken({ provider, token: idToken, nonce });
  if (error) throw error;

  const creado = data.user?.created_at ? new Date(data.user.created_at).getTime() : 0;
  return { isNew: Date.now() - creado < 5 * 60_000 };
};
