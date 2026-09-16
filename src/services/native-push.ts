import { supabase } from '@/integrations/supabase/client';
import { isNative, platform } from '@/services/native';

/**
 * Notificaciones dentro de la aplicación instalada.
 *
 * En el navegador se usa Web Push, que ya estaba montado. En el teléfono el
 * aviso lo entrega el propio sistema operativo —Firebase en Android, APNs en
 * iOS— y lo que hay que guardar no es una suscripción sino un token.
 *
 * Este módulo sólo se ocupa del registro y de reaccionar al toque. El envío es
 * cosa del servidor.
 */

let currentToken: string | null = null;
let listenersReady = false;

/** Token con el que este teléfono está registrado ahora mismo. */
export const nativePushToken = (): string | null => currentToken;

/**
 * Pide permiso y registra el teléfono.
 *
 * Devuelve `false` si la persona dice que no, o si no estamos en la aplicación
 * instalada. No se insiste: un segundo diálogo de permisos molesta y no cambia
 * la respuesta.
 */
export const registerNativePush = async (
  onOpen?: (url: string) => void,
): Promise<boolean> => {
  if (!isNative()) return false;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const status = await PushNotifications.checkPermissions();
    let granted = status.receive === 'granted';

    if (!granted) {
      const asked = await PushNotifications.requestPermissions();
      granted = asked.receive === 'granted';
    }

    if (!granted) return false;

    if (!listenersReady) {
      listenersReady = true;

      await PushNotifications.addListener('registration', (token) => {
        currentToken = token.value;
        void saveToken(token.value);
      });

      await PushNotifications.addListener('registrationError', (error) => {
        console.error('No se pudo registrar el dispositivo:', error);
      });

      // Al tocar el aviso se abre la pantalla que corresponda: un match lleva a
      // la conversación, un aviso de evento a la puerta de ese evento.
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const url = action.notification.data?.url;
        if (typeof url === 'string' && onOpen) onOpen(url);
      });
    }

    await PushNotifications.register();
    return true;
  } catch (error) {
    console.error('Error registrando las notificaciones:', error);
    return false;
  }
};

/** Guarda el token en el servidor, asociado al perfil que tiene la sesión. */
const saveToken = async (token: string): Promise<void> => {
  const { error } = await supabase.rpc('save_native_push_token', {
    p_token: token,
    p_platform: platform() === 'ios' ? 'ios' : 'android',
    p_device_model: navigator.userAgent.slice(0, 120),
  });

  if (error) console.error('No se pudo guardar el token de notificaciones:', error);
};

/**
 * Retira el token al cerrar sesión.
 *
 * Sin esto, quien entrase después en ese mismo teléfono recibiría los avisos de
 * la persona anterior.
 */
export const unregisterNativePush = async (): Promise<void> => {
  if (!isNative() || !currentToken) return;

  await supabase.rpc('remove_native_push_token', { p_token: currentToken });

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    // Que no se puedan limpiar los avisos ya entregados no es grave.
  }

  currentToken = null;
};
