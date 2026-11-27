# Administración, Funout y fiestas de la plataforma

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- **Funout** (migraciones 082 y 083, con permiso de Funout).
  - **Qué se toma:** sólo sus datos (nombre, sala, día y hora, dirección,
    ubicación, estilo, dress code, cartel como enlace, entradas y line-up).
    Sus textos no se copian.
  - **Sincronizador:** `funout-sync` guarda los eventos en `funout_events` sin
    duplicar, por el id de Funout. Las coordenadas de cada sala, las que traiga
    Funout o las que se busquen en Photon (OpenStreetMap), quedan en
    `funout_places`.
  - **El cortafuegos de Funout rechaza un agente de navegador que llega desde
    un servidor (403).** `funout-sync` pide con `Fiestea/1.0` y así pasa.
    Nominatim sí bloquea a Supabase: por eso se usa Photon. El panel, además,
    lee Funout desde el navegador del admin (su API admite CORS) y manda la
    lista a la función (`events`), al abrir la sección si los datos tienen más
    de 30 minutos y con «Actualizar».
  - **Cron** (migración 087): `fiestea-funout` una vez al día, a las 23:00 de
    Madrid. pg_cron va en GMT, así que salta a las 21:00 y 22:00 GMT y sólo
    llama a la función cuando en Madrid son las 23. Usa `CRON_SECRET`, el
    mismo valor que `funout_cron_secret` en Vault. Fue decisión del usuario:
    cada hora no hacía falta.
  - **Panel:** administración → Eventos → FUNOUT: marcar en grupo y «Añadir a
    FIESTEA». `admin_import_funout` crea fiestas del local de la casa con
    `external_source = 'funout'`, y `funout_refresh_imported` las pone al día
    en cada pasada.
  - **Qué se actualiza** (migración 085): sólo fechas, cartel, enlace de compra
    y la ubicación si faltaba. Nombre, sala, dirección y precio son de
    administración y no se pisan.
  - **El local de la casa no tiene límites** (migración 084): `venue_plan()`
    le da Business. Antes, al añadir varios eventos, saltaba
    `PLAN_EVENT_LIMIT`.
  - **El dueño del local de la casa es `sistema@fiestea.es`,** una cuenta de
    sistema sin contraseña conocida y de tipo invitado. No puede ser el admin
    que lo crea, por dos motivos: una cuenta dueña de un local entra como
    negocio, y al borrarla caerían en cascada el local y sus fiestas.
    `admin_house_venue()` da `HOUSE_OWNER_MISSING` si falta.
  - Los eventos tienen su propia sala y dirección (`place_name`, `address`).
  - Administración edita cualquier fiesta con el lápiz (`admin_update_event`).
  - Eventos va debajo de Usuarios en el menú.
- **Enlaces de Fourvenues a nombre de un RRPP** (migración 113): Funout trae
  los de Fourvenues como `/es/alejandro-aguilo-pareja/events/…`. El bueno es
  el del micrositio de la discoteca (`fitz-mallorca`, `discoteca-amok-mallorca@amok`,
  `over-club`, `selva`, `palma-events`, `bcm-mallorca`, `enredo-club`,
  `sala-wave-club`, `boomerang`), con el mismo final. **Fourvenues enseña la
  fiesta con cualquier micrositio**, así que «no da 404» no basta: la página
  del RRPP trae `"organization":{"id":…,"slug":…}` y cada micrositio el id de
  su organización (`transfer-state-microsite-<slug>` → `channel.id`). Así se
  corrigieron 21, todas pasadas. Fourvenues está detrás de Cloudflare y el
  usuario no quiere que se use su Chrome para esto. `funout_upsert_event`
  ya no pisa un enlace de Fourvenues corregido si apunta al mismo evento.
- **Denegar un negocio lo borra** (Edge Function `admin-reject-venue`, con
  confirmación): logo, documentos y la fila de `venues` (lo que cuelga va en
  cascada) y, si la cuenta sólo era del negocio (sin perfil de fiester@ o con
  `staff_only`, y sin otros negocios), también la cuenta de acceso. Así el
  correo, el teléfono y el NIF quedan libres. Sólo con negocios sin aprobar.
- **Plan de un negocio nuevo**: al aprobarlo tiene 30 días de Pro de prueba
  (`venues_start_trial`); administración lo enseña como «Pro · prueba».
- **Activar funciones en bloque** (migración 121): en Eventos se marcan
  fiestas y «Activar funciones» enciende, apaga o deja igual (`NULL`) Entrar al
  evento, Flechazo, Recuento, % hombres y mujeres y Lista Fiestea, con
  `admin_set_events_features`. Sin «Entrar al evento» no hay Flechazo
  (`events_swipe_needs_entry`). Los sorteos no son un interruptor: los crea
  el negocio en cada fiesta.
