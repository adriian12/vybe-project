import { Capacitor } from '@capacitor/core';

/**
 * Dónde guarda Supabase la sesión.
 *
 * En el navegador, `localStorage`, como siempre. Dentro de la app instalada, en
 * las preferencias nativas del sistema (SharedPreferences en Android, UserDefaults
 * en iOS) con `@capacitor/preferences`: el `localStorage` de la WebView lo puede
 * vaciar el sistema cuando necesita espacio —en iOS pasa de verdad—, y entonces
 * la app aparecía con la sesión cerrada sin que nadie hubiera pulsado «Cerrar
 * sesión». Las preferencias nativas sólo se borran al desinstalar.
 *
 * La primera vez que se lee una clave que aún no está en las preferencias se
 * copia la de `localStorage`: así quien actualiza la app no tiene que volver a
 * iniciar sesión.
 */
type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const preferences = () => import('@capacitor/preferences').then((m) => m.Preferences);

const localValue = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const nativeStorage: AuthStorage = {
  getItem: async (key) => {
    const store = await preferences();
    const { value } = await store.get({ key });
    if (value !== null) return value;

    const legacy = localValue(key);
    if (legacy !== null) await store.set({ key, value: legacy });
    return legacy;
  },
  setItem: async (key, value) => {
    const store = await preferences();
    await store.set({ key, value });
  },
  removeItem: async (key) => {
    const store = await preferences();
    await store.remove({ key });
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Sin localStorage no hay nada que limpiar.
    }
  },
};

/** `undefined` en el navegador: Supabase usa su `localStorage` por defecto. */
export const authStorage: AuthStorage | undefined = Capacitor.isNativePlatform() ? nativeStorage : undefined;
