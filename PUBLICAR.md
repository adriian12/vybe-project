# Publicar Vybe

Lista de lo que falta para tener Vybe en producción: la landing en `vybes.es`,
la web de locales y administración en `app.vybes.es` y las apps de clubbers en
Google Play y App Store.

Cada punto dice **quién** lo hace: 🧑 tú (cuentas, pagos, paneles, DNS) o 🤖
código ya hecho / que se puede hacer desde el repositorio.

## Estado a 17/09/2026

Hecho, y por eso algunos puntos de abajo ya no aplican:

- ✅ DNS de `vybes.es` hacia Vercel (A y CNAME de `www` y `app`).
- ✅ Resend: dominio verificado (envío y recepción), webhook con
  `email.received`.
- ✅ Secretos en Supabase: `RESEND_WEBHOOK_SECRET`, `RESEND_FULL_API_KEY`,
  `INBOUND_FORWARD_TO` (el Gmail de avisos), `INBOUND_FORWARD_FROM`,
  `AUTH_FROM_EMAIL` (`hola@vybes.es`), `SOS_FROM_EMAIL`, `APP_URL`
  (`https://app.vybes.es`), `LEADS_NOTIFY_EMAIL`, `VAPID_SUBJECT`.
- ✅ Auth de Supabase: Site URL `https://app.vybes.es` y Redirect URLs (con
  `vybe://**`).
- ✅ `SUPABASE_ACCESS_TOKEN` y `VITE_CARTO_API_KEY` en `.env`; mapa de CARTO
  funcionando.
- ✅ Capacitor 8 (API 36), `com.vybe.app`, `google-services.json` en
  `android/app/`.
- ✅ `pg_graphql` desactivado.

**Recuerda:** en Vercel sólo van las variables `VITE_*`. Los secretos de las
Edge Functions (`RESEND_*`, `INBOUND_*`, `AUTH_FROM_EMAIL`, `APP_URL`, `FCM_*`,
`STRIPE_*`…) viven en Supabase.

---

## 0. Cómo queda montado

| Dominio | Qué sirve | Quién entra |
|---------|-----------|-------------|
| `vybes.es` (y `www.` → redirige) | Landing y textos legales. Cualquier otra ruta se manda a `app.vybes.es` | Público |
| `app.vybes.es` | Panel de local y de administración. Las pantallas de clubber muestran «Vybe se vive desde el móvil» | Locales y admins |
| App Android / iOS | Toda la app de clubbers (y también el panel de local) | Clubbers |

- 🤖 Lo decide `src/lib/hosts.ts` según el dominio. En `localhost` y en las
  previews de Vercel se ve todo, para desarrollar.
- 🤖 En `app.vybes.es`: `/` abre el acceso de locales, el registro sólo es de
  local y el acceso de administración está en un enlace discreto bajo el login.
- 🤖 Un solo proyecto de Vercel sirve los dos dominios (`vercel.json`: SPA,
  `www` → `vybes.es`, cabeceras de seguridad, caché, `noindex` en `app.`).
- 🤖 Los enlaces que se comparten (`VITE_SITE_URL`) y los de los correos van a
  `app.vybes.es`; con App Links / Universal Links se abren en la app si está
  instalada (sección 6).

---

## 1. Vercel y dominios

1. 🧑 **Plan Pro de Vercel.** El equipo «Rojas projects» está en Hobby, y
   Hobby [sólo permite uso no comercial](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage).
   Vybe cobra a locales: hace falta Pro (20 $/mes por miembro).
2. 🧑 **Crear el proyecto** en Vercel importando `adriian12/vybe-project`
   (rama `main`). Framework Vite; build y salida ya vienen en `vercel.json`.
   *(Se puede hacer desde aquí con el MCP de Vercel cuando lo digas.)*
