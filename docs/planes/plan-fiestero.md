# Plan · Mejoras para el fiester@

Cuatro funciones, en el orden recomendado. Cada fase se entrega terminada
(cuatro idiomas, `npm run verify`, prueba en móvil) antes de pasar a la
siguiente. Última migración existente: `128`.

| Fase | Función | Tamaño | Depende de ti |
|------|---------|--------|---------------|
| 1 | Volver a casa (Taxi · Uber · Cabify) (hecho, sin probar con sesión) | Medio | Sí: ver «Lo que necesito» |
| 2 | Calendario y recordatorio de la fiesta (hecho, migración 129) | Pequeño | No |
| 3 | Avisos de «últimas entradas» (hecho, migración 130) y de bajada de precio (espera a los tramos) | Medio | No |
| 4 | Reventa oficial y cambio de titular (aplazada) | Grande | Sí: reglas de reventa |

---

## Fase 1 · Volver a casa

### Qué ve el fiester@

- Un botón **«Volver a casa»**:
  - en la tarjeta «Estás dentro» de Inicio y en la pantalla de la fiesta;
  - en el aviso «¿Dónde seguimos?» que ya sale media hora antes del final;
  - y siempre en Perfil → Seguridad.
- Si no ha guardado su casa, se le pide una vez (buscador de direcciones).
  Puede cambiarla o borrarla cuando quiera, y también elegir «Otra dirección»
  solo para esta noche.
- Una hoja con tres opciones, **Taxi · Uber · Cabify**. Cada una muestra:
  - el **precio aproximado** («≈ 14–18 €»);
  - el **tiempo de trayecto** («22 min»);
  - si se sabe, cuánto tarda en llegar el coche.
- Al tocar una se abre esa app **con el destino ya puesto**. Allí la persona
  ve el precio exacto y pide el coche. Si no tiene la app instalada, se abre
  la web o la tienda.
- **Taxi** da dos salidas: llamar a la radio taxi de la ciudad del local
  (Palma, Madrid, Barcelona…) o abrir una app de taxi, si existe en esa ciudad.
- Debajo: **«Avisar a alguien de que vuelvo»**. Comparte por WhatsApp o
  mensaje la ruta y la hora estimada de llegada. No guarda nada en el
  servidor.

### Cómo lo hace Google Maps y qué podemos hacer nosotros

Google Maps enseña Uber y Cabify con precio porque tiene **acuerdos comerciales
privados** con ellos. Esa integración no está abierta a otras apps. Lo que sí
está a nuestro alcance:

1. **Abrir la app con el destino puesto (enlaces profundos).** Es gratis y no
   hace falta clave.
   - **Uber:** `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=…&dropoff[longitude]=…&dropoff[nickname]=Casa`
     abre la app con el destino; sin la app, abre la web.
   - **Cabify:** tiene su propio enlace de app. El formato exacto se
     comprueba en un móvil durante la fase. Si falla, se abre la app sin
     destino, o la tienda.
   - **Taxi:** `tel:` al número de radio taxi, o el enlace de la app de taxi.
2. **Precio exacto de Uber por API.** El endpoint de estimaciones de Uber
   **requiere aprobación de Uber** (hay que pedirla a su equipo comercial).
   Además, sus condiciones **prohíben usarlo para comparar precios con otros
   servicios**, que es justo lo que haría una hoja Taxi | Uber | Cabify.
   Conclusión: no lo usamos salvo que Uber lo autorice por escrito.
3. **Precio de Cabify por API.** Cabify tiene una API de estimaciones, pero es
   de su producto para empresas y necesita un acuerdo (y un token). Lo mismo:
   solo si Cabify lo autoriza.
4. **Precio aproximado calculado por Fiestea.** Funciona ya y sin acuerdos:
   - Se calculan la distancia y el tiempo del trayecto con un servicio de
     rutas (en «Lo que necesito»).
   - **Taxi:** se aplica la **tarifa oficial** de esa ciudad (bajada de
     bandera, €/km, recargo nocturno o festivo, suplementos de aeropuerto o
     puerto). Es una tabla en la app, por ciudad.
   - **Uber y Cabify:** una horquilla aproximada por ciudad (precio base +
     €/km + €/min, con margen arriba por la demanda de madrugada), con la
     etiqueta **«Aproximado · el precio final te lo da la app»**.
   - Si un día firmamos con Uber o Cabify, la horquilla se cambia por su
     precio real sin tocar la pantalla.

