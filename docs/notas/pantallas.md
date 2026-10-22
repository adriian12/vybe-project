# Pantallas de la app, compartir y textos legales

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- **Textos legales** en `src/lib/legal-docs.ts` (la página es `LegalPage.tsx`),
  pendientes de revisión por un abogado. Hay un índice en `/legal` y ocho
  documentos: privacidad, términos, cookies, aviso legal, condiciones de compra,
  condiciones para locales, eliminar la cuenta y soporte. Cada uno tiene un
  nombre en inglés (`privacy`, `terms`…, los que usan los enlaces antiguos y el
  consentimiento) y alias en español (`privacidad`, `terminos`,
  `aviso-legal`…). Las URL públicas son `https://fiestea.es/legal/<alias>`.
  **Si cambia lo que hace la app con los datos, cambia el texto.**
- **Compartir** (`src/components/share-sheet.tsx`, `src/lib/share.ts`):
  WhatsApp, Instagram (copia el enlace y abre los mensajes de Instagram),
  copiar y la hoja del sistema (`@capacitor/share` en la app). El enlace
  sale siempre de `app.fiestea.es` (`APP_URL`); `VITE_SITE_URL` ya no existe
  (en el APK seguía apuntando al dominio antiguo).
- **Vista previa del enlace de una fiesta** (migración 108, `api/`).
  - **Para quién:** los robots de WhatsApp, Telegram, iMessage, X, Slack,
    Discord… no ejecutan JavaScript. Una regla de `vercel.json` (cabecera
    `user-agent`) les manda `/event/:id` a `api/share-event.ts`. Las
    personas siguen yendo a la app.
  - **Qué devuelve:** una página con las etiquetas Open Graph: nombre,
    «jue, 15 oct · 23:59 · Fitz, Palma» y la imagen.
  - **La imagen:** `api/share-image.ts` da un JPG de 1200 × 630 con el cartel
    entero sobre su versión desenfocada.
    - Los AVIF de Funout (AV1 de perfil 1 a 10 bits) no los abre el libaom de
      `sharp`: van por dav1d (`@jsquash/avif`, WebAssembly). El `.wasm` se
      incluye a mano (`functions.includeFiles`).
    - Sólo se descargan carteles de `funout.es`, `images.unsplash.com` y
      nuestro Storage. Si no hay cartel o falla, sale `og-image.png`.
  - **Los datos:** salen de `get_event_share`, que puede llamar `anon`, con
    la clave anónima (`VITE_SUPABASE_*` del proyecto de Vercel).
  - **Robot nuevo:** si un robot no sale en la lista de `vercel.json`, se
    añade allí.
- **Enlaces que abren la app:** `public/.well-known/assetlinks.json` (huella
  SHA-256 del certificado del APK actual; al publicar en Play hay que añadir
  la de *Play App Signing*) y `apple-app-site-association` (equipo
  `XQ5WB5Y646`).
- **Mapa:** al abrirlo sólo se ve el mapa. Tocar un alfiler enseña su tarjeta
  y tocar la tarjeta abre el evento; la lista sale con «Ver lista». Los
  destacados llevan una llama sobre el alfiler (`.vybe-pin-fire`).
  - **Encuadre:** con ubicación, tu localidad (`ZOOM_LOCALIDAD = 12`); sin ella,
    todas las fiestas. Sólo una vez: si ya has arrastrado el mapa no se mueve.
    La posición se pide primero rápida (`FAST_POSITION`, vale la de la red) y,
    si falla, con GPS: con GPS fino solo, dentro de casa se quedaba sin ella.
  - **Botón de ubicación** siempre a la vista (`relocate()` de
    `useEventsFeed` si aún no hay posición); vuelve a tu zona y quita la ciudad.
  - **Ciudades en el buscador** (`lib/places.ts`, `city-search-results.tsx`):
    Photon (komoot) con `bbox` de España y Canarias, capas city/locality/
    district, desde 3 letras. Al elegir una, el mapa va a su término
    (`extent`) y sólo salen las fiestas dentro (`enZona`, con 0,04° de margen;
    sin término, 15 km). El chip de la ciudad la quita. Photon se nombra en los
    textos legales.
  - **Las fiestas se leen por páginas** (`getEvents`, 1.000 por petición, hasta
    10): con toda España se cortaba sin avisar en la primera página.
  - Una ciudad sin fiestas es una ciudad sin fiestas en Fiestea: las de Madrid y
    Barcelona del Escáner no salen hasta que se añaden desde administración.
- **La cabecera superior está oculta** (`MOSTRAR_CABECERA` en `header.tsx`, y
  `--header-h` reducida a la zona segura).
