import { supabase } from '@/integrations/supabase/client';
import { isNative, platform } from '@/services/native';

/**
 * Notificaciones dentro de la aplicación instalada.
 *
 * En el navegador se usa Web Push, que ya estaba montado. En el teléfono el
 * aviso lo entrega el propio sistema operativo —Firebase en Android, APNs en
 * iOS— y lo que hay que guardar no es una suscripción sino un token.
 *
 * Este módulo se ocupa del registro y de reaccionar a los avisos. El envío es
 * cosa del servidor (`send-push`, que disparan los mensajes, los matches y el
 * programador de eventos).
 */

/** Lo que la app hace con un aviso. Lo pone `NativePushBridge`, que tiene el router. */
export interface NativePushHandlers {
  /** Se ha tocado el aviso: hay que abrir su pantalla. */
  onOpen: (url: string) => void;
  /** Ha llegado con la app delante: el sistema no lo enseña, lo enseña la app. */
  onForeground: (push: { title: string; body: string; url: string | null; tag: string | null }) => void;
}

/** Canal de Android con importancia alta: el aviso baja desde arriba y suena. */
const CHANNEL_ID = 'vybe';

/** Quien apagó los avisos en su perfil no quiere que se vuelvan a encender solos. */
const OPT_OUT_KEY = 'vybe_pushOff';
/** El permiso se pide solo una vez sin que nadie lo pida. */
const ASKED_KEY = 'vybe_pushAsked';

let currentToken: string | null = null;
let handlers: NativePushHandlers | null = null;
let listenersReady: Promise<void> | null = null;

const readFlag = (key: string): boolean => {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};

const writeFlag = (key: string, value: boolean): void => {
  try {
    if (value) window.localStorage.setItem(key, 'true');
    else window.localStorage.removeItem(key);
  } catch {
    // Sin almacenamiento sólo se pierde recordar la preferencia.
  }
};

/** Token con el que este teléfono está registrado ahora mismo. */
export const nativePushToken = (): string | null => currentToken;

export const setNativePushHandlers = (next: NativePushHandlers | null): void => {
  handlers = next;
};

/**
 * Escuchadores y canal, una sola vez y lo antes posible: si la app se abrió
 * tocando un aviso, Capacitor guarda ese toque hasta que alguien lo escucha.
 */
export const initNativePush = (): Promise<void> => {
  if (!isNative()) return Promise.resolve();
  if (listenersReady) return listenersReady;

  listenersReady = (async () => {
    try {
      // Se desestructura aquí dentro: devolver el plugin desde una promesa deja
      // la promesa colgada (el plugin es un Proxy que dice tener `.then`).
      const { PushNotifications } = await import('@capacitor/push-notifications');

      await PushNotifications.addListener('registration', (token) => {
        currentToken = token.value;
        void saveToken(token.value);
      });

      await PushNotifications.addListener('registrationError', (error) => {
        console.error('No se pudo registrar el dispositivo:', error);
      });

      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const url = action.notification.data?.url;
        if (typeof url === 'string' && url.startsWith('/')) handlers?.onOpen(url);
      });

      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const url = notification.data?.url;
        const tag = notification.data?.tag;
        handlers?.onForeground({
          title: notification.title ?? 'Vybe',
          body: notification.body ?? '',
          url: typeof url === 'string' && url.startsWith('/') ? url : null,
          tag: typeof tag === 'string' ? tag : null,
        });
      });

      if (platform() === 'android') {
        await PushNotifications.createChannel({
          id: CHANNEL_ID,
          name: 'Vybe',
          description: 'Mensajes, vybe matches y avisos de tus eventos',
          importance: 5,
          visibility: 1,
          vibration: true,
        });
      }
    } catch (error) {
      console.error('No se pudieron preparar las notificaciones:', error);
    }
  })();

  return listenersReady;
};

