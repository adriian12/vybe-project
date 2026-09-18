# Guía de configuración — Vybe App

## 1. Proyecto Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **Settings > API** copia la *Project URL* y la *anon/public key*.

## 2. Variables de entorno

Copia `.env.example` a `.env.local` y rellena los valores:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

`.env` y `.env.local` están en `.gitignore`. **No los subas al repositorio**: la
anon key identifica tu proyecto y, aunque está pensada para ser pública, tenerla
en el historial complica rotarla.

## 3. Migraciones SQL

En **SQL Editor**, ejecuta los archivos de `supabase/migrations/` **en orden**:

| Orden | Archivo | Qué hace |
|-------|---------|----------|
| 1 | `001_initial_schema.sql` | Tablas, índices y policies iniciales |
| 2 | `002_helper_functions.sql` | Funciones auxiliares (distancia, bloqueos…) |
| 3 | `003_enable_realtime.sql` | Realtime para `messages` |
| 4 | `006_security_and_event_flow.sql` | **Obligatoria.** Corrige la seguridad y crea el flujo real de acceso a eventos |
| 5 | `007_product_features.sql` | **Obligatoria.** Intereses, grupos, moderación, SOS, push, límites de uso, RGPD, equipos de local y métricas |
| 6 | `008_reconcile_existing_data.sql` | Da de alta en `profiles`/`venues` las cuentas que ya existían y normaliza `premium_subscriptions` |
| 7 | `009_lock_down_functions.sql` | Cierra el acceso de `anon` a las funciones y retira una vista heredada que se saltaba las policies |
| 8 | `010_fix_unique_constraints.sql` | **Obligatoria.** Restricción única de `connections`, sin la cual no se crea ningún match |
| 9 | `011_scope_venue_metrics.sql` | **Obligatoria.** Impide que un local lea las métricas de otro |
| 10 | `012_minimal_authenticated_surface.sql` | Deja al alcance del cliente sólo las funciones que usa la aplicación |
| 11 | `013_restore_foreign_keys.sql` | **Obligatoria.** Claves foráneas sin las cuales la pantalla de conexiones sale vacía |
| 12 | `014_rate_limit_only_for_sessions.sql` | El límite de uso deja de bloquear las escrituras del servidor |
| 13 | `015_gender_groups_chat_and_places.sql` | Género y preferencias, chat de grupo, foto del evento y localidades |
| 14 | `016_restore_active_event.sql` | Recuperar el evento en curso al volver a entrar |
| 15 | `017_event_photo_required_and_phone_gate.sql` | La foto del evento pasa a ser obligatoria; el teléfono se exige para SOS y denuncias |
| 16 | `018_event_photo_is_mutual.sql` | Sin foto tampoco se ve a nadie |
| 17 | `019_promoters_capacity_recurrence.sql` | Códigos por RRPP con atribución, aforo en vivo, eventos recurrentes y patrocinio |
| 18 | `020_promotions_vouchers_venue_safety.sql` | Promociones y vales, aviso de emergencia al local y moderación de su puerta |
| 19 | `021_venue_analytics_and_subscription.sql` | Demografía, comparativa por noche, curva de abandono y planes de local |
| 20 | `005_create_test_users.sql` | *(opcional)* usuarios de prueba |
| 21 | `004_seed_data.sql` | *(opcional)* perfiles, locales y eventos de prueba |

De la 008 a la 013 corrigen diferencias entre lo que declaran las migraciones y
lo que había de verdad en la base de datos. Si arrancas un proyecto nuevo desde
cero no hacen falta, pero tampoco estorban: todas comprueban antes de actuar.