3. 🧑 **Variables de entorno** del proyecto (Production y Preview):

   | Variable | Valor |
   |----------|-------|
   | `VITE_SUPABASE_URL` | `https://vipixvfplxownccuhrme.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | la de tu `.env` |
   | `VITE_VAPID_PUBLIC_KEY` | la de tu `.env` |
   | `VITE_SENTRY_DSN` | la de tu `.env` |
   | `VITE_SITE_URL` | `https://app.vybes.es` |
   | `VITE_LANDING_URL` | `https://vybes.es` |
   | `VITE_APP_URL` | `https://app.vybes.es` |
   | `VITE_CARTO_API_KEY` | la clave de CARTO (sección 4) |
   | `VITE_PLAY_STORE_URL` / `VITE_APP_STORE_URL` | vacías hasta publicar |

   **No** van en Vercel `FCM_*`, `RESEND_*`, `STRIPE_*`, `TWILIO_*` ni ningún
   otro secreto sin `VITE_`: son de las Edge Functions y viven en Supabase. La
   web sólo necesita las `VITE_*`.

4. 🧑 **Dominios** en el proyecto: `vybes.es`, `www.vybes.es` y `app.vybes.es`.
5. 🧑 **DNS** en el registrador, con los valores exactos que muestre Vercel
   (suelen ser estos):

   | Tipo | Nombre | Valor |
   |------|--------|-------|
   | A | `@` | `76.76.21.21` |
   | CNAME | `www` | `cname.vercel-dns.com` |
   | CNAME | `app` | `cname.vercel-dns.com` |

6. 🧑 **Lovable.** El repositorio sigue conectado a Lovable (hace commits como
   `gpt-engineer-app[bot]`). Despublica la web de Lovable y desconecta la
   sincronización con GitHub, o un cambio desde allí puede pisar lo que se
   despliega en Vercel.

---

## 2. Supabase

1. 🧑 **Token de acceso.** Se perdió al reconstruir `.env`. Crea uno nuevo en
   <https://supabase.com/dashboard/account/tokens> (con la cuenta que aloja
   Vybe) y ponlo como `SUPABASE_ACCESS_TOKEN` en `.env`. Sin él no funcionan
   `npm run functions:deploy`, `secrets:push` ni `scripts/run-sql.mjs`.
2. 🧑 **Revisa `.env` antes de `secrets:push`.** Salió de copias del 9 y 10 de
   septiembre. Faltan `RESEND_WEBHOOK_SECRET`, `STRIPE_PRICE_VENUE_PRO`,
   `STRIPE_PRICE_VENUE_BUSINESS`, `VITE_ANALYTICS_URL` y
   `VITE_FACE_VERIFICATION_URL` (las dos últimas son opcionales). Un
   `secrets:push` con valores viejos pisaría los buenos.
3. 🧑 **Authentication → URL Configuration:**
   - Site URL: `https://app.vybes.es`
   - Redirect URLs: `https://app.vybes.es/**`, `https://vybes.es/**`,
     `vybe://**`, `http://localhost:5173/**`
4. 🧑 **Edge Functions → Secrets** (o `.env` + `npm run secrets:push`):

   | Secreto | Valor |
   |---------|-------|
   | `APP_URL` | `https://app.vybes.es` — **en `.env` está `http://localhost:5173`**, y si es lo que se subió, los enlaces de los correos de verificación y del pago llevan a localhost |
   | `AUTH_FROM_EMAIL` | `Vybe <hola@vybes.es>` (tras verificar el dominio en Resend) |
   | `SOS_FROM_EMAIL` | `Vybe <avisos@vybes.es>` |
   | `LEADS_NOTIFY_EMAIL` | el correo que debe recibir las solicitudes de demo |
   | `VAPID_SUBJECT` | `mailto:hola@vybes.es` |
   | `RESEND_WEBHOOK_SECRET` | el *signing secret* del webhook de Resend (sección 3.4) |
   | `RESEND_FULL_API_KEY` | clave de Resend con **Full access** (la actual es sólo de envío y no puede leer correos recibidos) |
   | `INBOUND_FORWARD_TO` | tu Gmail (a donde llegan `soporte@`, `admin@`…) |
   | `INBOUND_FORWARD_FROM` | `Vybe <reenvio@vybes.es>` |

5. 🧑 **Plan Pro de Supabase (25 $/mes).** En el plan gratuito el proyecto se
   pausa tras una semana sin actividad y no hay copias de seguridad diarias.
6. **Avisos de seguridad** (Advisors):
   - 🤖 `pg_graphql` desactivado (migración 038): quita los 36 avisos de tablas
     visibles en GraphQL. La app no lo usa.
   - 🧑 *Leaked password protection* sólo existe en el plan Pro: en el gratuito
     no aparece en Auth → Passwords. Se activa al pasar a Pro.
   - Los 72 avisos de «SECURITY DEFINER ejecutable por authenticated» son
     intencionados (las RPC de la app comprueban permisos dentro).
