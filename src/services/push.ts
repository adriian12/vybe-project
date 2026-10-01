import { supabase } from '@/integrations/supabase/client';
import { isNative } from '@/services/native';
import {
  isNativePushEnabled,
  nativePushToken,
  registerNativePush,
  unregisterNativePush,
} from '@/services/native-push';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushStatus = 'unsupported' | 'unconfigured' | 'default' | 'granted' | 'denied';

/** La clave VAPID viaja en base64url y `applicationServerKey` exige un Uint8Array. */
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

const arrayBufferToBase64 = (buffer: ArrayBuffer | null): string => {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

export const pushService = {
  isSupported: (): boolean =>
    // Dentro de la aplicación instalada los avisos los entrega el sistema, no
    // el navegador, así que siempre están disponibles.
    isNative() ||
    (typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window),

  getStatus: (): PushStatus => {
    if (isNative()) return nativePushToken() ? 'granted' : 'default';
    if (!pushService.isSupported()) return 'unsupported';
    if (!VAPID_PUBLIC_KEY) return 'unconfigured';
    return Notification.permission as PushStatus;
  },

  /**
   * Pide permiso y registra la suscripción.
   *
   * Sin esto el bucle del producto se rompe: un match del que te enteras al día
   * siguiente no vale nada en una app que sólo funciona dentro del evento.
   */
  subscribe: async (): Promise<boolean> => {
    // En el teléfono el registro pasa por Firebase o APNs, no por VAPID.
    if (isNative()) return registerNativePush();

    if (!pushService.isSupported() || !VAPID_PUBLIC_KEY) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;

    // Si ya hay una suscripción con otra clave, la reemplazamos.
    const existing = await registration.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .maybeSingle();

    if (!profile) return false;

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        profile_id: profile.id,
        endpoint: subscription.endpoint,
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
        auth: arrayBufferToBase64(subscription.getKey('auth')),
        user_agent: navigator.userAgent.slice(0, 250),
      },
      { onConflict: 'endpoint' },
    );

    if (error) {
      console.error('Error saving push subscription:', error);
      return false;
    }

    return true;
  },

  unsubscribe: async (): Promise<void> => {
    if (isNative()) {
      // Apagado desde el perfil: no se vuelve a encender solo al abrir la app.
      await unregisterNativePush({ optOut: true });
      return;
    }

    if (!pushService.isSupported()) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  },

  /** Comprueba si la suscripción del navegador sigue registrada en el servidor. */
  isSubscribed: async (): Promise<boolean> => {
    // En el teléfono no hay `Notification` ni service worker que consultar.
    if (isNative()) return isNativePushEnabled();

    if (!pushService.isSupported() || Notification.permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;

    const { data } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', subscription.endpoint)
      .maybeSingle();

    return Boolean(data);
  },

  setPreferences: async (prefs: { matches?: boolean; messages?: boolean }): Promise<void> => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    await supabase
      .from('profiles')
      .update({
        ...(prefs.matches !== undefined && { notify_matches: prefs.matches }),
        ...(prefs.messages !== undefined && { notify_messages: prefs.messages }),
      })
      .eq('user_id', user.user.id);
  },
};
