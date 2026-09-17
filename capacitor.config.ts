import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuración de la aplicación nativa (Capacitor 8: Android 16 / API 36, iOS 15).
 *
 * Capacitor envuelve el mismo código de la web en un contenedor de Android y de
 * iOS, así que no hay dos aplicaciones que mantener: lo que se arregla aquí se
 * arregla en las tres.
 *
 * `appId` es el identificador con el que la aplicación vive en las tiendas y no
 * se puede cambiar una vez publicada.
 */
const config: CapacitorConfig = {
  appId: 'com.vybe.app',
  appName: 'Vybe',
  webDir: 'dist',

  // El teclado no debe empujar la pantalla entera hacia arriba: en el chat, eso
  // deja el mensaje que estás escribiendo fuera de la vista.
  android: {
    allowMixedContent: false,
  },

  ios: {
    contentInset: 'always',
    // La barra de estado se dibuja sobre el contenido, así que el diseño ya
    // reserva su espacio con `safe-area-inset-top`.
    limitsNavigationsToAppBoundDomains: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#111114',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },

    PushNotifications: {
      // El icono y el sonido los pone el sistema; `badge` sólo tiene efecto en
      // iOS, donde el número del icono es lo que trae a la gente de vuelta.
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // Android 15 y 16 dibujan la app de borde a borde: la barra de estado ya no
    // tiene color propio y el contenido pasa por debajo. SystemBars (incluido en
    // Capacitor 8) expone los márgenes como `--safe-area-inset-*`, que es lo que
    // usan `.pt-safe` y `.pb-safe`.
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
    },

    // Sólo tiene efecto hasta Android 14.
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#111114',
    },
  },
};

export default config;