**Recomendación:** lanzar con 1 + 4 (enlaces profundos + precio aproximado
propio) y pedir en paralelo acceso a Uber y Cabify, por si aceptan.

### Cómo se construye (decidido: Mapbox)

- **Proveedor: Mapbox.** El token (`MAPBOX_TOKEN`, público `pk.`, sin scopes
  secretos ni restricción de URL) ya está en `.env`. Se sube a los secretos de
  Supabase y **nunca viaja en la app**.
- **APIs:**
  - **Geocoding v6**
    (`/search/geocode/v6/forward`, `country=es`, `autocomplete=true`,
    `proximity` = posición actual) para el buscador de «Casa».
  - **Directions v5** con perfil `driving-traffic` (`overview=false`) para
    kilómetros y minutos.
- **Condición de Mapbox:** los resultados del buscador gratuito no se pueden
  guardar. Por eso **en el móvil solo se guarda el texto de la dirección**
  elegida, nunca sus coordenadas. Cada vez que se pulsa «Volver a casa», la
  función busca ese texto (1 petición) y calcula la ruta (otra petición).
  Así todo queda dentro de los tramos gratuitos, sin la geocodificación
  permanente, que se paga desde la primera petición.
- **Edge Function `ride-estimate`** (`verify_jwt = true`), con dos acciones:
  - `search` (sugerencias del buscador);
  - `route` (origen en coordenadas + texto de casa → km y minutos).
  El origen se redondea a unos 100 m antes de enviarlo. No guarda nada.
- **Topes, sin tabla nueva:** reutiliza `consume_anon_rate_limit` (el
  contador de `_shared/rate-limit.ts`):
  - **por persona:** 20 consultas por hora;
  - **global:** 3000 al día, unas 90 000 al mes, por debajo de las 100 000
    gratuitas de cada API. El cupo es diario y no mensual porque el contador
    funciona por ventanas fijas que se limpian a diario.
  Al llegar al tope, la hoja sigue funcionando, pero sin precio: solo los
  tres botones.
- **La app guarda 10 minutos el último resultado.** Abrir y cerrar la hoja no
  gasta más peticiones.
- **Los precios se calculan en la app** (`src/lib/ride-fares.ts`, con
  tests), no en la función: la función solo da distancia y tiempo. Así las
  tarifas se prueban con Vitest y se actualizan con cada versión.
- **Origen:** la ubicación actual. Si no hay permiso, las coordenadas del
  local de la fiesta en la que estás.
- **Avisar a alguien:** con el menú de compartir del sistema
  (`navigator.share` o el plugin Share), con un texto como «Vuelvo a casa
  desde <local>, llego sobre las 05:40». Nada pasa por el servidor.
- **Textos legales:** `legal-docs.ts` cuenta que la dirección de casa solo se
  guarda en el móvil y que el origen y el destino aproximados se envían a
  Mapbox para calcular el trayecto. **Mapbox pasa a estar en la lista de
  proveedores.**
- **Pruebas:** tests de las tarifas (diurna, nocturna o festiva y
  aeropuerto), del redondeo del origen y del tope; prueba real en Android de
  los enlaces de Uber, Cabify y del teléfono.

### Tarifas de taxi del lanzamiento

Las cifras son la referencia que he encontrado. Antes de programarlas se
confirman en el documento oficial de cada ciudad (el boletín o el
ayuntamiento) y se guardan en `ride-fares.ts` con su fuente y su fecha.

