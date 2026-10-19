# Android e iOS

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- **Los avisos del teléfono no salen sin Firebase.** El registro del token está
  hecho, pero hasta que no haya `google-services.json` y credencial de servidor,
  `send-push` sólo llega a quien use la aplicación desde el navegador.
  `android/app/google-services.json` es del proyecto de Firebase `party-vybe-app`
  y tiene que incluir la app Android `es.fiestea.app` (el `applicationId`); el
  que hay ahora sólo trae `com.vybe.app` y `party.vybe.app`, así que hasta
  sustituirlo el APK no compila. Tiene que estar **en `android/app/`**:
  en la raíz de `vybe-project` Gradle no lo ve y además no está en `.gitignore`.
  Si su paquete no coincide con `applicationId`, el plugin de Google Services
  rompe la compilación. No hace falta `firebase-analytics` (lo que propone la
  consola de Firebase): los avisos usan `firebase-messaging` del plugin de push.
- **Android compila con JDK 21, pero el Java del sistema es el 17** (lo usan
  otros proyectos). `npm run native:apk` busca un 21 con `scripts/java21.mjs`
  (`VYBE_JAVA_HOME`, Android Studio, `~/.jdks/jdk-21*`) y sólo lo pone en el
  `JAVA_HOME` de Gradle. Si lanzas `gradlew` a mano, ponle tú ese `JAVA_HOME`.
- **Android 15+ va de borde a borde.** La barra de estado ya no tiene color:
  la web se dibuja debajo. Los márgenes llegan como `--safe-area-inset-*` (plugin
  SystemBars de Capacitor 8, `insetsHandling: 'css'`) y `.pt-safe`/`.pb-safe` los
  usan con `env()` de respaldo. Una barra fija nueva tiene que usar esas clases.
  **El contenido no se separa con `pt-16`/`pb-24` a secas**: la cabecera y el
  menú crecen con la zona segura, así que se usan `--header-h` y `--nav-h`
  (`index.css`): `pt-[var(--header-h)]`, `pb-[calc(var(--nav-h)+2rem)]`,
  `bottom-[var(--nav-h)]`. Con márgenes fijos, en móviles con WebView 140+ la
  cabecera tapaba la primera fila y el menú los botones del swipe.
  Con WebView anteriores a la 140, Capacitor aparta la web de las barras con
  relleno y lo que se ve detrás es el `windowBackground` del tema
  (`res/values/colors.xml`, `#111114`): sin él salían blancas y no se leía la
  hora. El aviso «Error injecting safe area CSS» del arranque es inofensivo.
- **Nunca devolver un plugin de Capacitor desde una promesa**
  (`import(...).then((m) => m.Preferences)`). El plugin es un Proxy: JavaScript
  le pregunta por `.then`, Capacitor contesta «not implemented» y la promesa no
  se resuelve nunca. Así se quedó la app en el cargador sin llegar al login. Se
  desestructura el módulo con `await` donde se usa
  (`src/integrations/supabase/auth-storage.ts`).
- **La app instalada no registra service worker** (`use-pwa.ts`) y quita el que
  hubiera (`native.ts`): los ficheros ya van en el APK y uno instalado serviría
  la versión vieja tras actualizar.
- **iOS necesita un Mac.** El proyecto se genera desde aquí, pero compilarlo y
  firmarlo exige Xcode. Sigue la plantilla de Capacitor 8 (ciclo de vida con
  `SceneDelegate`) y ya enlaza `App.entitlements` (Associated Domains y push):
  el App ID de Apple necesita esas dos capacidades. En Windows `cap sync` no
  ejecuta `pod install`: hazlo en el Mac antes de abrir Xcode.
- **Identificador de iOS: `es.fiestea.ios`** (Android sigue `es.fiestea.app`).
  `es.fiestea.app` quedó anclado para siempre en la cuenta de Apple anterior
  al borrar allí la app sin publicar. Los productos de compra siguen llamándose
  `es.fiestea.app.*`. **Pendiente al activar la cuenta nueva:** el Team ID en
  `public/.well-known/apple-app-site-association` (aún `XQ5WB5Y646`, el de la
  cuenta antigua), `APP_STORE_APPLE_ID` y la clave de App Store Connect en
  `codemagic.yaml`, el Client ID `es.fiestea.ios` en el proveedor Apple de
  Supabase, el bundle ID del cliente OAuth de iOS en Google Cloud y la app de
  iOS en Firebase (clave APNs y `GoogleService-Info.plist`).