/**
 * Registra el teléfono si hay permiso.
 *
 * Con `ask`, pide el permiso si aún no se ha contestado. Sin él, sólo renueva
 * el registro de quien ya dijo que sí: al abrir la app, al iniciar sesión con
 * otra cuenta en el mismo móvil o si Firebase ha cambiado el token.
 */
export const syncNativePush = async ({ ask }: { ask: boolean }): Promise<boolean> => {
  if (!isNative()) return false;

  try {
    await initNativePush();
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const status = await PushNotifications.checkPermissions();
    let granted = status.receive === 'granted';

    if (!granted && ask && status.receive !== 'denied') {
      writeFlag(ASKED_KEY, true);
      const asked = await PushNotifications.requestPermissions();
      granted = asked.receive === 'granted';
    }

    if (!granted) return false;

    // El token llega por el escuchador `registration`, que lo guarda.
    await PushNotifications.register();
    return true;
  } catch (error) {
    console.error('Error registrando las notificaciones:', error);
    return false;
  }
};

/**
 * Lo que hace la app al tener sesión: renovar el registro y, la primera vez,
 * pedir el permiso. No insiste: un segundo diálogo molesta y no cambia la
 * respuesta. Quien apagó los avisos desde el perfil no los recupera solo.
 */
export const autoRegisterNativePush = async (): Promise<void> => {
  if (!isNative() || readFlag(OPT_OUT_KEY)) return;
  await syncNativePush({ ask: !readFlag(ASKED_KEY) });
};

/** El interruptor del perfil: pide permiso si hace falta y recuerda que se quiere. */
export const registerNativePush = async (): Promise<boolean> => {
  writeFlag(OPT_OUT_KEY, false);
  return syncNativePush({ ask: true });
};

/** ¿Llegan avisos a este teléfono? Permiso concedido y token guardado. */
export const isNativePushEnabled = async (): Promise<boolean> => {
  if (!isNative() || readFlag(OPT_OUT_KEY)) return false;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const status = await PushNotifications.checkPermissions();
    return status.receive === 'granted' && currentToken !== null;
  } catch {
    return false;
  }
};

/** Guarda el token en el servidor, asociado al perfil que tiene la sesión. */
const saveToken = async (token: string): Promise<void> => {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;

  const { error } = await supabase.rpc('save_native_push_token', {
    p_token: token,
    p_platform: platform() === 'ios' ? 'ios' : 'android',
    p_device_model: navigator.userAgent.slice(0, 120),
  });

  if (error) console.error('No se pudo guardar el token de notificaciones:', error);
};

/**
 * Retira el token del servidor.
 *
 * Al cerrar sesión, porque si no quien entrase después en ese mismo teléfono
 * recibiría los avisos de la persona anterior. Con `optOut`, además, recuerda
 * que se han apagado a propósito desde el perfil.
 *
 * Tiene que ir antes de `signOut()`: sin sesión, la función no sabe de quién es
 * el token y no lo borra.
 */
export const unregisterNativePush = async ({ optOut = false }: { optOut?: boolean } = {}): Promise<void> => {
  if (!isNative()) return;
  if (optOut) writeFlag(OPT_OUT_KEY, true);
  if (!currentToken) return;

  try {
    await supabase.rpc('remove_native_push_token', { p_token: currentToken });
  } catch (error) {
    console.error('No se pudo retirar el token de notificaciones:', error);
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    // Que no se puedan limpiar los avisos ya entregados no es grave.
  }

  currentToken = null;
};

/**
 * Matches que la propia pantalla ya ha celebrado. Quien da el like que cierra
 * el match ve la animación al momento y, un segundo después, le llega también
 * el aviso: sin esto lo vería dos veces.
 */
const celebrated = new Map<string, number>();

export const markMatchCelebrated = (profileId: string): void => {
  celebrated.set(profileId, Date.now());
};

export const wasMatchCelebrated = (profileId: string): boolean => {
  const at = celebrated.get(profileId);
  return at !== undefined && Date.now() - at < 60_000;
};
