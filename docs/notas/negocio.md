# Panel del negocio: puerta, equipo, ficha y planes

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- Un local necesita `is_verified = true` y coordenadas para que sus códigos
  funcionen. Se aprueba desde `/admin/dashboard` (rol `profiles.role = 'admin'`).
- **Cartel imprimible:** `venue-qr-poster.tsx` va en un portal a `body`. La
  regla de impresión oculta todo lo que cuelga de `body` salvo el cartel, y
  dentro de la app salía la hoja en blanco.
- **Avisos del local** (migración 053). `queue_broadcast()` acepta
  `scheduled_at`: sin hora sale en la siguiente pasada de `notify-events`, con
  hora espera a esa hora. Programados a la vez: 1 en Gratis y 20 en
  Business (`venue_scheduled_broadcast_limit`). Se anulan con
  `cancel_broadcast()`. No se puede programar después del final del evento.
- **Aforo real y contador de puerta** (migración 040). La app sólo sabía de
  quien entra con Vybe; el local da el total real desde la puerta con el
  contador del panel (Puerta) o con un **enlace de contador** para el portero,
  sin cuenta (`/contador/<token>` → Edge Function `door-counter` →
  `counter_link_apply()`, sólo `service_role`; en la base de datos sólo está el
  SHA-256 del token, que se enseña una vez). `src/components/venue/door-counter.tsx`
  agrupa las pulsaciones cada segundo y guarda las pendientes sin red. **El
  público nunca ve el total**: `get_events_activity()` devuelve `vibe_level`
  (Tranquilo < 35 % · Animado < 70 % · Casi lleno < 95 % · Lleno, contra el
  aforo) y sólo si el local actualizó hace menos de 45 min con el evento en
  marcha (`fresh_headcount()`). Sin aforo no se puede contar. Los cortes viven
  en `vibe_level_for()` y en `src/lib/vibe.ts`: si cambias uno, cambia el otro.
  La curva de la noche (`get_headcount_curve`) es de Business.
- **Alertas de ayuda (SOS)** (migraciones 066 y 067).
  - Se atienden en **Puerta**: `venue-sos-alerts.tsx` va encima del recuento.
    Fuera de Puerta, una franja roja lleva allí.
  - Cuando llega una alerta, salta `venue-sos-alarm.tsx` en cualquier
    sección, con sirena (Web Audio), vibración y el título de la pestaña
    parpadeando.
  - **Cómo llegan:** por Realtime y, por si acaso, cada 15 s
    (`use-venue-sos.ts`). `sos_alerts` está en la publicación, con una policy
    de lectura para el propietario y Seguridad (`can_handle_sos()`, que
    también admite a Camareros por enlace).
  - **«Voy para allá»** es `acknowledge_sos_alert()` y la alerta sigue
    abierta. **«Resuelta»** es `resolve_sos_alert()`, que pueden usar
    administración y el equipo del local.
  - **Nunca se resuelven con un UPDATE directo.** Administración sólo tiene
    lectura en `sos_alerts`, así que la RLS dejaba el UPDATE en cero filas sin
    dar error y las alertas resueltas volvían a salir.
  - **Push `SOS`** (disparador `push_on_sos`): va al personal del local que
    tiene la app y a los admins, y no se puede desactivar.
  - **Sin contactos:** dentro de una fiesta se puede pedir ayuda aunque no
    haya contactos de confianza.
  - **Fiesta ajena:** si la alerta lleva el `event_id` de una fiesta sin
    check-in, se guarda sin evento (migración 067). Así nadie puede hacer sonar
    el panel de otro local.
- **Enlaces del portero:** desde la 071 se guarda también el token, además
  del SHA-256, y «Ver enlace» lo vuelve a enseñar
  (`get_counter_link_token`). Los enlaces creados antes no se pueden
  recuperar.
- **Sección «Negocio»:** reúne lo que ve el público en su ficha: número de
  seguidores (nunca quiénes), datos y logo (`venue-business-profile.tsx`) y
  descripción y horario (`venue-profile-form.tsx`, antes escondido en un
  cajón de configuración).
- **Perfil del negocio** (sección «Negocio» del panel,
  `venue-business-profile.tsx`): logo en el bucket `venue-logos/<venue_id>/`,
  dirección con mapa, teléfono, correo, web, redes y condiciones de venta.
  El nombre queda fijo tras la verificación. La ficha pública los enseña
  (`get_venue_profile`, migraciones 079 y 107).