- **Valores por defecto al crear una fiesta:** Entrar al evento y Flechazo
  encendidos; Recuento, % hombres y mujeres y Lista apagados; sellos
  encendidos y peticiones de canciones apagadas. En las de Fiestea
  (`platform_events_swipe_off`), Entrar y Flechazo sólo si tienen ubicación.
- **Escáner rápido y un solo aviso** (migración 119):
  - `admin_list_scanned` tardaba 10,7 s (más que el tope de 8 s de
    `authenticated`: «no hay resultados»); ahora cruza claves precalculadas y
    tarda 0,1 s.
  - El panel añade por tandas de 40 (`TANDA`); con más de 3 fiestas
    (`AVISO_UNICO`), `admin_import_scanned(…, p_quiet)` fija
    `vybe.quiet_events` y `push_on_event_published` no avisa por cada una. Al
    acabar, `admin_announce_new_events(n)` manda a los seguidores de Fiestea
    un único «Fiestea ha añadido varias fiestas nuevas» (`EVENTS_BULK` en
    `send-push`, `newEvents` en `push-texts`) que abre `/map`.
  - Las ya añadidas salen al final, al 40 % de opacidad y sin poder marcarse.
  - Funout no pasa por aquí: sigue avisando fiesta a fiesta.
  - **También sin el panel nuevo** (migración 120): si una sola llamada trae
    más de 3 fiestas sin `p_quiet` (un panel abierto desde antes de publicar),
    el servidor calla y manda él el aviso único. El 22-10-2026 llegaron 527
    avisos de Barcelona por añadir con la página abierta desde antes de la 119.
- **Plan de un usuario con Premium de una fiesta** (migración 117): el
  selector de Usuarios ya no se bloquea. «Sin Premium» cancela también el de la
  fiesta; mensual o vitalicio se añaden y dejan el de la fiesta. (En Aurora,
  que acaba en 2030, ese Premium caducaba en 2031 y no había forma de quitarlo.)
- **Ahora se cambia por la sala** (migración 116): la tabla
  `fourvenues_microsites` (`venue_search_key(place_name)` → slug) y el
  disparador `events_fourvenues_venue_link` reescriben el canal de cualquier
  enlace de Fourvenues al del local, al crear o editar la fiesta (también lo
  que trae Funout). Sala sin fila: el enlace se queda como venga. Para un local
  nuevo, una fila más (con sus variantes de nombre). Quedan con RRPP las
  fiestas de Sala Sunset, La Santa, Son Fusteret y «Club» (PARAO), que no
  tienen micrositio conocido.
- **Escáner** (migración 114, `scan-sync`, `admin-scanner.tsx`): Eventos →
  ESCÁNER, al lado de FUNOUT. Lee Xceed (la página pública de eventos de cada
  ciudad, estado de Next en `self.__next_f`; su API pide clave) y Resident
  Advisor (GraphQL; zonas Barcelona 20, Madrid 41, Alicante 613) y guarda en
  `scanned_events`. Las salas de Xceed sin coordenadas se buscan en Photon;
  RA pone 0,0 a las salas «TBA» y se tratan como sin ubicación. El panel junta
  la misma fiesta de varias webs (`src/lib/scan-groups.ts`) y deja elegir el
  enlace de entradas; «Repetida» si ya hay una fiesta con ese nombre esa
  noche. `admin_import_scanned` crea una fiesta por grupo en el local de la
  casa (`external_source = 'scan'`). Al abrir la sección se reescanea si los
  datos tienen más de 6 h. **Fourvenues no se escanea** (bloquea robots; sólo
  con su API oficial). El script local `scraper_fiestas_v2.py` hace lo mismo
  y escribe `eventos_scrap/eventos_<ciudad>.csv` con todos los campos.
- **Administración → Eventos** se ordena en «Más cercanos» (por defecto: las
  que siguen en marcha o están por venir, de la más próxima a la más lejana, y
  después las pasadas), «Más recientes» o «Más antiguos». Carga hasta 500.
- **Fiestas de la plataforma** (migración 072).
  - **Sin QR en la puerta** (migración 100): nacen con el swipe apagado
    (`platform_events_swipe_off`) y la ficha sólo ofrece «Voy a ir». Si
    administración enciende el swipe al editarlas (los mismos interruptores
    del panel, `EventLiveSettings` en `admin-event-form.tsx`), la ficha y
    «Entradas» enseñan «Estoy aquí», que entra por ubicación
    (`enter_platform_event`).
  - Administración las crea en «Nueva fiesta» (`admin-event-form.tsx`). El
    selector de local tiene buscador, y la opción por defecto es el local de la
    casa (`venues.is_platform`, `admin_house_venue()`). En la tarjeta salen
    como «Evento creado por Fiestea».
  - `is_platform` está protegida (`protect_venue_fields` y
    `venues_protect_insert`), y ese local no sale en la lista de locales de
    administración.
  - `events.city` y `events.region` no existían y `admin_create_event` fallaba
    siempre. La app usa la localidad del evento antes que la del local.