7. 🤖🧑 **Limpiar datos de prueba** antes de abrir al público:
   `node scripts/run-sql.mjs supabase/seeds/mallorca_test_data_cleanup.sql`
   (50 personas, 20 locales y 30 fiestas inventadas) y borrar las cuentas del
   seed antiguo (`usuario1@test.com`…, `discoteca@test.com`…).

---

## 3. Correo con Resend (`vybes.es`)

1. ✅ Dominio `vybes.es` verificado en Resend (región eu-west-1). DNS en Piensa
   Solutions: DKIM `resend._domainkey`, CNAME `send` y `rsend`, MX `@` →
   `inbound-smtp.eu-west-1.amazonaws.com`.
2. ✅ **DMARC ya existe** (`_dmarc` = `v=DMARC1; p=none;`). Por eso daba error al
   crear otro: sólo puede haber uno. Si quieres informes, **edita** ese registro
   y deja `v=DMARC1; p=none; rua=mailto:avisos@vybes.es`. Con `p=none` no hace
   falta nada más.

3. 🧑 Cuando Resend lo marque como *Verified*, cambia `AUTH_FROM_EMAIL` y
   `SOS_FROM_EMAIL` (sección 2.4). Hasta entonces, con `onboarding@resend.dev`
   los correos **sólo llegan al dueño de la cuenta de Resend**: nadie más recibe
   el de verificación y no puede entrar.
4. ✅ **Webhook** creado en Resend →
   `https://vipixvfplxownccuhrme.supabase.co/functions/v1/resend-webhook`, con
   `email.delivered`, `email.bounced`, `email.complained`,
   `email.delivery_delayed` y **`email.received`**. Su *signing secret*
   (`RESEND_WEBHOOK_SECRET`) y la clave *Full access* (`RESEND_FULL_API_KEY`) ya
   están en `.env`. 🧑 **Falta subirlos a Supabase**: hasta entonces la función
   responde `NOT_CONFIGURED`. No uses `npm run secrets:push` con el `.env`
   reconstruido (sube todo, también valores viejos): sube sólo esas claves.
5. **Correos `soporte@`, `admin@`, `hola@`…** No hay que crearlos:
   - **Enviar** desde cualquier dirección de `vybes.es` ya funciona.
   - **Recibir:** el MX apunta a Resend, así que llega todo lo que se mande a
     cualquier dirección del dominio (Resend → Emails → *Receiving*).
   - 🤖 `resend-webhook` los **reenvía a tu Gmail** con `Reply-To` al remitente:
     contestas desde Gmail y le llega a él. Necesita en Supabase
     `RESEND_FULL_API_KEY` (clave *Full access*: Resend → API Keys),
     `INBOUND_FORWARD_TO` e `INBOUND_FORWARD_FROM`.
   - Ojo: con el MX en Resend **no** se puede usar a la vez Google Workspace o
     Zoho para el mismo dominio. Si algún día quieres buzones de verdad, mueve la
     recepción de Resend a un subdominio.
   - 🤖 Cambia `COMPANY.email` en `src/lib/company.ts` cuando decidas la dirección
     pública (p. ej. `soporte@vybes.es`).

---

## 4. Mapa (CARTO)

- 🤖 Hecho: las teselas llevan `?key=` si hay `VITE_CARTO_API_KEY`; sin clave
  el mapa sale sin teselas en vez de con la marca de agua «API KEY REQUIRED».
- 🧑 Pide la clave en <https://carto.com/basemaps/apikey> (gratis, 5 millones
  de teselas al mes, uso comercial permitido; llega por correo al momento).
  **No es** el *API Access Token* del Workspace de CARTO (empieza por `eyJ`):
  ese es privado, lo usa el MCP de CARTO y está en `CARTO_API_TOKEN`. Si alguien
  lo pone en `VITE_CARTO_API_KEY`, `vite.config.ts` para la compilación.
- 🧑 Ponla en `.env` (para el APK) y en Vercel.

---

## 5. Pagos (Stripe)