- **Redes del negocio** (migración 107, `src/lib/socials.ts`).
  - Instagram (`venues.instagram`), X (`social_x`), YouTube (`social_youtube`)
    y TikTok (`social_tiktok`).
  - Se guarda sólo el usuario; en YouTube, `@canal` o `channel/UC…`.
    `normalizeSocial` limpia la arroba y los enlaces pegados, y `socialUrl`
    arma el enlace al pintar.
  - Los patrones del cliente son los mismos que los CHECK de la tabla: si
    cambias uno, cambia el otro.
  - **Iconos** (`social-icon.tsx`): Instagram y YouTube son de lucide; X y
    TikTok son SVG propios, porque lucide no los trae.
  - **En la ficha:** «Síguenos en redes» enseña una casilla por cada red
    rellenada y abre el perfil.
- **Próximas fiestas en la ficha del negocio** (`VenuePage.tsx`).
  - Sólo salen las próximas: las pasadas ya no se enseñan.
  - Se ven en **lista** o en **calendario** (`venue-calendar.tsx`), y la vista
    elegida se recuerda en `localStorage`.
  - **Calendario:** un mes cada vez, de este mes al de la última fiesta
    anunciada, con el cartel en cada día. Con dos o más fiestas, la casilla
    se parte y dice cuántas hay.
  - **Al tocar un día:** con una fiesta se abre su ficha; con varias,
    `/local/:venueId/dia/2026-10-17` (`VenueDayPage.tsx`) las lista para
    elegir.
  - Cada fiesta cuenta en el día local en que empieza
    (`src/lib/month-calendar.ts`, con tests).
  - `get_venue_events_public` devuelve hasta 100 próximas (antes 20), para
    que el calendario tenga meses completos.
- **Cómo se llega a la ficha de un negocio** (migración 110).
  - **«Organiza» en la ficha de la fiesta** (`venue-organizer-card.tsx`): el
    logo y el nombre, «Ver ficha» y «Seguir». La línea de la sala bajo el
    título ya no es un enlace: en las fiestas de administración y de Funout
    la sala (Fitz…) no es el organizador. Allí «Organiza» enseña el negocio
    de la casa, Fiestea, que lleva el logo de la app (`logo_url`).
  - **Buscador del mapa** (`venue-search-results.tsx`, `search_venues`):
    desde 2 letras salen hasta 4 negocios verificados, sin tildes
    (`venue_search_key`).
  - **«Negocios que sigues» en el perfil** (`followed-venues.tsx`,
    `get_my_followed_venues`): sus logos y la fecha de su próxima fiesta.
  - **Redes sociales e Instagram del line-up** se abren con el sistema
    (`openExternal(…, { system: true })`), para que lo haga la app de la red
    si está instalada y no el navegador interno.
- **Ajustes de la fiesta** (migración 081, `event-live-settings.tsx`).
  - **Dónde:** en la sección «Ajustes» del panel (entre Equipo y Plan, con
    las pestañas por evento de Puerta) y al editar un evento; sólo el
    propietario (`set_event_live_settings`). Antes estaban en Puerta.
    También al crear la fiesta (panel y administración): el bloque va en
    modo borrador (`value`/`onChange`) y se guarda en cuanto existe.
  - **Entrar al evento** (`events.entry_enabled`, migración 111, encendido
    por defecto). Apagado, la ficha sólo enseña «Voy a ir» (y las entradas)
    aunque esté en directo (`sePuedeEntrar` en `party-filters.ts`); el
    disparador `event_attendance_needs_entry` rechaza entrar con código, QR
    o ubicación (`ENTRY_DISABLED`). Los avisos «ha empezado» y «se está
    llenando» siguen llegando a quien dijo «voy a ir», pero abren la ficha y
    no hablan de escanear (`pending_event_pushes.entry_enabled`, `goNow`).
    **Sin entrada no hay swipe:** `events_swipe_needs_entry` lo apaga y en la
    pantalla queda bloqueado. En las de Fiestea, entrada y swipe nacen según
    tengan ubicación (`platform_events_swipe_off`) y administración puede
    encender o apagar cualquier ajuste; allí se entra por ubicación, así que
    sin ella la ficha no enseña «Entrar».
  - **Swipe** (`events.swipe_enabled`, encendido por defecto). Apagado:
    - `get_nearby_profiles` devuelve vacío;
    - el disparador `a_check_event_swipe_enabled` rechaza los swipes
      (`SWIPE_DISABLED`), antes de que se cobre el supercrush;
    - `set_event_mode('vyber')` falla;
    - la app enseña `GuestEventPage` con `swipeOff`.
  - **Recuento en directo** (`show_headcount`) y **% de hombres y mujeres**
    (`show_gender_split`), apagados por defecto. Sin permiso del negocio, el
    público no ve ni cuánta gente hay ni el reparto. Los devuelve
    `get_events_activity` (`headcount`, `women_share`).
  - **Lista Fiestea** (`guest_list_enabled`): formulario en la ficha, encima
    de las entradas (`guest-list-join.tsx`). Al marcar «voy a ir», la ficha
    baja hasta ella.
