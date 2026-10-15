# Base de datos: migraciones, permisos y funciones

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- **Las migraciones 006 y 007 son obligatorias.** Sin la 006: el registro no crea el perfil
  (el insert desde el cliente ocurre sin sesión y la policy lo rechaza), las
  policies de `profiles` entran en recursión infinita (`42P17`) y cualquiera con
  la anon key puede listar todos los códigos de acceso activos.
- El orden 006 → 007 → 005 → 004 importa: la 006 instala el trigger de alta automática
  y el seed cuenta con él. Las cuentas de local necesitan
  `account_type: "venue"` en los metadatos o se crean como usuarios normales.
- `.env` está fuera de git desde la reparación. Si el repo es público o
  compartido, **rota la anon key**: estuvo versionada.
- Los eventos del seed usan fechas relativas a `NOW()`, así que nunca caducan.
- **Deriva de esquema.** La base de datos real no nació de estas migraciones y
  llegó con otra forma. `CREATE TABLE IF NOT EXISTS` no avisa de nada cuando la
  tabla ya existe con columnas distintas, así que **antes de dar por buena una
  migración hay que mirar el esquema real**. Lo que apareció al probarlo entero
  contra el proyecto de producción:
  - `event_attendance` tenía `user_id`/`verified_at` (la 006 la aparta como
    `event_attendance_legacy` y migra las filas).
  - `verification_codes.user_id` era `TEXT` en vez de `UUID`, y las policies que
    lo comparan con `auth.uid()` fallaban con `42883: operator does not exist:
    text = uuid`.
  - `connections` no tenía `UNIQUE (user_id_1, user_id_2)`, así que el
    `ON CONFLICT` de `check_match()` reventaba y **no se creaba ningún match**.
  - Faltaban seis claves foráneas (`connections` y `messages` hacia `profiles`,
    entre otras). Sin ellas PostgREST no resuelve los embeds y la pantalla de
    conexiones sale vacía.
  - `premium_subscriptions` tenía `plan_type` en vez de `subscription_type`, sin
    `event_id` y con un `UNIQUE (user_id)` que impedía más de una suscripción.
  Todo eso lo corrigen las migraciones 008 a 013.
- **Las funciones `SECURITY DEFINER` se saltan las policies.** Las de métricas
  no comprobaban propiedad, así que cualquier local podía leer el embudo de la
  competencia pasando su id. Si añades una función así, la autorización va
  dentro (véase `can_read_venue_metrics()`).
- **Supabase concede permisos por defecto a `anon` y `authenticated`** sobre
  cada función nueva de `public`. Las migraciones 009 y 012 revocan todo y
  vuelven a conceder sólo la lista que usa la aplicación; si añades una RPC,
  añádela también a esa lista o el cliente recibirá `42501`.
- **El seed caduca.** Los eventos de la 004 se insertan con fechas relativas a
  `NOW()` en el momento de ejecutarla, no de consultarla: pasadas unas horas el
  código de acceso devuelve `INVALID_CODE`. En `SETUP.md` hay el SQL para
  reprogramarlos.
- **`verify_jwt` sólo lo aplica el CLI.** Desplegando por MCP o desde el panel,
  `stripe-webhook`, `send-push` y `analytics-collect` nacen exigiendo JWT y hay
  que desactivarlo a mano. Stripe no manda ninguno: el webhook devolvería 401.
- Las 006 y 007 revocan todo permiso del rol `anon` sobre `public`.
- **`$env:SUPABASE_ACCESS_TOKEN` en PowerShell dura lo que dura la ventana.**
  Por eso `secrets:push` funcionaba una vez y a la siguiente daba 403. Va en
  `.env`, de donde lo lee `scripts/run-supabase.mjs`.
- **Las migraciones 025 en adelante se aplicaron por MCP.** El fichero del
  repositorio y lo aplicado coinciden, pero si dudas, `scripts/dump-migration.mjs`
  saca de la base de datos el SQL exacto que se ejecutó.
- **Permisos que devuelven NULL** (migración 041). `can_read_venue_metrics()`
  daba NULL, no FALSE, sin local, y `IF NOT NULL` no salta: cualquiera con
  sesión leía métricas de cualquier evento. Una función de permisos nueva tiene
  que acabar en `COALESCE(…, FALSE)`.