1. 🧑 **Activar la cuenta en modo real.** Ahora es de pruebas (`sk_test_`).
   Stripe pedirá datos fiscales y bancarios (alta como autónomo antes de
   cobrar).
2. 🧑 Crear en modo real los productos y precios: Premium mensual, por evento y
   de por vida, y **los planes de local Pro y Business** (`STRIPE_PRICE_VENUE_PRO`
   y `STRIPE_PRICE_VENUE_BUSINESS`, que ahora no existen: el botón de cambiar de
   plan del panel responde «cobro no configurado»). Precios definidos, también
   para la landing, que ahora dice «Consúltanos».
3. 🧑 Webhook de modo real → `https://vipixvfplxownccuhrme.supabase.co/functions/v1/stripe-webhook`
   con `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.deleted` e `invoice.payment_failed`. Nuevo
   `STRIPE_WEBHOOK_SECRET`.
4. ⚠️ **Premium dentro de las apps.** Apple (guía 3.1.1) y Google Play obligan a
   cobrar el contenido digital con su propio sistema de pago. Vybe Premium se
   cobra con Stripe dentro de la app: **las dos tiendas lo rechazarían**.
   Opciones: integrar compras in-app (RevenueCat simplifica las dos tiendas) o
   quitar la compra de Premium de las apps. Los planes de local, que se pagan en
   la web, no tienen este problema. **Decisión tuya.**

---

## 6. App Android (Google Play)

1. 🧑 **Cuenta de desarrollador** de Google Play (25 $, pago único).
   - Cuenta **personal**: antes de publicar hay que pasar una prueba cerrada con
     **12 testers durante 14 días seguidos**.
   - Cuenta de **organización** (necesita D-U-N-S): no tiene ese requisito.
