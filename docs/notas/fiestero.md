# La experiencia del fiester@ en la fiesta

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- El descubrimiento sólo muestra a quien ha hecho check-in en el **mismo evento**
  (`event_attendance`), no a cualquiera que esté cerca.
- **Administración tiene premium siempre.** `is_premium()` da TRUE a
  `role = 'admin'`, y el disparador `profiles_admin_premium` le crea una
  suscripción `lifetime`, que es lo que lee la app.
- **Todas las fotos se revisan solas y al momento** (migraciones 046 y 047). Se
  revisan las fotos del perfil, el avatar, la foto de la noche y la
  verificación de cara. `moderate-photo` usa Sightengine para comprobar
  contenido prohibido y que haya **una** cara.
  - **Si Sightengine no responde** (migración 049), la foto **no** se publica
    y queda pendiente con `reason = 'unavailable'`, para revisión manual.
    - El usuario lo sabe al momento y puede repetirla.
    - Los admins reciben el push «Tienes imágenes por revisar», que lleva a
      `/admin/dashboard?seccion=photos`. Sale como mucho uno cada 10 minutos
      (`admin_notices`), y no se puede desactivar.
    - Si mientras tanto otra foto del mismo tipo pasa la revisión, las
      pendientes antiguas se descartan (`superseded`).
    - `review_photo()` publica cada tipo donde toca: perfil, avatar, foto de
      la noche en su evento (`moderation_queue.event_id`) y verificación de
      cara.
  - **Cola de moderación:** el móvil sólo puede crear elementos `pending`, sin
    puntuación ni revisor. Antes podía crearlos ya `approved` y saltarse la
    revisión.
  - **Aviso:** `photo-requirements-dialog.tsx` dice qué imágenes han fallado
    (1, 2, 3 o todas), por qué, y la lista de requisitos. En las 3 fotos de
    entrada sólo se repiten las que fallaron.
  - **Foto de la noche:** `set_event_photo()` sólo acepta una foto aprobada
    como `event_photo` de esa persona. Es **sólo de cámara**: la galería vale
    para el perfil, nunca para el evento ni para el tablón.
  - **Una sola foto al entrar** (migración 050). Sirve un selfie o una de
    cuerpo entero. Si la cuenta no estaba verificada, al aprobarse la foto
    `verify_from_event_photo()` la verifica: pasa a ser su primera foto de
    perfil y la cara queda comprobada. Ya no se piden 3 fotos de perfil.
  - **Avatar:** lo pone `moderate-photo` al aprobarlo. El disparador sólo deja
    al usuario quitarlo o elegir una de sus fotos aprobadas.
  - **Fotos del perfil:** desde el cliente sólo se pueden quitar; las añade
    `review_photo()`.
- **Filtros del tablón** (`discovery-filters.tsx`):
  - «Quiero ver» (mujeres, hombres o todos) guarda `profiles.wants`, lo tiene
    todo el mundo y recarga el tablón.
  - La edad lleva dos puntos, mínimo y máximo, y es de Premium.
    `ui/slider.tsx` pinta un punto por valor; la plantilla de shadcn pintaba
    uno solo.
  - Los intereses están ocultos, porque el alta no los pide.
- **Tipo de cuenta** (migraciones 058 y 059). `profiles.account_type`:
  - **vyber**: foto del momento, tablón, swipe y match.
  - **guest** («invitado»): fiestas, mapa, ofertas, sorteos, avisos y seguir
    locales. Ni ve tablones ni sale en ellos, y no tiene pestaña «Crushes».
  - Se elige en el registro (dos pestañas con su modal de información,
    `account-kind-info.tsx`), y el formulario de invitado no pide género ni «a
    quién quiere ver»: se piden al pasarse a vyber.
  - `set_account_type()`: a invitado siempre; a vyber una vez cada 30 días
    (tres con Premium) y con el perfil completo. `my_account_type_status()`
    dice cuántos cambios quedan y desde qué día se puede volver. La tarjeta del
    perfil es `account-type-card.tsx`.
  - **El móvil es único** (índice sobre `normalize_phone(phone)`): si ya hay
    una cuenta con ese número, el alta lo dice en rojo.
- **«Como invitado ves la fiesta; como Vyber la juegas»** (migración 060).
  Sorteos, retos, tarjeta de sellos y votar la canción son sólo de Vyber. Lo
  impiden disparadores en `song_requests`, `song_votes` y
  `promotion_redemptions` (promociones `challenge` y `prize`), y
  `perform_raffle_draw` sortea sólo entre Vyber. Las ofertas y los vales normales
  siguen abiertos al invitado. Cuánta gente hay y el ambiente se ocultan al
  invitado en `use-events-feed.ts`. El modal comparativo es
  `account-kind-info.tsx` (tabla con checks verdes y equis rojas).
