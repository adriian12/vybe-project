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
