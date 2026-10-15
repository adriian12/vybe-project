# Entradas, ventas, listas y entradas de otras webs

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- **Entradas, valoraciones, públicos y previsión** (migración 068). Los
  planes los decide `venue_has_feature()` en la base de datos y `planHas()` en
  `src/lib/venue-plans.ts`; si cambias uno, cambia el otro.
  - **Entradas y mesas (Business).** El local las crea en Ventas
    (`venue-sales.tsx`, `save_ticket_type`). El público las compra en la ficha
    de la fiesta (`event-tickets.tsx`). `stripe-checkout` (`plan: 'tickets'`)
    reserva las plazas con `create_ticket_order` y la pasarela caduca a los
    30 min. `stripe-webhook` emite las entradas con `fulfill_ticket_order`,
    idempotente. Las entradas salen en «Entradas» (`purchased-tickets.tsx`)
    con QR `E-XXXXXXXX`, y la puerta las valida en Puerta → «Validar entrada»
    (`ticket-validator.tsx`, `validate_event_ticket`) o en el validador de
    vales.
  - **Stripe Connect** (migración 069, Edge Function `stripe-connect`).
    - **Cuentas:** cada negocio cobra en su propia cuenta, **sin panel de
      Stripe** (`dashboard: 'none'`): no se crea usuario ni contraseña de
      Stripe. Sus cobros, transferencias, contracargos y datos bancarios los
      ve en Ventas → «Ver cobros y transferencias» (`venue-stripe-panel.tsx`,
      componentes integrados de Stripe con `@stripe/connect-js`, sesión de la
      acción `session` de `stripe-connect` y clave pública
      `STRIPE_PUBLISHABLE_KEY` / `STRIPE_TEST_PUBLISHABLE_KEY`; **la de
      producción aún no está puesta**). El usuario pidió Express, pero Stripe
      sólo acepta Express si la plataforma responde de las pérdidas
      (`account_controller_unsupported_configuration`); `none` con
      `stripe/stripe` sí se acepta. Se crean con **Accounts v2** (`/v2/core/accounts`,
      `Stripe-Version` fija en `stripeV2()`): Stripe ya rechaza la creación
      con la v1. `fees_collector` y `losses_collector` son `stripe`, así que
      **el negocio paga las tarifas y responde de reembolsos y contracargos**,
      no la plataforma (decisión del usuario). «Activar cobros»
      (`venue-payments.tsx`, en Ventas) crea la cuenta y abre el alta con
      `/v2/core/account_links`. Si el enlace caduca, Stripe vuelve con
      `connect=refresh` y el panel abre otro solo. El tipo de panel no se
      puede cambiar en una cuenta ya creada: la de pruebas de Sala Aurora
      (panel completo) se borró el 27 de septiembre de 2026.
    - **Modo de prueba:** `STRIPE_MODE=test` hace que las funciones lean
      `STRIPE_TEST_*` (`_shared/stripe-env.ts`). Hay dos webhooks hacia
      `stripe-webhook` (plataforma y Connect), cada uno con su secreto. Las
      cuentas de un modo no existen en el otro.
    - **Estado:** se consulta al volver (`?connect=return`) y al abrir Ventas
      (`GET /v1/accounts/:id` sirve para cuentas v2). `account.updated` del
      webhook de Connect también lo actualiza.
    - **Cobro:** cargo directo (la sesión de Checkout se crea con la cabecera
      `Stripe-Account` del negocio). La plataforma sólo se queda
      `application_fee_amount` (su % y su fijo); la tarifa de Stripe la paga
      el negocio.
    - **Sin cobros activos sólo se dan entradas de 0 €** (migración 080): las
      de pago no salen y `create_ticket_order` devuelve
      `PAYMENTS_NOT_ENABLED`.
    - **Devoluciones:** en Ventas, con `Stripe-Account` y
      `refund_application_fee`. `charge.refunded` en el webhook marca las
      devoluciones hechas desde el panel de Stripe.
    - **Columnas protegidas:** las `venues.stripe_*` las protege
      `protect_venue_fields()`; sólo las escribe `service_role`.
  - **Gestión de entradas** (Ventas, migración 096, `components/venue/tickets/`).
    Ventas tiene dos pestañas, «Gestión de entradas» y «Comisiones RRPP»; la
    primera se divide en:
    - **Resumen:** ingresos, lo que queda para el negocio, aforo vendido con
      las invitaciones aparte, porcentaje que ha entrado, pedido medio,
      devoluciones, ventas por día y estado de cada tipo. Las cifras salen de
      `lib/ticket-stats.ts`, con tests.
    - **Tipos de entrada:** el editor de siempre, más la **ventana de venta**
      (`sales_start_at`/`sales_end_at`). Antes de la hora el público ve «A la
      venta el…» y `create_ticket_order` responde `SALES_NOT_STARTED`;
      pasada la hora el tipo deja de salir.
    - **Pedidos:** todos, sin el tope de 100 de antes, con búsqueda, filtros
      (pagados, invitaciones, devueltos), detalle, reenviar el correo,
      devolver y CSV.
    - **Asistentes:** `get_event_attendees`, una fila por entrada, con
      check-in a mano (`set_ticket_checked_in`, propietario y Seguridad) y CSV.
    - **Invitaciones:** `issue_comp_tickets` emite entradas de 0 €
      (`ticket_orders.source = 'comp'`) que cuentan para el aforo. Si el
      correo es de una cuenta de Fiestea, salen también en su «Entradas».
      `ticket-admin` las emite y manda el correo («Tu invitación»); `resend`
      reenvía cualquier pedido (`can_manage_ticket_order`). Tiene JWT y
      llama a SQL con la sesión de quien pide (`userClient`).
    - **CSV:** sale por `lib/csv.ts` (separador `;`, BOM, fórmulas
      neutralizadas).
  - **Permisos que daban NULL en Ventas** (arreglado en la 096). Las
    funciones `get_ticket_orders`, `get_ticket_sales`, `save_ticket_type`,
    `delete_ticket_type` y `owner_business_for_event` dejaban pasar a
    cualquiera con sesión: sin negocio, `current_venue_id() = v_venue` da
    NULL. Ahora la comprobación va en `COALESCE(…, FALSE)`, como manda la 041.
  - **Comisiones de RRPP (Business).** Por persona que entra con el código o
    un % de lo que esas personas pagaron en entradas (`get_promoter_settlement`,
    `mark_promoter_paid`, exportación a CSV).
  - **Valoraciones.** Valora quien estuvo dentro, al salir o cuando termina
    la fiesta (`rate-party.tsx` en inicio, `my_pending_rating`). En la ficha
    sólo sale la media con 3 valoraciones o más. El local las ve en
    Estadísticas (`venue-ratings.tsx`, Pro y Business), con los comentarios sin
    nombre.
  - **Avisos a públicos (Pro y Business).** Los públicos son seguidores,
    habituales (3 noches o más), «dijeron que venían y no vinieron» y «siguen
    y nunca han venido».
    - Se mandan con `queue_audience_broadcast` y los calcula
      `audience_members()`, la misma función con la que se cuenta el alcance.
    - Límite de 5 al día por local.
    - «Dentro ahora» sigue por `queue_broadcast`.
  - **Previsión de asistencia (todos los planes).** Sale en Puerta antes de
    abrir (`venue-forecast.tsx`, `get_event_forecast`). Se calcula con los «voy
    a ir», la conversión de noches anteriores, la media de ese día de la semana
    y el total real de la puerta.