> **La 006 no es opcional.** Sin ella:
> - cualquiera con la anon key puede listar todos los códigos de acceso activos;
> - las policies de `profiles` entran en recursión infinita (error `42P17`);
> - el registro no crea el perfil y el login responde «Perfil no encontrado»;
> - `get_event_stats()` falla porque referencia una columna que ya no existe.
>
> El orden importa: la 006 instala el trigger que crea perfiles y locales
> automáticamente, y los scripts de seed cuentan con él.
>
> **La 010 y la 013 tampoco son opcionales** si tu base de datos no nació de
> estas migraciones. Sin la 010 el trigger de match falla con «there is no
> unique or exclusion constraint matching the ON CONFLICT specification» y no se
> crea ninguna conexión; sin la 013, `api.getMatches()` no puede resolver el
> embed de perfiles y la pantalla de conexiones aparece vacía aunque el match
> exista.

## 4. Políticas de Storage

Ejecuta `supabase/policies/storage_policies.sql` en el SQL Editor. Crea los
buckets `avatars`, `event-photos` y `documents` con sus permisos.

También puede lanzarlo el workflow `.github/workflows/run-storage-policies.yml`
si defines el secreto `SUPABASE_DATABASE_URL`.

## 5. Autenticación

En **Authentication > URL Configuration**:

- **Site URL**: `http://localhost:5173`
- **Redirect URLs**: `http://localhost:5173/auth/verify-email`

Para producción añade tu dominio con la misma ruta.

En **Authentication > Providers > Email** deja activado *Confirm email*. El
perfil se crea con un trigger de base de datos, así que la confirmación de email
ya no rompe el registro.

## 6. Arrancar

```bash
npm install
npm run dev
```

La app queda en <http://localhost:5173>.

### Probar desde el móvil

```bash
npm run dev:https
```

Sirve por HTTPS con un certificado autofirmado e imprime la dirección de red
(algo como `https://192.168.1.20:5173`). Ábrela desde el móvil conectado a la
misma wifi y acepta el aviso de certificado en «Configuración avanzada».

Ese paso no es cosmético: la cámara —escáner QR y fotos del perfil— y la
geolocalización sólo funcionan en un origen seguro. `localhost` cuenta como
seguro aunque sea HTTP, pero `http://192.168.x.x` no, así que por la red local
hace falta HTTPS de verdad.

### Simular que estás en el evento

Un evento se protege con una geocerca de entre 50 y 500 metros, así que probar
el acceso obliga a estar físicamente en el local. En **desarrollo** la ficha del
evento y la pantalla de acceso denegado muestran un enlace, *Simular que estoy
en el evento*, que fija la posición en las coordenadas del evento y la guarda en
`localStorage` bajo `vybe:dev:mock-position`.

A partir de ahí, `getCurrentPosition()` devuelve esa posición en lugar de
consultar el GPS, y el flujo entero —verificación de proximidad, canje del
código y check-in— se puede recorrer desde el sofá. El mismo enlace la desactiva.

En un build de producción no aparece y las funciones que la leen y escriben no
hacen nada, aunque alguien escriba la clave a mano en el navegador.

## 7. Verificación

Comprueba que existen las tablas:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

Deberías ver 24 tablas, entre ellas: `analytics_events`, `blocks`,
`booking_clicks`, `connections`, `event_attendance`, `event_codes`,
`event_intents`, `events`, `group_members`, `groups`, `interests`, `messages`,
`moderation_queue`, `premium_subscriptions`, `profile_interests`, `profiles`,
`push_subscriptions`, `rate_limits`, `reports`, `sos_alerts`,
`trusted_contacts`, `user_consents`, `venue_members`, `venues`.

Comprueba que Realtime está activo:

```sql
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```

Comprueba que las migraciones 006 y 007 se aplicaron:

```sql
SELECT proname FROM pg_proc
WHERE proname IN ('redeem_event_code', 'current_profile_id', 'is_admin',
                  'consume_rate_limit', 'export_my_data', 'get_event_funnel');
```

Deben aparecer las seis.

## 8. Edge Functions

Supabase **no admite `npm install -g`**, así que el CLI va como dependencia del
proyecto (ya está en `devDependencies`):

```bash
npm install                       # instala también el CLI
npx supabase login                # abre el navegador
npx supabase link --project-ref <tu-project-ref>
```