| Ciudad | Diurna | Nocturna / festivos | Estado |
|--------|--------|---------------------|--------|
| **Palma y Mallorca** (tarifa única de isla, Decreto 20/2025) | Bajada ≈ 2,50 €, ≈ 1,20 €/km | Bajada ≈ 2,85 € (21:00–07:00, fines de semana y festivos); €/km por confirmar | Suplemento aeropuerto o puerto ≈ 4,65 € |
| **Barcelona** (área metropolitana, desde el 19-01-2026) | Bajada 2,80 €, T-1 ≈ 1,35 €/km | T-2 ≈ 1,66 €/km | Borrador de la Diputación: confirmar el definitivo |
| **Madrid** (+2,38 % desde el 01-01-2026) | Por confirmar | Por confirmar | Falta la tabla oficial 2026 |
| **Málaga** (PDF municipal de marzo de 2026) | Por confirmar | Por confirmar | Hay cifras contradictorias: leer el PDF |
| **Valencia** | Por confirmar | Por confirmar | No encontrado |
| **Ibiza** | Por confirmar | Por confirmar | No encontrado |

- **Fuera de esas ciudades:** se usa una tarifa media española, con la
  etiqueta «aproximado».
- **Uber y Cabify:** horquilla orientativa (base + €/km + €/min) con un margen
  arriba de madrugada por la demanda, siempre con la etiqueta
  «Aproximado · el precio final te lo da la app».
- **Teléfono de radio taxi:** solo se muestra si está comprobado en la web
  oficial de la ciudad o de la asociación. Si no, el botón Taxi abre una
  búsqueda de taxis cerca en el mapa del móvil.

## Fase 2 · Calendario y recordatorio

- En la ficha de una fiesta con entrada o con «voy a ir»: **«Añadir al
  calendario»**. Genera un `.ics` con la hora, la dirección y el enlace a la
  ficha, que en el móvil se abre con el calendario del sistema.
- **Recordatorio push** el día de la fiesta, a la hora que elija la persona
  (por defecto, dos horas antes de la apertura). El aviso dice «Tu entrada
  está en Entradas» y abre el QR.
- Base de datos: se aprovechan las entradas compradas y los «voy a ir», sin
  tabla nueva. El envío lo hace un `pg_cron` como los demás avisos.

## Fase 3 · Avisos de «últimas entradas» y de bajada de precio

- Corazón **«Avisarme»** en la ficha de una fiesta, y aviso automático para
  quien sigue el local.
- Saltan dos avisos, como mucho una vez cada uno por fiesta:
  - **Últimas entradas:** cuando a un tipo de entrada le queda menos del 15 %.
  - **Baja el precio o hay nuevo tramo:** se conecta con los tramos de precio
    del plan del negocio, fase 1.
- Tabla nueva `event_watchers (user_id, event_id, created_at)`, con
  `a_api_rate_guard`, RLS y RPC `toggle_event_watch()` siguiendo las reglas de
  RPC.
- Ajustes → Avisos: interruptor «Entradas y precios».

## Fase 4 · Reventa oficial y cambio de titular

- **Ceder a un amigo:** desde la entrada, «Pasar a otra persona» busca a un
  fiester@ o envía un enlace. Al aceptar, el QR viejo deja de valer y se
  genera uno nuevo a su nombre.
- **Revender:** «Poner a la venta» a un precio que **no supera el original**.
  Cuando alguien la compra:
  - el dinero va a quien la revende, menos la comisión;
  - el QR antiguo se anula y el local ve el cambio en Puerta.
- Cada local decide en su panel si permite ceder, revender o ninguna de las
  dos, y hasta cuándo (por ejemplo, hasta 2 horas antes).
- Pagos con Stripe Connect, como las entradas: el cobro y la devolución salen
  del mismo flujo que ya existe.
- Migración nueva con la tabla `ticket_transfers` y las RPC
  `offer_ticket_transfer`, `accept_ticket_transfer` y `list_ticket_resale`,
  con la autorización dentro. Actualizar `legal-docs.ts` (condiciones de
  reventa).

---

## Decisiones (aceptadas el 03-11-2026)

- **Servicio de rutas:** Mapbox, con el token en `.env`.
- **Ciudades del lanzamiento:** Palma y Mallorca, Barcelona, Madrid, Málaga,
  Valencia e Ibiza. Las que no se puedan confirmar con documento oficial,
  con la tarifa media.
- **Uber y Cabify:** se lanza con precio aproximado. El texto para pedirles
  acceso a sus precios queda pendiente de que lo pidas.
- **Reventa:** la misma comisión que la venta normal. Ceder a un amigo,
  permitido por defecto; revender, solo si el local lo activa.
- **Orden:** el de la tabla.
