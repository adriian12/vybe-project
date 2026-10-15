# Pagos: Stripe, Apple, Google Play, Premium y supercrush

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- **Compra integrada de Apple en iOS** (migración 074). En el iPhone,
  Premium (mensual y de una fiesta) y los supercrush se venden con In-App
  Purchase, porque Apple lo exige para el contenido digital. Android y la web
  siguen con Stripe, igual que las entradas y «destacar» en todas partes.
  - **Productos** (App Store Connect, ficha 6815824600):
    - `es.fiestea.app.premium.monthly`: suscripción, grupo «Fiestea Premium», 9,99 €;
    - `es.fiestea.app.premium.event`: consumible, 4,99 €;
    - `es.fiestea.app.supercrush`: consumible, 0,99 €, porque Apple no tiene
      el punto de 1,00 €.

    El precio que se enseña en el iPhone sale de StoreKit.
  - **Flujo** (`src/services/iap.ts`, plugin `@capgo/native-purchases`,
    StoreKit 2):
    1. `apple-iap` `precheck` aplica las reglas de `stripe-checkout`.
    2. Se compra con `appAccountToken` = id del perfil.
    3. `apple-iap` `verify` verifica el JWS de Apple (`_shared/apple-jws.ts`:
       cadena `x5c` hasta Apple Root CA G3 fijada por su huella) y activa lo
       comprado (`_shared/apple-grant.ts`).
    4. Sólo entonces se cierra la transacción (`acknowledgePurchase`).

    Al abrir la app, `syncApplePurchases()` reenvía lo que quedó abierto.
    `apple_transactions` evita sumar dos veces.
  - **Renovaciones, cancelaciones y devoluciones:** llegan por App Store
    Server Notifications V2 a `apple-notifications` (sin JWT, verifica la
    firma). La URL está puesta en la ficha, también para sandbox.
  - **Premium comprado con Apple:** se cancela en los ajustes del iPhone
    (`manageSubscriptions`). `my_premium_status().store` dice de qué tienda
    viene.
  - **En el diálogo:** «Restaurar compras» y el texto de renovación que pide
    Apple.
- **Google Play Billing en Android** (migración 090). Google exige su cobro
  para el contenido digital de una app de Play, igual que Apple. Premium y
  supercrush se compran en Android con Google Play; la web sigue con Stripe y
  las entradas van con Stripe en todas partes.
  - **Productos en Play Console:** los mismos identificadores que en Apple:
    suscripción `es.fiestea.app.premium.monthly` con plan base `monthly`, y
    productos sueltos `es.fiestea.app.premium.event` y
    `es.fiestea.app.supercrush` (con «varias unidades por transacción»: la
    cantidad se elige en la hoja de Google y `google-play` abona `quantity`).
  - **Flujo** (`src/services/iap.ts`, común a las dos tiendas): `google-play`
    `precheck` (reglas compartidas en `_shared/iap-precheck.ts`) → compra con
    `obfuscatedAccountId` = id del perfil → `google-play` `verify` pregunta a
    la Google Play Developer API (`_shared/google-play.ts`) y activa → la app
    confirma la suscripción o consume el producto.
  - **Cuenta de servicio** (`_shared/google-auth.ts`):
    `GOOGLE_SERVICE_ACCOUNT_JSON` o, si no está, la de Firebase de los avisos
    (`FCM_CLIENT_EMAIL`). Necesita permisos en Play Console.
  - **Renovaciones y devoluciones:** llegan por Pub/Sub a
    `google-play-notifications?token=<GOOGLE_RTDN_TOKEN>` (sin JWT). La URL
    completa está en `D:\Webs\Vybe App\google-rtdn-url.txt`, fuera de git.
  - `my_premium_status().store` puede ser `google`: se cancela en Google Play.
- **Borrar la cuenta** (`delete-account`) cancela el Premium mensual que
  siga renovándose: Stripe al momento y Google Play con la Play Developer API
  (`cancelGoogleSubscription`, la cuenta de servicio necesita «Gestionar pedidos
  y suscripciones»). Apple no deja cancelar desde el servidor: si hay una
  suscripción de Apple renovándose, la función responde
  `APPLE_SUBSCRIPTION_ACTIVE` sin borrar nada y la app pide cancelarla en el
  iPhone; con `appleConfirmed` («ya la he cancelado») sigue. Si una
  cancelación falla, `CANCEL_FAILED` y tampoco se borra. Los pedidos y entradas se quedan en las ventas del local sin
  persona (migración 073, `ON DELETE SET NULL`).
- **Cobros y supercrush** (migración 062). Cinco productos en Stripe
  (`STRIPE_PRICE_MONTHLY_USER` 9,99 €/mes, `STRIPE_PRICE_EVENT` 4,99 €,
  `STRIPE_PRICE_SUPERLIKE` 1 €, `STRIPE_PRICE_VENUE_PRO` 49 €,
  `STRIPE_PRICE_VENUE_BUSINESS` 99 €).
  - **El móvil no puede escribir en `premium_subscriptions`**: antes las
    policies de INSERT/UPDATE dejaban activarse Premium gratis. Sólo escribe
    el webhook. Cancelar la mensual es `stripe-checkout` con
    `action: 'cancel'` (cancela al final del periodo en Stripe).
  - **Premium por evento sólo vale en su evento**: `is_premium()` mira el
    evento en el que está la persona (`active_event_of()`), y
    `is_premium_for_event()` cuando la función ya sabe el evento. Caduca una
    hora después del final. `stripe-checkout` exige estar dentro y que no haya
    terminado; la app lee `my_premium_status()`.
  - **Supercrush**: saldo en `supercrush_ledger`. Todo fiester@ tiene uno
    de regalo en cada fiesta (`included`, `delta` 0, migración 109; antes
    sólo Premium): se gasta antes que los comprados, no se suma al saldo si
    no se usa y salir y volver a entrar no da otro. El resto sale del saldo
    (`spent`). La app lo avisa encima del botón de supercrush.
    Se cobra en el disparador `swipes_charge_supercrush` (`NO_SUPERCRUSH` si
    no hay). Se compran de 1 en 1 (`credit_supercrush_purchase`, idempotente
    por sesión de Stripe) y cada cuenta nueva recibe uno de regalo
    (`welcome`). `my_supercrush()` da saldo e incluido.
  - **En la app instalada** Stripe se abre en el navegador del sistema y
    vuelve por `public/pago.html`, que reabre la app con `vybe:///profile?…`
    (Stripe sólo acepta https).
  - **Planes de local:** Pro ya no exporta ni tiene curva de aforo; Business lo
    tiene todo, también exportar PDF (`exportSummaryPdf`, ventana de imprimir).
- **Comisión de la plataforma por local:** `venues.platform_fee_percent`, de
  0 a 50 y 0 por defecto. La fija administración en Locales, al abrir un
  local (`admin_set_venue_fee`), y está protegida en `protect_venue_fields()`.
  `stripe-checkout` la aplica como `application_fee` sólo a las entradas.
- **Avisos de suscripción** (Edge Function `admin-notify`). Son los botones
  encima del buscador de usuarios y de locales:
  - **«Caduca pronto»:** avisa sólo a quien no renueva solo (cancelado, en
    prueba o con el plan dado por administración) y caduca en 7 días. A los
    usuarios les llega push y correo; a los locales, correo. Una vez por
    fecha (`subscription_notices`).
  - **«Enviar novedad»:** a los usuarios va por la cola de avisos, a todos;
    a los locales, por correo.