El *project ref* es el subdominio de tu `VITE_SUPABASE_URL`.

### Si tienes varias cuentas de Supabase

`supabase login` guarda **un solo** token (en Windows, en el Administrador de
credenciales). Todo lo que hace el CLI va contra la cuenta de ese token, y la
lista de proyectos que ofrece `supabase link` es la de esa cuenta: si Vybe está
en otra, sencillamente no aparece.

`npm run secrets:push` y `npm run functions:deploy` pasan `--project-ref` por su
cuenta —lo deducen de `VITE_SUPABASE_URL`—, así que no dependen de `link` y, si
el token no es el correcto, la respuesta es un 403 claro:

```
Your account does not have the necessary privileges to access this endpoint
```

Para arreglarlo, sin tocar la sesión que ya tienes, crea un token en
<https://supabase.com/dashboard/account/tokens> con la cuenta que aloja Vybe y
úsalo sólo para ese comando:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_…"
npm run secrets:push
```

O cambia la sesión del todo con `npx supabase logout` y `npx supabase login`.

Comprueba a qué cuenta estás conectado con `npx supabase projects list`: si Vybe
no sale en esa lista, el token es de otra.

### Secretos

```bash
npm run secrets:push
```

Genera `supabase/.env.functions` a partir de `.env` —descartando las `VITE_*`,
que son de cliente, y las variables vacías— y lo sube. Para revisar el
contenido antes de subirlo: `npm run secrets:build`.

También puedes pegarlos a mano en **Edge Functions > Secrets** del panel, que no
necesita CLI. Los nombres y valores son los del fichero que genera
`npm run secrets:build`.

### Desplegar

```bash
npm run functions:deploy
```

O una a una:

```bash
npx supabase functions deploy moderate-photo
npx supabase functions deploy send-sos-alert
# …etc.
```

Todas las funciones exigen JWT salvo `stripe-webhook` (se valida con la firma de Stripe), `send-push` (la
llama un Database Webhook con `x-push-secret`) y `analytics-collect`.

> **Ese ajuste sólo lo aplica el CLI.** `config.toml` declara `verify_jwt = false`
> para esas tres, pero si despliegas desde el panel o por MCP las funciones nacen
> con `verify_jwt = true` y hay que desactivarlo a mano en **Edge Functions >
> (función) > Details**. Stripe no envía ningún JWT, así que con la verificación
> activada el webhook responde 401 y las suscripciones no se activan nunca.

Para que las notificaciones salgan con la app cerrada, crea en **Database >
Webhooks** dos disparadores `INSERT` sobre `connections` y `messages` que
apunten a `send-push` con la cabecera `x-push-secret`.

## Aplicación para Android y iOS

El mismo código corre en el navegador y dentro de la aplicación instalada:
Capacitor lo envuelve en un contenedor nativo, así que no hay dos aplicaciones
que mantener.

```bash
npm run native:sync      # compila la web y la copia a android/ e ios/
npm run native:apk       # genera el APK de pruebas
npm run native:android   # abre el proyecto en Android Studio
npm run native:ios       # abre el proyecto en Xcode (sólo en macOS)
```

Capacitor 8: Android 16 (API 36, mínimo Android 7 / API 24) e iOS 15. El
identificador es `com.vybe.app`. Compilar Android pide **JDK 21**;
`npm run native:apk` lo busca solo (`scripts/java21.mjs`: `VYBE_JAVA_HOME`,
Android Studio, `~/.jdks/jdk-21*`…) sin cambiar el Java del sistema.

El APK de pruebas queda en
`android/app/build/outputs/apk/debug/app-debug.apk`. Para instalarlo en un
teléfono hay que permitir orígenes desconocidos: no está firmado para tienda.

`android/local.properties` apunta al SDK de Android de cada equipo y está fuera
del repositorio. Si compilas en otra máquina, escribe ahí tu ruta con barras
normales:

```properties
sdk.dir=C:/Users/tu-usuario/AppData/Local/Android/Sdk
```

### Qué falta para publicar

| | Android | iOS |
|---|---|---|
| Compilar | Ya funciona en este equipo | **Requiere un Mac con Xcode** |
| Firma | Falta crear el almacén de claves | Falta certificado de distribución |
| Cuenta de desarrollo | 25 $ una vez | 99 $ al año |
| Avisos | Falta `google-services.json` de Firebase | Falta clave de APNs |

### Notificaciones en el teléfono

En el navegador se usa Web Push. En la aplicación instalada el aviso lo entrega
el sistema operativo a través de Firebase, y `send-push` elige el canal según el
dispositivo: quien usa las dos cosas recibe el aviso en ambas.

**Pendiente tras el cambio a `com.vybe.app`:** el `google-services.json` estaba
registrado para el paquete antiguo y se apartó (`google-services.party.vybe.app.json.bak`).
Hay que añadir la app Android `com.vybe.app` al proyecto de Firebase
`party-vybe-app` y poner su `google-services.json` en `android/app/`. Con él, el
plugin de Gradle lo procesa y el APK lleva las librerías de Firebase. El teléfono registra su token al conceder el
permiso y lo guarda con `save_native_push_token()`.

**Falta la credencial del servidor.** Para escribir a esos tokens, Firebase pide
una cuenta de servicio:

1. Consola de Firebase → **Configuración del proyecto → Cuentas de servicio →
   Generar nueva clave privada**. Descarga un JSON.
2. De ese fichero, copia tres campos a `.env`:

   ```env
   FCM_PROJECT_ID=party-vybe-app
   FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@party-vybe-app.iam.gserviceaccount.com
   FCM_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIIE…