- **Reportar error** (17-11-2026, migración 138, `bug-report-dialog.tsx`,
  `admin-bug-reports.tsx`).
  - **Dónde:** Perfil → Ajustes («Reportar error») y, en el panel del negocio,
    el menú de la cuenta. Título (3-120), descripción (10-4000) y una imagen
    opcional (JPG, PNG o WebP de hasta 5 MB; en el móvil, de la galería).
  - **Guardado:** tabla `bug_reports` sin acceso directo (`submit_bug_report`,
    como mucho 5 por hora y cuenta) y bucket privado `bug-reports` (cada uno en
    su carpeta `<uid>/`; lee administración). Se guarda también la plataforma,
    la pantalla, el idioma y el tamaño de pantalla (`context`).
  - **Administración:** Reportes tiene dos pestañas, «Personas» (las denuncias
    de siempre, tabla `reports`) y «Errores de la app»; el número de la sección
    suma las dos. «Ver captura» firma el enlace una hora.

## Ubicación de una fiesta: salas conocidas

En el buscador de ubicación (`LocationPicker`), al escribir salen las salas que ya
están en otras fiestas (`search_known_places`, migración 139: agrupa por
`venue_search_key`, así «Es gremi» y «Es Gremi» son una, y da el punto, la dirección
y la ciudad que más se repiten). Al elegir una, el pin va a su sitio y, en el
formulario de administración, se rellenan el nombre de la sala y, si falta, la
ciudad. Sólo para administración y cuentas con negocio.

## Caduca pronto sin renovación

En Usuarios y en Negocios, una etiqueta roja «Caduca en N días» para el Premium o
el plan que acaba en 7 días o menos sin renovación automática (`lib/caducidad.ts`,
con test). En negocios va en la cabecera de la tarjeta, sin tener que abrirla.

- **Borrar negocios y cuentas** (Edge Function `admin-delete`, 25-11-2026):
  botón en la ficha de Negocios y de Usuarios; se confirma escribiendo el
  nombre. Un negocio se borra solo o con la cuenta de su dueño (marcado por
  defecto). La cuenta se borra con la misma lógica que `delete-account`
  (`_shared/borrar-cuenta.ts`). No deja borrar negocios con entradas cobradas
  (`VENUE_HAS_SALES`: los pedidos son contabilidad y caerían en cascada), el
  local de la casa, administración, la propia cuenta, `sistema@` ni las de
  revisión, ni cuentas con Premium de Apple que se sigue renovando.

- **Usuarios reales** (migración 147). La sección Usuarios oculta por defecto las cuentas de prueba: administración, correos de `@seed.vybe.test`, `@vybe-test.local`, `@test.com`, `@example.com` y `@fiestea.es`, y las marcadas a mano en `admin_test_accounts` (botón «Marcar como prueba»). Los revisores de Apple entran con «Iniciar sesión con Apple» y un correo `privaterelay` nuevo en cada revisión: hay que marcarlos a mano. Etiquetas: Fiester@, Invitado y «Alta sin terminar» (fiester@ sin `profile_completed_at`, se quedó en el diálogo de completar perfil). Al invitado no se le pide nada más, así que nunca sale «sin terminar».

## Analítica de uso y descargas (migración 152)

- Admin › Métricas: arriba `admin-analytics.tsx` (descargas + uso por tipo de
  persona), debajo el embudo de siempre.
- `analytics-collect` decide el tipo con la sesión que manda el cliente
  (`observability.ts` ya envía el token de la persona, antes mandaba la clave
  anónima y `profile_id` salía siempre vacío): `fiester`, `guest`,
  `incomplete`, `explorer` (sesión anónima), `venue`, `admin`, `visitor`.
- Sesión = `sid` en memoria por apertura; nueva tras 30 min en segundo plano.
  `app_background` marca el cierre (duración y pantalla de salida).
- Plataforma, versión y origen de instalación los pone `services/native.ts`
  con `setAnalyticsContext`; `test`/`testflight`, admin y cuentas de prueba
  no cuentan en `admin_analytics_report`.
- Las rutas se agrupan en SQL con `analytics_route()`; el nombre de cada
  pantalla está en `PANTALLAS` del componente y en `admin.analytics.screens`.
- Los datos por tipo empiezan a llenarse cuando la web y las apps llevan este
  código (las filas anteriores no tienen `session_id` y no salen).
- Se borran a los 13 meses (cron `fiestea-purgar-analitica`).

## Cuentas con el correo sin confirmar (migración 154)

- El alta por correo crea el perfil antes de confirmar: un correo mal escrito
  dejaba un «usuario» que nunca podrá entrar. En Admin › Usuarios salen con la
  etiqueta roja «Correo sin confirmar» y el botón «Reenviar correo de
  confirmación» (usa `auth-email`, con la espera de 90 s de la migración 153).
- No cuentan entre los reales (`admin_user_counts.unconfirmed`, chip rojo) ni
  en las altas del informe de descargas.
