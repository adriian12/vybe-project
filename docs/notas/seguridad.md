# Seguridad, privacidad y límites

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- **Auditoría de seguridad** (migraciones 093 a 095, PR adriian12/vybe-project#2).
  - **Columnas con privilegio (094).** `profiles` y `venues` ya no se leen
    enteras:
    - cada columna legible está en un `GRANT SELECT (…)`. **Una columna nueva
      no se puede leer hasta que se añade a su lista;**
    - fuera quedan el teléfono, el correo y las coordenadas del perfil, y el
      NIF, los documentos, Stripe, la comisión y el correo del local;
    - el perfil propio se lee con `get_my_profile()`, el local propio con
      `get_my_venue()` y los pendientes de aprobar con
      `admin_pending_venues()`;
    - nada del cliente puede pedir `select('*')` sobre esas tablas.
    - **tampoco incrustado:** `profiles(*)` dentro de otra consulta incluye
      las columnas vetadas y PostgREST rechaza la consulta entera. Así se
      quedaron vacíos los crushes (y con ellos el contador, el chat y la
      ventana de crush) hasta que `getMatches` pasó a `PERFIL_PUBLICO`
      (`src/services/api.ts`).
  - **Fotos privadas.** En la base se guarda la URL pública, y el cliente la
    firma al pintarla (`src/services/storage-urls.ts`: `signPhotosOf`,
    `signedPhotoMap`). Al guardar o borrar se vuelve a la pública
    (`canonicalPhotoUrl`). Sin sesión (`team-access`) o descargando la imagen
    (`likes-preview`) firma el servidor, con `_shared/photo-urls.ts`. **Una
    pantalla nueva que pinte fotos de personas tiene que firmarlas.**
  - **Quién puede ver una foto de la noche:** `can_view_event_photo()` (095).
    Pueden verla su dueño, administración, sus matches, quien comparte fiesta
    con él ahora, su grupo, el equipo del negocio de una fiesta a la que va o
    en la que ha estado, y quien atiende su alerta de ayuda.
  - **Carteles** en `event-posters`, con un límite de 10 MB, el mismo del
    formulario.
  - **Compras de prueba:** sólo dan Premium con `APPLE_ALLOW_SANDBOX` y
    `GOOGLE_ALLOW_TEST`, que están activadas mientras se prueba con TestFlight.
    **Quitarlas al publicar.**
  - **`send-push`** rechaza las llamadas sin `PUSH_HOOK_SECRET`, que es el
    mismo valor que `push_hook_secret` en Vault.
  - **Otros cambios:** `get_nearby_profiles` sin fiesta devuelve vacío, y
    las fiestas con ubicación exigen coordenadas al canjear el código.
  - **Las funciones se despliegan todas** con `node scripts/deploy-functions.mjs`.
  - **Marcha atrás de urgencia:** `GRANT SELECT ON public.profiles, public.venues
    TO authenticated` y, sólo como parche, `UPDATE storage.buckets SET public =
    TRUE WHERE id = 'event-photos'`.
- **Límite de peticiones** (migración 092).
  - **Base de datos:** toda petición que escribe cuenta una vez por minuto en
    `api_request_counters` (tabla UNLOGGED). Con sesión, 120 por usuario;
    sin sesión, 60 por IP. Nunca por IP con sesión: en una sala o con datos
    móviles se comparte IP. Al pasarse: `PT429`, que PostgREST convierte en
    HTTP 429.
  - **Cómo se engancha:** un disparador por sentencia `a_api_rate_guard` en
    todas las tablas de `public` llama a `api_rate_guard()`. Si creas una
    tabla nueva, **añádele el disparador**. `pgrst.db_pre_request` no se puede
    usar: el rol `authenticator` está reservado y `postgres` no es
    superusuario.
  - **Qué no cuenta:** las lecturas (transacción de sólo lectura),
    `service_role` y los crons.
  - **Edge Functions:** `_shared/rate-limit.ts` (`overLimit`, con
    `consume_anon_rate_limit` y `auth_throttle`), por usuario o por IP, con un
    tope por función.
  - **En la app:** cualquier 429 lanza `fiestea:rate-limited` (fetch del
    cliente de Supabase) y `rate-limit-notice.tsx` enseña «Vas demasiado
    rápido».
  - **Limpieza:** `fiestea-limpiar-limites` cada 10 minutos.
- **PostHog** (`src/lib/observability.ts`): analítica de producto con
  `VITE_POSTHOG_KEY` (y `VITE_POSTHOG_HOST`, por defecto el de la UE).
  - **Privacidad:** sin cookies ni almacenamiento (`persistence: 'memory'`)
    y sin grabación de sesiones. Identifica sólo con el id del perfil.
  - **Qué recibe:** los mismos eventos de `track()` y las visitas
    (`$pageview`).
  - **Sin clave:** no se carga.
- **Hay columnas que el navegador no puede escribir.** `profiles.role`,
  `is_verified`, `face_verified`, `phone_verified`, `status`, `suspended_until`
  y `venues.is_verified`, `verification_status`, `event_radius` las devuelven a
  su valor anterior los disparadores de la migración 028. Antes cualquiera podía
  ponerse `role = 'admin'` con la anon key. Lo que la aplicación necesita
  escribir pasa por `recompute_my_verification()`, `confirm_phone_code()` y
  `set_face_verified()` (esta última sólo `service_role`, la llama
  `moderate-photo`). Si añades una columna con privilegio, añádela al disparador.
- **El disparador de `profiles` sólo frena escrituras directas** (migración
  045). `protect_profile_fields()` es `SECURITY INVOKER` y sólo protege cuando
  `current_user` es `authenticated` o `anon`. Antes era `SECURITY DEFINER` y
  deshacía también lo que calculaban `recompute_my_verification()` y
  `confirm_phone_code()` con la sesión del usuario: ninguna cuenta nueva
  llegaba a verificarse y su tablón salía vacío. Una función `SECURITY DEFINER`
  que escriba en `profiles` ya no pasa por ese freno, así que **no puede copiar
  columnas que mande el cliente sin filtrarlas**.
- **La demografía nunca se devuelve individual.** `get_event_demographics()`
  descarta los grupos con menos personas de las que declara
  `demographics_min_bucket()`; mostrar «una mujer de 41+» señalaría a alguien
  concreto.