2. 🤖 **API 36: hecho.** Desde el 31/08/2026 Google Play
   [rechaza apps nuevas y actualizaciones que no apunten a Android 16 (API 36)](https://support.google.com/googleplay/android-developer/answer/11926878).
   Vybe ya está en **Capacitor 8** (`targetSdkVersion 36`, `minSdkVersion 24`,
   AGP 8.13, Gradle 8.14.3). Compila con **JDK 21**: `npm run native:apk` lo busca
   solo (`scripts/java21.mjs`) sin tocar el Java del sistema.
3. 🧑🤖 **Firma de release.** Ahora sólo se genera un APK de depuración.
   - Crear la clave de subida con
     `keytool -genkeypair -v -keystore vybe-upload.jks -alias vybe -keyalg RSA -keysize 2048 -validity 10000`.
   - Guárdala fuera del repositorio, con copia de seguridad y la contraseña en un
     gestor.
   - 🤖 Configurar `bundleRelease` para generar el AAB firmado.
   - Activar *Play App Signing*.
4. 🧑 **Firebase con el paquete de la app.** La app de Android es
   `es.fiestea.app`, igual que en iOS, y no se podrá cambiar tras la primera
   subida. El `google-services.json` actual sólo conoce los paquetes antiguos, y
   con otro paquete el plugin de Google Services para la compilación: **hasta
   poner el nuevo no se puede generar el APK**.
   - Consola de Firebase, proyecto `party-vybe-app` → *Configuración del
     proyecto* → *Añadir app* → Android.
   - Paquete `es.fiestea.app`, apodo «Fiestea».
   - Huella SHA-1 de la clave de depuración (la de `npm run native:apk`):
     `40:5D:6A:7D:2C:AC:1F:FE:7C:45:14:FB:F9:B3:6A:8E:F0:BD:F5:BF`.
   - Descarga el `google-services.json` en `android/app/`.
   - Las credenciales de servidor (`FCM_*`) no cambian: es el mismo proyecto.
   - Borra las apps antiguas (`com.vybe.app`, `party.vybe.app`) de Firebase
     cuando la nueva funcione, y cambia el nombre visible del proyecto a
     «Fiestea» (*Configuración del proyecto* → *Nombre público*; el ID
     `party-vybe-app` no se puede cambiar).
5. 🧑 **Ficha y formularios:**
   - Política de privacidad (`https://fiestea.es/legal/privacidad`).
   - *Data safety*: ubicación, fotos, correo, teléfono, mensajes.
   - Clasificación de contenido y público objetivo **18+**.
   - Instrucciones de acceso para revisión: una cuenta de prueba y un código de
     fiesta que funcione.
   - Capturas de pantalla.
6. 🤖🧑 **App Links.** El manifiesto ya abre en la app las rutas de
   `app.fiestea.es`. Falta publicar `public/.well-known/assetlinks.json` con la
   huella SHA-256 de la clave de firma de Play (Play Console → Integridad de la
   app → Firma de apps):

   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "es.fiestea.app",
       "sha256_cert_fingerprints": ["AA:BB:…"]
     }
   }]
   ```

7. 🧑 **Avisos push:** con el `google-services.json` nuevo (punto 4), probar un
   aviso real en un teléfono antes de publicar.
8. 🧑 **Desinstala la app vieja** del teléfono: `party.vybe.app` y
   `es.fiestea.app` son para Android dos apps distintas y pueden convivir.

---

## 7. App iOS (App Store)

1. 🧑 **Apple Developer Program** (99 $/año) y **un Mac con Xcode**: sin Mac
   no se puede compilar ni subir.
2. 🧑 Registro de la app en App Store Connect con el mismo identificador que
   Android.
3. 🧑 **Avisos push:** subir la clave APNs a Firebase y añadir
   `GoogleService-Info.plist`.
4. 🧑 **Universal Links.** El archivo de derechos ya pide `applinks:app.vybes.es`.
   Falta publicar `public/.well-known/apple-app-site-association` con tu Team
   ID:

   ```json
   { "applinks": { "details": [{ "appIDs": ["TEAMID.com.vybe.app"],
     "components": [{ "/": "/event/*" }, { "/": "/u/*" }, { "/": "/chat/*" },
       { "/": "/matches*" }, { "/": "/auth/verify-email*" }, { "/": "/auth/reset-password*" }] }] } }
   ```

5. 🧑 **Revisión de Apple:**
   - Etiquetas de privacidad.
   - Cuenta de demo y un código de fiesta válido.
   - Contenido generado por usuarios (1.2): denunciar, bloquear y moderar ya
     existen.
   - Borrado de cuenta dentro de la app (5.1.1): ya existe.
   - Pagos in-app (sección 5.4).
   - Clasificación 18+.

---

## 8. Legal y empresa

1. 🧑 **Revisión por abogado** de privacidad y términos: `src/pages/LegalPage.tsx`
   es una plantilla.
2. 🧑 **Evaluación de impacto (EIPD).** Vybe trata ubicación, verificación facial
   (dato biométrico, categoría especial) y datos de ocio nocturno: el RGPD la
   exige antes de empezar. Registro de actividades de tratamiento y contratos de
   encargado con Supabase, Resend, Twilio, Sightengine, Sentry, Stripe, Google
   (Firebase) y CARTO.
3. 🧑 **Alta fiscal** (autónomo o sociedad) antes de cobrar, y aviso legal con
   los datos del titular (ya salen de `src/lib/company.ts`).
4. 🧑 **Marca.** Comprobar y registrar «Vybe» en la OEPM/EUIPO: tener el dominio
   no protege el nombre.

---

## 9. Servicios que conviene revisar

- 🧑 **Twilio:** el número de envío es alemán (`+49`). Para SMS a España valora
  un remitente alfanumérico o Twilio Verify, y revisa el coste por SMS.
- 🧑 **Sightengine:** comprobar que el plan aguanta el volumen de fotos
  previsto.
- 🧑 **Sentry:** crear alertas de errores nuevos y de picos.
- 🧑 **Monitor de disponibilidad** (UptimeRobot o similar) para `vybes.es`,
  `app.vybes.es` y la Edge Function `auth-email`.

---

## Orden recomendado

1. **Esta semana (web):** secciones 1, 2, 3 y 4. Con eso `vybes.es` capta
   locales, `app.vybes.es` les deja registrarse y los correos llegan a
   cualquiera.
2. **Antes de dar de alta locales de pago:** sección 5 (Stripe real y planes de
   local), 2.7 (limpiar datos de prueba) y 8.
3. **Antes de las tiendas:**
   - `google-services.json` para `com.vybe.app` (6.4) y decidir los pagos de
     Premium (5.4).
   - Configurar la firma (6.3). Capacitor 8 / API 36 ya está hecho (6.2).
   - Prueba cerrada de 14 días (6.1) y, en paralelo, iOS (7).
