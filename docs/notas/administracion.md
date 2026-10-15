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