- **Migración 061:**
  - **Sorteos:** el ganador sale con su nombre completo y un código
    (`event_raffles.winner_code`, «VY-XXXXXX») que ven él y el local. El
    ganador lo enseña en la barra desde Ofertas → Sorteos. `send-push` avisa
    al ganador («¡Has ganado el sorteo!») y a todos los que siguen dentro,
    también a los invitados, con el nombre de quien ha ganado.
  - **`unmatch()`** borra la conversación y la conexión y deja un `dislike`.
    Se usa desde la papelera del chat y deslizando a la izquierda en Crushes.
  - **Avisos del local:** los que no llevan hora salen al momento (disparador
    `broadcasts_send_now`) y el programador pasa cada minuto.
  - **Sin repetir (111):** cada pasada se queda los avisos antes de enviarlos
    (`claim_broadcasts`, `pending` → `sending`) y manda de 20 en 20, sólo a
    quien tiene dispositivo. Antes una novedad de administración a todo el
    mundo no acababa en los 5 s de `pg_net`, no se marcaba y se repetía en
    cada pasada. Ahora el programador espera hasta 2 min.
- **Modo de acceso a una fiesta** (migraciones 055 y 056). Al entrar se elige:
  **Vyber** (foto del momento, sale en el tablón y desliza) o **Invitado**
  (sin foto; ve ofertas, sorteos y avisos del local, pero ni ve el tablón ni
  sale en él). `event_attendance.mode` es NULL mientras no se elige, y por eso
  la app pregunta. `set_event_mode()` cambia de modo durante la noche: al
  pasar a invitado borra la foto y los likes sin match. La pantalla de
  invitado es `GuestEventPage.tsx` y el cambio, `event-mode.tsx`.
- **La foto de la noche dura lo que la noche.** Al salir, `leave_event()` la
  quita y la app borra el fichero; cuando la fiesta termina lo hace
  `purge_ended_event_photos()` desde `notify-events`.
- **El match dura una hora tras el final** del evento, salvo que
  se guarde con Premium (`expires_at IS NULL`). `are_connected()` ya respeta
  `expires_at`, así que una conexión caducada deja de valer al momento y no
  cuando pasa la purga horaria.
- **El super like se ve siempre en «Le gustas»**, también sin Premium, con
  nombre y foto y con botón para devolverlo. Los likes normales siguen
  pixelados (migración 054).
- **Salir del evento** (`leave_event`, migración 046) anota
  `event_attendance.left_at`.
  - Quien sale deja de estar en el tablón de los demás y en su evento activo,
    y el latido de la app no le vuelve a meter.
  - Si vuelve a canjear el código, `left_at` se borra.
  - Al salir se **borran los likes que diste en ese evento y no llegaron a
    match** (migración 048).
- **«Le gustas» sin premium** (Edge Function `likes-preview`):
  - Enseña cuánta gente te ha dado like, cada una con una miniatura de 10 × 12
    píxeles hecha en el servidor con `imagescript`, sin nombre ni id. Al móvil
    nunca le llega la foto real.
  - Al tocar una, sale el modal de premium.
  - Los datos salen de `likes_for_preview()`, que sólo puede llamar
    `service_role`.
  - Storage no tiene transformaciones de imagen en este plan: la URL de
    `render/image` devuelve 403.
  - Los chats con sus matches siguen: la conexión no depende de estar dentro y
    caduca con el match (una hora tras el final, o nunca si se guarda).
- **El modo invisible es de pago y se comprueba en la base de datos**
  (migración 025), no en la interfaz.
- **Avisos push** (migración 039). Mensaje nuevo y vybe match: disparadores
  `push_on_message`/`push_on_connection` → `push_webhook()` → `send-push` por
  `pg_net` (secretos de Vault `push_hook_secret` y `functions_url`). Evento que
  empieza (a quien marcó «voy a ir»), que se llena y que termina en 30 min (a
  quien está dentro): `pending_event_pushes()` cada 5 min vía `notify-events`.
  Los textos van en `_shared/push-texts.ts` según `profiles.locale`. En la app,
  `native-push-bridge.tsx` pide permiso la primera vez que hay sesión, abre la
  pantalla al tocar el aviso y, con la app delante, lo enseña como aviso propio
  (por eso `presentationOptions` es sólo `badge`). Al cerrar sesión se borra el
  token antes de `signOut()`. `FCM_PRIVATE_KEY` está guardada con los saltos de
  línea escapados dos veces: `fcm.ts` lo tolera; no quites esa normalización.
  En iOS el plugin da un token de APNs: `AppDelegate.swift` lo cambia por el
  de Firebase (pod `FirebaseMessaging`), así que `send-push` manda igual que
  a Android. La app de iOS está en el mismo proyecto de Firebase
  (`party-vybe-app`) con la clave de APNs subida. El `GoogleService-Info.plist`
  no está en git: Codemagic lo escribe desde `GOOGLE_SERVICE_INFO_PLIST`
  (base64, grupo `appstore`); sin él la build falla adrede y, si faltara en la
  app, arrancaría sin avisos.