- **Calendario del filtro de fecha** (inicio y mapa): a pantalla completa
  (`closeClassName` de `SheetContent` baja la X bajo la barra de estado) y con
  los atajos en una fila, para ver el mes entero sin desplazar. Es el de la ficha del
  negocio (`venue-calendar.tsx`) con todas las fiestas: el cartel en cada
  noche y «×N» si hay varias. Agrupa por noche (`nightOf`, lo de madrugada a
  la anterior), no por día, para cuadrar con el filtro.
- **Tablón:** detrás de la tarjeta asoman dos tarjetas lisas, sin la foto de
  las siguientes (girada y transparente se veía difuminada detrás).
- **Filtros de fiestas** (`party-filters.tsx`, lógica en `lib/party-filters.ts`):
  «Música» agrupa los géneros; Tardeo (empieza 17:00-22:59), Nocheo
  (23:00-04:59) y After (05:00-13:59). Están en inicio y en el mapa.
- **Los idiomas se descargan aparte.** Sólo el español viaja en el fichero
  principal; inglés, alemán y catalán son fragmentos que se piden al vuelo. Para
  cambiar de idioma hay que usar `changeLanguage()` de `@/i18n`, no
  `i18n.changeLanguage()` directamente, o se cambia sin haber descargado el
  diccionario. `main.tsx` espera a `i18nReady` antes de pintar.
- **Las pantallas pesadas van con `lazy()`** (panel de local, administración,
  swiping, acceso al evento, legal). Si añades una pantalla grande, hazlo igual:
  el fichero principal ya estaba en 860 KB.
- **Un solo código para web y móvil.** `src/services/native.ts` decide de dónde
  salen la cámara, la ubicación y los avisos: del sistema operativo dentro de la
  aplicación instalada, del navegador fuera. Ninguna pantalla tiene dos
  versiones, y en el navegador las funciones nativas no hacen nada.
- **Ficha del evento** (rediseño del 14-10-2026, tomado de la «web de venta»
  de Fourvenues y adaptado al móvil y a los colores de Fiestea).
  - **Arriba:** la línea «SÁB 17 OCT 2026 | 23:30 – 06:00», el título y el
    local.
  - **Etiquetas:** los géneros salen de `theme`, separados por comas: tres a la
    vista y «+N».
  - **Descripción:** con «Ver más» y, debajo, el **line-up**.
  - **Desplegables amarillos** (`Desplegable`):
    - **Entradas:** tipos `entry` y `vip`, más el enlace externo.
    - **Listas:** `GuestListJoin`.
    - **Reservados VIP:** tipos `table`.

    El contenido queda montado aunque esté cerrado, y cada uno se oculta si
    no tiene nada. Al marcar «voy a ir» se abre Listas.
  - **Distancia:** está en la tarjeta de «Cómo llegar» («a 1,2 km»). Sin
    ubicación, el enlace «¿A qué distancia está?» la pide.
- **Line-up** (migración 105, `src/lib/lineup.ts`).
  - Se guarda en `events.lineup` (JSON), validado por `valid_lineup`.
  - Cada artista lleva nombre, hora opcional («01:30 – 03:00») e Instagram
    opcional. Se guarda sólo el usuario: «@x» o el enlace se limpian.
  - Lo escribe el negocio en el formulario del evento (`LineupEditor`) y
    administración en el suyo (`p_lineup` de `admin_create_event` y
    `admin_update_event`, que ya no tienen versiones viejas).
  - **Funout** trae sólo nombres: `funout_upsert_event` los pone al importar
    y al refrescar sólo si el line-up sigue vacío. Antes iban como texto en la
    descripción («Line-up: …»); la migración los movió y limpió esas
    descripciones.
  - Todo el recuadro de «Cómo llegar» abre la ruta, y el cartel se abre a
    pantalla completa al tocarlo.
- **Etiquetas de tarjeta y ficha.**
  - **Tardeo, nocheo o after** salen solos según la hora de inicio
    (`franjaDe()`), igual que el filtro.
  - **El precio va siempre como «Desde 15 €»** (`home.fromPrice`), porque casi
    siempre hay varios.
  - Las importadas (Funout) sin precio no dicen «Gratis»: no llevan etiqueta
    de precio.
- **Capas:** las hojas (`Sheet`) van en `z-[900]` para quedar por encima de
  Leaflet. Por eso los diálogos van en `z-[1000]`, los menús flotantes en
  `z-[1100]` y los avisos en `z-[1200]`; si no, lo que se abre desde una hoja
  queda debajo. «Avisar a quien está dentro» se llama ahora «Enviar un aviso».
- En la interfaz la persona que sale de fiesta es **«fiester@»**. En el código
  se llama `vyber`, `clubber()` o `userType 'user'`, nombres internos que no
  salen en pantalla.
- **Inicio:** ya no tiene el selector de zona ni «cerca de mí» (para eso está
  el mapa), ni la etiqueta naranja de destacado en las tarjetas: los
  destacados tienen su carrusel.