-----END PRIVATE KEY-----

   ```

   La clave privada lleva saltos de línea: se pegan como `
` literales y el
   código los vuelve a convertir.
3. Sube los secretos y despliega:

   ```bash
   npm run secrets:push
   npm run functions:deploy
   ```

Ese JSON es una credencial con permisos sobre todo el proyecto de Firebase.
Nunca va al repositorio ni al bundle de la aplicación: sólo a los secretos de
las Edge Functions.

Para iOS hace falta además subir una clave de APNs a Firebase, en la misma
pantalla de configuración.

## Avisos automáticos de evento

Quien marca «voy a ir» y no ha entrado recibe dos avisos:

- **El local ha abierto**, dentro de los noventa minutos siguientes al comienzo.
- **Ya hay gente dentro**, cuando hay al menos cinco personas y ha pasado media
  hora desde la apertura.

Los envía `notify-events`, que llama `pg_cron` cada cinco minutos. Un registro
por persona y aviso evita repetirlos.

Para que funcione hay que dejar dos secretos en Vault, una sola vez. El script
imprime el SQL:

```bash
node scripts/schedule-notifications.mjs
```

No van en una migración a propósito: el historial de migraciones se guarda en la
propia base de datos y el secreto quedaría escrito ahí para siempre.

## Servicios externos opcionales

| Función | Variables | Sin configurar |
|---------|-----------|----------------|
| Notificaciones push | `VITE_VAPID_PUBLIC_KEY` + `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_HOOK_SECRET` | El interruptor aparece desactivado |
| SMS (verificación y SOS) | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_FROM_NUMBER` (o `TWILIO_AUTH_TOKEN` en vez de la API Key) | Devuelve 503 con un mensaje claro |
| Correo del SOS | `RESEND_API_KEY`, `SOS_FROM_EMAIL` | La alerta se registra pero no se envía |
| Moderación de fotos | `SIGHTENGINE_USER`, `SIGHTENGINE_SECRET`, `MODERATION_THRESHOLD` | La foto se publica y queda en la cola manual |
| Cobro de Premium | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`, `STRIPE_WEBHOOK_SECRET` | La suscripción se activa sin cobrar |
| Errores en producción | `VITE_SENTRY_DSN` | Sentry no se inicializa |
| Verificación facial externa | `VITE_FACE_VERIFICATION_URL` | Se usa `FaceDetector` del navegador |

Genera el par VAPID con:

```bash
npx web-push generate-vapid-keys
```

### Twilio: API Key en vez de Auth Token

En **Account > API keys & tokens > Create API key** obtienes un par `SK…` +
secreto. Es preferible al Auth Token de la cuenta porque se puede revocar por
separado sin rotar las credenciales maestras. El código admite las dos formas y
prioriza la API Key.

Ojo con un error fácil: el **Auth Token** no empieza por `AC`. Si tu variable
`TWILIO_AUTH_TOKEN` empieza por `AC` es que has copiado el Account SID.

### Stripe sin dominio propio

`STRIPE_WEBHOOK_SECRET` sale al crear el endpoint, y el endpoint necesita una
URL pública. Dos caminos mientras tanto:

- **En local**, con la CLI de Stripe:

  ```bash
  stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
  ```

  Imprime un `whsec_…` de pruebas que puedes usar ya.

- **Sin dominio propio**, la URL de la Edge Function ya es pública:
  `https://<tu-proyecto>.supabase.co/functions/v1/stripe-webhook`. Sirve para
  crear el endpoint en el panel de Stripe aunque la app aún no tenga dominio.