- **La noche en directo** (migración 042, `src/services/night.ts`). Todo va por
  funciones que comprueban quién pregunta; el vyber sólo ve lo del evento en el
  que está (check-in de las últimas 4 h).
  - **Premios = promociones `prize`** (sorteos, tarjeta de sellos): no se piden
    (`claim_promotion` los rechaza), el vale lo emite `issue_prize_ticket()`,
    sale en «Entradas» y se valida en barra como cualquier vale. No cuentan
    para el plan (`enforce_promotions_plan` los deja pasar).
  - **Retos = promociones `challenge`** con `challenge_type` (`early_bird`,
    `matches`, `group`, `stay_until`, `first_visit`): `claim_promotion` sólo da
    el vale si `challenge_progress()` dice que está hecho. Las promos y retos
    preestablecidos están en `src/lib/promo-templates.ts` (`template_key`); sus
    horas límite salen del horario del evento.
  - **Sorteos**: `create_raffle` avisa por push a quien está dentro
    (`send-push`, tipo `RAFFLE_CREATED`), `run_due_raffles()` los sortea cada
    minuto (pg_cron `vybe-sorteos`) entre quien sigue dentro y avisa al ganador.
  - **Canciones**: `song-search` (Deezer, sin clave, con JWT) para que todos
    elijan la misma ficha; `request_song` agrupa por `normalize_song()` y
    limita a 3 peticiones por persona. El DJ marca «puesta» y pasa a «suena
    ahora».
  - **Tarjeta de sellos**: opcional por local (`venue_stamp_cards`) y por
    evento (`events.stamps_enabled`); un sello por evento con check-in.
  - **Termómetro**: `get_events_activity()` añade tendencia, % de mujeres (en
    decenas, con 10+ personas), cola y «suena ahora» (los da la puerta y
    caducan solos) y si la puerta está cerrada.
  - **Cerrar la puerta** es `events.entry_closed_at` (`set_event_entry`):
    `redeem_event_code` devuelve `ENTRY_CLOSED` a quien no había entrado; quien
    ya estaba puede volver a escanear. Ya no desactiva códigos.
  - **Lista Vybe**: `get_event_intent_list()` da al local nombre de pila, edad
    y foto de quien marcó «voy a ir» (la ficha lo avisa al marcarlo).
  - **¿Dónde seguimos?** (`where-next-prompt.tsx`): media hora antes del final
    del evento en el que estás; `get_next_parties()` pone primero los locales
    con suscripción (lista) y, si no hay, abre `/map?desde=<hora>`.
  - **Informe semanal**: `generate_weekly_reports()` cada lunes (pg_cron
    `vybe-informe-semanal`); `get_weekly_reports()` genera el de la semana pasada
    si falta. El panel avisa con «Ya disponible el informe semanal».
- **Entrar por ubicación y expulsar** (migración 101).
  - **Fiestas de Fiestea** con ubicación: Flechazo encendido por defecto y
    «Entrar al evento» en la ficha (`enter_platform_event`, por GPS en el
    radio). Sin ubicación, apagado.
  - **Al entrar** (también con código): precisión de ±100 m como mucho
    (`LOCATION_IMPRECISE`), ubicación simulada rechazada (`LOCATION_MOCKED`;
    en Android lo dice el plugin propio `FiesteaLocationPlugin.java`, con
    `isMock`) y 10 intentos cada 10 minutos (`TOO_MANY_ATTEMPTS`).
  - **Los intentos fallidos cuentan:** `enter_platform_event` y
    `redeem_event_code` son envolturas que suman el intento y llaman a
    `*_inner` dentro de un bloque que captura el error; el error vuelve en la
    columna `error_code` (si se lanzara, se desharía también el contador).
  - **El latido** (cada 5 min) lee la ubicación: lejos (radio + 500 m) o
    simulada, sales del tablón (`left`); expulsado, `expelled`.
  - **Denuncias:** se guardan con su fiesta (`reports.event_id`) y avisan
    por push (`REPORT`) al propietario y a Seguridad; en las fiestas de
    Fiestea, a administración. «Expulsar» (`expel_from_event`; el antiguo
    `revoke_event_checkin` la llama) saca del tablón, quita la foto y los me
    gusta sin crush, resuelve la denuncia, avisa (`EXPELLED`) e impide volver
    (`EXPELLED`). Está en Puerta, en el enlace de Seguridad y en
    administración → Denuncias.
- **Filtro «Con Flechazo»** (`conFlechazo` en `lib/party-filters.ts`): en
  directo y con el tablón encendido. En inicio y en el mapa; no sale a los
  invitados.
- **Invitados:** sin «Sin verificar», sin «Completa tu verificación» y sin
  Premium (`premium-context` da `isPremium` falso). La suscripción no se
  pausa: los días como invitado se consumen y al volver a fiester@ sigue.
- **Los me gusta caducan con la fiesta** (migraciones 097 a 099).
  - «Le gustas» respeta «Quiero ver».
  - Los me gusta sin crush se borran al terminar la fiesta
    (`purge_ended_event_likes`, desde `notify-events`).
  - Una hora antes llega el aviso `likes_expiring`.
  - Los totales de la fiesta se guardan antes en `event_swipe_totals`.
  - Las salas de pruebas (`test_lab`) no se purgan nunca, y guardar el
    formulario de una fiesta no puede ponerles un fin pasado
    (`keep_test_lab_open`): el 1 de octubre de 2026 eso cerró Aurora y se
    perdieron sus me gusta.