- **`venue_has_feature` tiene dos firmas a propósito** (migración 070).
  - La que llama PostgREST por nombre es `(p_feature text, p_venue_id uuid)`
    y conoce todas las funciones de plan.
  - La de `(p_venue uuid, p_key text)` sólo sirve para las llamadas internas
    y usa otros nombres de argumento.
  - **Motivo:** con los mismos nombres, PostgREST respondía 300 («Multiple
    Choices») y `stripe-connect` decía «tu plan no incluye esta función» a
    locales Business.
  - **Al crear una RPC nueva**, comprueba que no exista ya otra con ese
    nombre (`pg_proc`).
- **Listas de invitados** (migración 071, todos los planes).
  - Cada evento tiene la lista de la app y una lista por RRPP, que se rellena
    a mano.
  - **En la puerta:** Puerta → «Listas» (`venue-guest-lists.tsx`). Se busca
    el nombre y se marca cuántos entran (`admit_guests`, nunca más de
    `companions + 1`). «Adrián +10» con 5 dentro deja 6 huecos.
  - **El usuario:** al marcar «voy a ir», si la lista está activada, la ficha
    pregunta si quiere apuntarse (`guest-list-join.tsx`, `join_guest_list`),
    con el mensaje del local, su nombre y los acompañantes.
  - **Permisos:** las funciones del local usan `can_count_event`, así que
    las usan el propietario y Seguridad (con cuenta o con enlace).