- **Equipos y ranking de RRPP** (migración 106, `src/services/promoters.ts`).
  - **Equipos:** los crea el propietario en Equipo (`promoter-teams.tsx`),
    con nombre único por negocio y un color, hasta 30. Un RRPP (su enlace
    fijo) puede estar en varios. Tablas `venue_promoter_teams` y
    `venue_promoter_team_members`; RPC `get_promoter_teams`,
    `save_promoter_team`, `delete_promoter_team`, `set_promoter_teams`.
  - **Ranking** (`promoter-ranking.tsx`, en Equipo): `get_promoter_ranking`
    con periodo, eventos y equipo.
    - «Apuntados»: los de sus listas con acompañantes.
    - «Entran»: los admitidos de su lista más los que entraron con su código,
      sin contar dos veces a quien entró por la lista.
    - «Recaudado»: sólo con venta de entradas.
  - **Dinero por equipos** (`promoter-team-money.tsx`, Ventas → Comisiones
    RRPP): recaudado, comisión, pagado y pendiente de cada equipo, con el
    desglose por RRPP. Quien está en dos equipos suma en los dos; el total de
    arriba lo cuenta una vez. Las cifras son las mismas que
    `get_promoter_settlement`.
- **Lo que no incluye el plan no se enseña.** Nada de avisos de «mejora tu
  plan» en el panel: Ventas no sale en el menú sin Business, y sin el plan se
  ocultan las valoraciones, los públicos de los avisos, la demografía, la
  curva de aforo, las promociones, los retos y los códigos de RRPP. La
  comparativa y el botón de contratar siguen en Plan.
- **El panel se recarga en silencio al volver a la pestaña.** Supabase emite
  `SIGNED_IN` cada vez que la pestaña recupera el foco; con la misma cuenta
  `app-context` recarga sin cargador (antes se desmontaba el panel y se perdía
  lo que estabas haciendo). La sección del panel se guarda en `sessionStorage`.
- **Los códigos generales y los de RRPP van aparte.** Generar un QR nuevo sólo
  desactiva el código `general` de ese evento; antes se llevaba por delante los
  de relaciones públicas y listas.
- **Los eventos se editan tocándolos** y llevan su propia ubicación
  (`location-picker.tsx`: búsqueda en OpenStreetMap y marcador arrastrable), no
  la del móvil de quien los crea.
- **Equipo del local** (migración 072). Hay cuatro roles:
  - **Propietarios:** tienen cuenta (`venue_members.role = 'owner'`) y ven todo el panel.
  - **Control puerta** (antes «Seguridad»; en el código sigue siendo
    `'security'`): con cuenta (Puerta y Código QR) o con un enlace de una noche.
    En su enlace, las entradas no son una pestaña: un botón fijo abajo,
    «Escanear entrada» (`scan-ticket-button.tsx`), abre el validador en una hoja.
  - **El enlace del contador** (`/contador/<token>`) lleva el mismo botón
    (migración 118): `door-counter` con `action: 'tickets'` (si el plan vende
    entradas) y `'ticket'` (`code`), que llaman a `counter_link_ticket()`.
    La entrada tiene que ser de la fiesta del enlace y se valida con el papel
    de Control puerta fijado en la transacción, como en `team_link_action`.
  - **Camareros:** sólo con enlace de una noche.
  - **RRPP:** con un enlace fijo, que dura hasta que se revoca.

  El antiguo «personal» pasó a Seguridad y «marketing» a Propietario.

  **Cuentas.** En `app.fiestea.es` un miembro entra con su propia cuenta por el
  acceso de locales. `get_my_venue_membership()` le da acceso aunque la RLS de
  `venues` sólo deje leer la fila al propietario. El panel enseña las secciones
  según `SECCIONES_POR_ROL` (`VenueDashboardPage.tsx`).

  **Enlaces** (`venue_team_links`):
  - Se crean en Equipo (`venue-team.tsx`, `create_team_link`, sólo el
    propietario) y se abren sin cuenta en `/equipo/<token>` (`TeamLinkPage.tsx`).
  - La página llama a la Edge Function `team-access` (sin JWT, con tope de
    peticiones), y esta a `team_link_action()`, que sólo puede llamar
    `service_role`.
  - Esa función fija `vybe.team_venue` y `vybe.team_role` en la transacción.
    `current_venue_id()` y `current_venue_role()` los leen sólo si
    `auth.uid()` es NULL, así que las funciones del panel (aforo, listas,
    entradas, vales, alertas, denuncias) sirven tal cual.
  - `team_link_action()` decide qué acciones tiene cada papel y las ata al
    evento del enlace.
  - **Qué puede hacer cada uno:**
    - Seguridad: aforo, abrir y cerrar la puerta, listas (buscar y dar
      entrada), entradas, alertas y denuncias.
    - Camareros: vales, ofertas, sorteos y alertas.
    - RRPP: sólo su lista (`guest_lists.team_link_id`) y su código
      (`event_codes.team_link_id`), que se crean la primera vez que abre cada
      fiesta, y su comisión si el enlace la lleva (Business).
  - Las alertas de un enlace no van por Realtime: se consultan cada 10 s
    (`useVenueSos(id, source)`).
  - **Si añades una RPC que dependa del rol, mira también el caso sin sesión
    con esos ajustes.**
