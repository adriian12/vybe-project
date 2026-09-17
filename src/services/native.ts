import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

/**
 * Puente con el contenedor nativo.
 *
 * El mismo código corre en el navegador y dentro de la aplicación de Android y
 * de iOS. Lo que cambia es de dónde salen la cámara, la ubicación y las
 * notificaciones: en la web las da el navegador, y en el móvil el sistema
 * operativo, que además pide los permisos a su manera.
 *
 * Todo lo de aquí comprueba primero si hay contenedor nativo. En el navegador
 * las funciones no hacen nada y el código de siempre sigue funcionando, así que
 * no hay dos versiones de cada pantalla.
 */

/** ¿Corremos dentro de la aplicación instalada, y no en el navegador? */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** `ios`, `android` o `web`. */
export const platform = (): string => Capacitor.getPlatform();

/**
 * Prepara la pantalla al arrancar: quita el splash y ajusta la barra de estado.
 *
 * Se importa de forma perezosa para que el navegador no cargue código nativo
 * que no va a usar nunca.
 */
export const setupNativeShell = async (): Promise<void> => {
  if (!isNative()) return;

  try {
    const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
      import('@capacitor/splash-screen'),
      import('@capacitor/status-bar'),
    ]);

    await StatusBar.setStyle({ style: Style.Dark });

    if (platform() === 'android') {
      // El lienzo del sistema de diseño: la barra de estado se funde con la
      // cabecera en vez de dibujar una franja de otro negro. Sólo hasta
      // Android 14: desde el 15 la app va de borde a borde y la barra es
      // transparente sobre el propio fondo (`capacitor.config.ts`, SystemBars).
      await StatusBar.setBackgroundColor({ color: '#111114' });
    }

    await SplashScreen.hide();
  } catch (error) {
    // Que falle el aspecto no puede impedir que la aplicación arranque.
    console.error('No se pudo preparar la interfaz nativa:', error);
  }
};

/**
 * Botón atrás de Android.
 *
 * Sin esto, la primera pulsación cierra la aplicación entera aunque estés en la
 * quinta pantalla, que es de las cosas que peor sientan.
 */
export const setupBackButton = async (onBack: () => boolean): Promise<() => void> => {
  if (platform() !== 'android') return () => undefined;

  try {
    const { App } = await import('@capacitor/app');
    const listener = await App.addListener('backButton', () => {
      // El manejador devuelve `true` si ya ha hecho algo; si no, se sale.
      if (!onBack()) void App.exitApp();
    });

    return () => void listener.remove();
  } catch {
    return () => undefined;
  }
};

/**
 * Enlaces que abren la aplicación instalada.
 *
 * Cuando alguien toca `https://app.vybes.es/event/…` —en un cartel, en un correo,
 * en un mensaje— con la aplicación instalada, Android e iOS la abren en lugar
 * del navegador. Lo que llega es la URL entera; aquí se queda sólo el camino,
 * porque el resto de la aplicación navega por rutas y no por dominios.
 *
 * Devuelve una función para dejar de escuchar.
 */
export const setupDeepLinks = async (onOpen: (path: string) => void): Promise<() => void> => {
  if (!isNative()) return () => undefined;

  try {
    const { App } = await import('@capacitor/app');

    const abrir = (url: string) => {
      try {
        const { pathname, search, hash } = new URL(url);
        onOpen(`${pathname}${search}${hash}`);
      } catch {
        // Un esquema propio como `vybe://event/123` no siempre se deja parsear
        // como URL: se toma lo que va después del esquema.
        const resto = url.split('://')[1];
        if (resto) onOpen(`/${resto.replace(/^\/+/, '')}`);
      }
    };

    // Si la aplicación estaba cerrada, la URL no llega por el evento sino en
    // el estado de arranque.
    const inicio = await App.getLaunchUrl();
    if (inicio?.url) abrir(inicio.url);

    const listener = await App.addListener('appUrlOpen', (event) => abrir(event.url));
    return () => void listener.remove();
  } catch (error) {
    console.error('No se pudieron preparar los enlaces directos:', error);
    return () => undefined;
  }
};

export interface NativePosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

/**
 * Ubicación por el sistema operativo.
 *
 * El plugin pide el permiso con el diálogo nativo, que es lo que espera la
 * tienda de aplicaciones, y funciona con el GPS del teléfono en vez de con la
 * aproximación del navegador.
 */
export const getNativePosition = async (): Promise<NativePosition | null> => {
  if (!isNative()) return null;

  const { Geolocation } = await import('@capacitor/geolocation');

  const permission = await Geolocation.checkPermissions();
  if (permission.location !== 'granted') {
    const asked = await Geolocation.requestPermissions();
    if (asked.location !== 'granted') {
      throw new Error('LOCATION_DENIED');
    }
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 15000,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
};

/**
 * Foto con la cámara del sistema.
 *
 * Devuelve el mismo `data:` que produce el componente web, para que quien la
 * usa no tenga que distinguir de dónde vino.
 */
export const takeNativePhoto = async (): Promise<string | null> => {
  if (!isNative()) return null;

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    // Cámara y sólo cámara: la foto del evento tiene que ser de esta noche, y
    // dejar elegir de la galería vaciaría de sentido toda la función.
    source: CameraSource.Camera,
    direction: 'FRONT' as never,
    saveToGallery: false,
  });

  return photo.dataUrl ?? null;
};

/** Foto desde la galería. Sólo para las del perfil, y sólo con Premium. */
export const pickNativePhoto = async (): Promise<string | null> => {
  if (!isNative()) return null;

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Photos,
  });

  return photo.dataUrl ?? null;
};

/** Abre un enlace externo en el navegador del sistema, no dentro de la app. */
export const openExternal = async (url: string): Promise<void> => {
  if (!isNative()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
};

/**
 * Renovación del token con la app en segundo plano.
 *
 * El temporizador que renueva la sesión se congela cuando la app no está en
 * pantalla. Al volver, se reanuda enseguida para que la primera petición no
 * salga con un token caducado; al irse, se para para no gastar batería.
 */
export const setupAuthRefreshOnResume = async (): Promise<void> => {
  if (!isNative()) return;

  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
  } catch (error) {
    console.error('No se pudo vigilar el estado de la app:', error);
  }
};