- **Compra de entradas** (migraciones 077 a 080).
  - La ficha lleva a `/tickets/buy/:typeId` (`TicketCheckoutPage.tsx`). Esa
    pantalla pide los datos de cada asistente (nombre y apellidos, correo con
    confirmación, teléfono y fecha de nacimiento) y comprueba la edad mínima.
  - Casillas: condiciones de Fiestea, las del negocio
    (`venues.business_terms`), publicidad y «añadir a mi cuenta».
  - Las de **0 €** también se «compran», para que tengan QR, PDF y correo.
  - Al pagar, o directamente si son gratis, se va a `/tickets/order/:orderId`
    («Proceso completado»), con el PDF y Apple Wallet.
  - El PDF y el `.pkpass` los sirve `ticket-download` con el token del pedido
    (`ticketDownloadUrl`).
  - Siempre sale un correo con el PDF (`_shared/ticket-mail.ts`) a quien
    compra, y otro a cada asistente con un correo distinto.
  - Tipos de entrada: `entry`, `vip` y `table`. Precio: 0 € o desde 0,50 €.
  - **Eliminar un tipo de entrada** (migración 091, `delete_ticket_type`):
    sin ventas se borra; con ventas se retira (`deleted_at`, deja de venderse
    y de salir en Ventas) y lo vendido sigue valiendo.
  - **Edad mínima y dress code por tipo de entrada** (migración 086): se
    ponen en Ventas. Si se dejan vacíos, valen los de la fiesta
    (`get_ticket_checkout` los combina).
  - **La tarjeta del inicio** muestra «Entradas» en lugar de «Voy a ir» si la
    fiesta vende entradas en la app (`get_events_activity().has_tickets`).
    «Voy a ir» está dentro de la ficha.
  - **El PDF** (`_shared/ticket-pdf.ts`) sigue la pantalla «Entrada» de
    Stitch:
    - cabecera con el negocio y «powered by Fiestea»;
    - franja amarilla con el tipo y la fecha;
    - QR grande;
    - recorte de ticket;
    - detalles de la entrada y datos del titular;
    - edad mínima, dress code y condiciones del negocio.

    Sin nada que no exista: ni DNI, ni «+18 verificado», ni código de barras.
  - **En el correo** cada entrada sale con el nombre de quien la lleva,
    nunca con su código («Apple Wallet · Adrián Rojas»). Lleva los enlaces a
    las condiciones de compra y a la privacidad, y sirve de justificante.
  - **Archivar entradas** (migración 088): quien compra para sus amigos
    archiva las que no son suyas en «Entradas» (`set_ticket_archived`,
    `tickets.archived_at`). Siguen valiendo en la puerta y se recuperan en
    «Archivadas».
  - **Quién vende, antes de pagar** (migración 089): la compra enseña el
    nombre, NIF, dirección y correo del negocio (`get_ticket_checkout`), el
    precio con impuestos, que no hay desistimiento y que quien da datos de
    otros cuenta con su permiso. Lo exige el artículo 97 de la ley de
    consumidores.
  - **Alta de negocio:** hay que marcar la aceptación de las condiciones
    para negocios (con el encargo del tratamiento del artículo 28 del RGPD),
    términos y privacidad. Se guarda en los metadatos
    (`venue_terms_accepted_at`, `venue_terms_version`). La versión de los
    textos es `LEGAL_UPDATED` en `src/lib/company.ts`.
  - **Google Wallet** (`_shared/google-wallet.ts`, integrado el 1 de octubre
    de 2026). Emisor `3388000000023210201`, proyecto de Google Cloud
    **«Fiestea»** (`fiestea-509713`), no `party-vybe-app` (decisión del
    usuario: ese nombre lleva «vybe» y se ve en las consolas).
    - Cuenta de servicio `fiestea@fiestea-509713.iam.gserviceaccount.com`,
      Desarrollador en la consola de Wallet. Su clave va en
      `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` (el fichero, fuera de git, en
      `D:\Webs\Vybe App\firma-google\`) y el emisor en
      `GOOGLE_WALLET_ISSUER_ID`.
    - Cada fiesta es una clase (`<emisor>.fiesta_<event_id>`) y cada entrada
      un pase (`<emisor>.<código>`). Se crean o se ponen al día por REST al
      pedir el enlace, y el JWT sólo lleva el id del pase.
    - `ticket-download?format=gwallet` redirige a `pay.google.com/gp/v/save/…`.
      El botón sale en Android (`ticket-download-buttons.tsx`) y en el correo.
    - **Falta pedir a Google el acceso de publicación**: hasta entonces sólo
      guardan pases las cuentas de prueba de la consola.
- **Entradas de otras webs** (migración 104, `external-tickets.tsx`).
  - En «Entradas» → «Añadir entrada» se sube el PDF (o una captura) de una
    entrada de Fourvenues u otra web.
  - Se lee en el propio móvil: pdf.js (versión *legacy*, por los WebView
    antiguos) para el texto y la página, y jsQR para el QR. El PDF no se sube.
  - `src/lib/ticket-import.ts` interpreta el formato de Fourvenues por posición
    y tamaño del texto (organizador, franja con fecha, nombre en letra grande,
    «Válido para N», tarifa a la izquierda, titular a la derecha, UBICACIÓN).
    Tests con dos PDF reales anonimizados en `src/lib/__fixtures__/`.
  - De otros PDF sólo se fía del QR; nombre y fecha los completa la persona.
  - `external_tickets` guarda el contenido exacto del QR y lo que se enseña,
    nunca correo ni teléfono. RLS: cada persona sólo las suyas. Entra en
    `export_my_data`.
  - La puerta la sigue validando la plataforma que la vendió: Fiestea vuelve a
    pintar el mismo QR. Si la fiesta existe en Fiestea ese día, se enlaza
    (`matchEvent`) para enseñar el cartel y la ficha.
  - pdf.js pinta con `intent: 'print'`: con `display` usa requestAnimationFrame
    y se para si la app pasa a segundo plano.