- **El plan del local se aplica en la base de datos, no en la interfaz.** Los
  límites viven en `venue_plan_limits()` y los imponen disparadores sobre
  `events`, `venue_members` y `promotions`. Si cambias un límite, cámbialo
  también en `src/lib/venue-plans.ts`, que los repite para pintar la
  comparativa de planes (panel del local y landing) sin una llamada más.
- La atribución de un check-in es del **primer** código con el que entró la
  persona. Si vuelve a canjear otro, el relaciones públicas que la trajo no
  cambia.
- **Seguir a un local, destacar y prueba gratis** (migración 043).
  - **Seguidores:** `venue_followers` guarda quién sigue a cada local, y
    `toggle_venue_follow()` sigue o deja de seguir. La ficha pública está en
    `/local/:venueId` (`VenuePage.tsx`, con `get_venue_profile` y
    `get_venue_events_public`). A ella se llega tocando el nombre del local en
    la ficha del evento.
  - **Pregunta de seguir:** `follow-venue-prompt.tsx` pregunta una sola vez por
    local, 20 s después de entrar.
  - **Aviso de fiesta nueva:** al publicar una fiesta, el disparador
    `push_on_event_published` avisa a los seguidores. Se hace una sola vez por
    evento (`events.followers_notified_at`); `notify_followers()` es el botón
    del panel.
  - **Columnas protegidas:** `featured_until` y `followers_notified_at` las
    protege `protect_event_fields()`. El sistema las escribe con el indicador de
    transacción `vybe.event_system`.
  - **Destacar un evento** cuesta 19,99 € por noche (`BOOST_PRICE`) y 9,99 €
    con Business (`BOOST_BUSINESS_PRICE`; el panel enseña el 19,99 € tachado).
    `stripe-checkout` elige el precio con `venue_has_feature('included_boost')`.
    La landing ya no lo anuncia: se enseña dentro del panel. Es un pago
    único de Stripe (`plan: 'event_boost'` en `stripe-checkout`), y el webhook
    rellena `event_boosts` y `featured_until = end_date`. Los destacados salen
    primero en inicio, en el mapa y en `get_next_parties`.
  - **Precios:** están en `PLAN_PRICES` (`venue-plans.ts`) y en
    `VENUE_PRICE_CENTS` (`stripe-checkout`). Si cambias uno, cambia el otro. Sin
    `STRIPE_PRICE_VENUE_*`, el cobro usa `price_data` en línea.
  - **Prueba gratis:** al aprobar un local, `venues_start_trial` le da 30 días de
    Business con `status 'trialing'`, y `venue_plan()` la acepta.
  - **Informe semanal:** calcula `brought_people` (vinieron con «voy a ir», con
    código de RRPP o porque siguen al local) y
    `estimated_revenue = personas × (avg_spend + entrada)`. El gasto medio no
    lo ve nadie más y se guarda con `set_venue_avg_spend()`, que vuelve a
    calcular el informe de la semana pasada.
- **Dos planes: Gratis y Business** (migración 126; Pro ya no existe).
  - **Gratis:** 3 eventos activos a la vez, equipo de 3, puerta (aforo,
    contador, escáner y SOS), venta de entradas, listas y previsión.
  - **Business (69,99 €/mes):** eventos y equipo sin límite, RRPP con códigos
    y comisiones, promociones, valoraciones, públicos, curva de aforo,
    demografía, exportar y un destacado al mes incluido.
  - Sin límite es `NULL` en `venue_plan_limits()`: `v_current >= NULL` no es
    cierto y los disparadores dejan pasar. En la interfaz, `events`/`team`
    `null` en `PLANS` y `maxActiveEvents` `null` en el estado del plan.
  - `venue_subscriptions.plan` sólo admite `free` y `business`; las 22
    pruebas de Pro pasaron a Business con la misma fecha de fin.
  - **Destacado incluido:** `get_included_boosts_left()` (uno por mes natural,
    hora de Madrid) y `use_included_boost(evento)`, sólo el dueño; deja una
    fila en `event_boosts` con `included` y 0 €. El diálogo de destacar del
    panel lo ofrece antes que el pago.