Sin ese secreto el webhook responde 500 y las suscripciones no se activan
automáticamente, pero el resto de la app funciona igual.

## Tareas programadas recomendadas

Con `pg_cron` (Database > Extensions):

```sql
SELECT cron.schedule('purgar-conexiones', '0 * * * *',
  $$SELECT public.purge_expired_connections()$$);
SELECT cron.schedule('purgar-limites', '30 3 * * *',
  $$SELECT public.purge_rate_limits()$$);
SELECT cron.schedule('caducar-codigos', '*/15 * * * *',
  $$SELECT public.cleanup_expired_event_codes()$$);
SELECT cron.schedule('purgar-grupos', '0 6 * * *',
  $$SELECT public.purge_finished_groups()$$);
SELECT cron.schedule('generar-recurrentes', '0 5 * * *',
  $$SELECT public.generate_recurring_events()$$);
```

Las dos últimas son de las funciones nuevas: `purge_finished_groups()` borra los
grupos —y con ellos su chat— seis horas después de terminar el evento, y
`generate_recurring_events()` duplica hacia la semana siguiente los eventos
marcados como recurrentes.

## Deriva de esquema conocida

Esta base de datos tiene varias tablas creadas fuera de las migraciones,
probable herencia de Lovable o de cambios manuales en el panel:

| Tabla | Situación | Qué se hace |
|-------|-----------|-------------|
| `event_attendance` | Existía con `user_id` / `verified_at`, incompatible con el flujo nuevo | La 006 la renombra a `event_attendance_legacy`, crea la correcta y migra las filas traduciendo `user_id` a `profile_id` |
| `users` | Guardaba los roles reales de las cuentas (`user` / `venue` / `admin`) mientras `profiles` estaba vacía | La 006 le activa RLS; la 008 la usa para dar de alta los perfiles y locales; la 012 la deja fuera del alcance del cliente |
| `venue_profiles` | Nombre, tipo y teléfono de los locales | La 008 los traslada a `venues` |
| `venue_events`, `user_preferences`, `blocked_users`, `notifications`, `activity_log` | Sin usar | RLS activado, sin policies y sin permisos para `anon` ni `authenticated` |

Ninguna se borra: siguen ahí por si hiciera falta consultar de dónde salió cada
cuenta. Decidir si se eliminan es una decisión de producto, no técnica.

La 006 también revoca todos los permisos del rol `anon` sobre `public`. La anon
key viaja en el bundle, así que `anon` equivale a "cualquiera en internet" y en
Vybe no hay nada que deba leerse sin sesión. Es defensa en profundidad: aunque
mañana alguien añada una policy permisiva, sin GRANT no hay lectura.

## El seed caduca

Los eventos de `004_seed_data.sql` se insertan con fechas relativas a `NOW()`,
pero **en el momento de ejecutar el script**, no de consultarlo. El evento «Noche
Techno» dura seis horas: pasado ese rato deja de estar en curso y su código de
acceso devuelve `INVALID_CODE`. Para volver a tener algo que probar:

```sql
UPDATE public.events e
SET start_date = NOW() + (d.h1 || ' hours')::interval,
    end_date   = NOW() + (d.h2 || ' hours')::interval
FROM (VALUES ('Noche Techno', -1, 6), ('Afterwork Cocktails', -1, 4)) AS d(name, h1, h2)
WHERE e.name = d.name;

UPDATE public.event_codes c
SET expires_at = e.end_date, active = TRUE
FROM public.events e WHERE c.event_id = e.id;
```

## Problemas comunes

**`infinite recursion detected in policy for relation "profiles"`**
No has ejecutado la migración 006.

**«Perfil no encontrado. Por favor regístrate primero» al iniciar sesión**
Falta el trigger `on_auth_user_created` (migración 006). Para las cuentas ya
creadas antes de aplicarla:

```sql
INSERT INTO public.profiles (user_id, name, email, age)
SELECT u.id, split_part(u.email, '@', 1), u.email, 18
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.venue_id = u.id);
```

**«there is no unique or exclusion constraint matching the ON CONFLICT specification» al dar like**
Falta la migración 010. `connections` necesita `UNIQUE (user_id_1, user_id_2)`
porque el trigger `check_match()` termina en un `ON CONFLICT` sobre ese par.

**La pantalla de conexiones aparece vacía aunque haya matches**
Falta la migración 013. `api.getMatches()` pide el embed
`profiles!connections_user_id_1_fkey`, y PostgREST sólo sabe resolverlo si
existen las claves foráneas de `connections` hacia `profiles`.

**Un local ve las métricas de otro**
Falta la migración 011. Las funciones de estadísticas son `SECURITY DEFINER`, así
que se saltan las policies y la propiedad hay que comprobarla dentro de cada una.

**El código de acceso siempre da «no es válido»**
El código debe estar activo, sin caducar y pertenecer a un local **verificado**
(`venues.is_verified = true`) con un evento en curso. Apruébalo desde el panel
de administración o con SQL.

**No aparecen perfiles cercanos**
El descubrimiento sólo muestra a quien ha hecho check-in en **el mismo evento**.
Además el perfil debe estar verificado (`is_verified = true`, que requiere foto
y verificación facial) y no estar en modo invisible.

**«Estás demasiado lejos del evento»**
El local necesita coordenadas. Desde el panel del local, en *Eventos*, usa
«Usar mi ubicación actual».

## Probar en iPhone o iPad sin Mac

El flujo `.github/workflows/ios-unsigned.yml` compila la app en un Mac de GitHub
y deja un `.ipa` **sin firmar**. Se firma e instala desde Windows:

1. Una sola vez, en GitHub → Settings → Secrets and variables → Actions, crea
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (y, si los usas,
   `VITE_CARTO_API_KEY` y `VITE_SENTRY_DSN`).
2. Actions → «iOS sin firmar» → Run workflow. Tarda unos 10-15 minutos.
3. Descarga el artefacto `Vybe-ios-sin-firmar` y descomprímelo.
4. Instala **Sideloadly** (sideloadly.io) e iTunes para Windows (la versión de
   la web de Apple, no la de Microsoft Store). Conecta el iPhone por cable.
5. Arrastra el `.ipa` a Sideloadly, pon tu Apple ID y pulsa Start.
6. En el iPhone: Ajustes → General → VPN y gestión de dispositivos → confía en
   tu Apple ID. En iOS 16 o posterior activa además Ajustes → Privacidad y
   seguridad → Modo de desarrollador.

Con un Apple ID gratuito la app **caduca a los 7 días** (se reinstala igual),
caben 3 apps así por dispositivo, y **no llegan avisos push ni abren los
enlaces de vybes.es**: esas dos capacidades exigen el Apple Developer Program.
