# Plan · Mejoras para el negocio

Sigue el plan por fases tipo Fourvenues acordado en octubre (fases 1 y 2
hechas: ficha y line-up, y equipos de RRPP). Aquí se detallan las siguientes y
se añaden los **códigos de descuento**, que no estaban. Cada fase se entrega
terminada (cuatro idiomas, `npm run verify` y prueba en el panel).

Al ser funciones de plan, cada una se aplica **en la base de datos**
(`venue_plan_limits`, `venue_has_feature`) y se repite en
`src/lib/venue-plans.ts`. Lo que el plan no incluye no se enseña.

| Fase | Función | Plan | Tamaño |
|------|---------|------|--------|
| 1 | Dashboard de Ventas y saltos de precio (hecho, migración 131; faltan complementos, conversión y ritmo) | Business | Grande |
| 2 | Códigos de descuento y de RRPP | Business (¿Pro con límite?) | Medio |
| 3 | Mesas: plano, reservas y señal | Business | Grande |
| 4 | Clientes y campañas a seguidores | Business | Grande |

---

## Fase 1 · Dashboard de Ventas y saltos de precio

**Qué ve el negocio** (Ventas → «Resumen», nueva pestaña delante de «Gestión
de entradas»):
- Selector de periodo (hoy, 7 días, 30 días, temporada, a medida) y de fiesta.
- KPIs: facturación, entradas vendidas, ticket medio, devoluciones, aforo
  vendido frente a **aforo real en Puerta**, y conversión de visitas de la
  ficha a compra.
- «Facturación por fecha» en barras apiladas General / VIP / Mesas.
- «Top facturación por día» y **ritmo de venta** comparado con la edición
  anterior de la misma fiesta («vas un 20 % por delante»).
- **Complementos**: añadidos a una entrada (copa, guardarropa, parking), con
  su propio stock y su línea en el QR.
- Exportar a CSV.

**Saltos de precio automáticos** en cada tipo de entrada:
- **Por cantidad** («los primeros 100 a 10 €, después 15 €») y **por fecha**
  («hasta el jueves a 12 €»).
- El cambio lo hace la base de datos al reservar (`create_ticket_order`), no
  la app, para que nadie compre a un precio que ya no existe.
- La ficha enseña «Quedan 23 a este precio» y el tramo siguiente.

**Cómo:** una migración con `ticket_price_tiers` y `ticket_addons` (con
`a_api_rate_guard` y RLS), una RPC de lectura `get_sales_dashboard(venue,
desde, hasta, evento)` con la autorización dentro y el permiso en
`COALESCE(…, FALSE)`, y gráficos con la librería que ya usa el panel.

## Fase 2 · Códigos de descuento y de RRPP

- El negocio crea códigos (`VERANO10`) de **porcentaje o importe fijo**, con:
  usos máximos, fechas de validez, tipos de entrada a los que aplican y un
  mínimo por persona.
- Un código puede ir **asignado a un RRPP o a un influencer**. Sus ventas
  cuentan en el ranking y en las comisiones que ya existen.
- En el pago, «¿Tienes un código?». El descuento se valida y se aplica en
  `create_ticket_order` y Stripe cobra ya el importe rebajado.
- En el panel: usos y facturación de cada código.
- Tabla `discount_codes` + `discount_code_uses` (con `a_api_rate_guard`). Hay
  que limitar los intentos de código por persona para que no se adivinen a
  fuerza de probar.

## Fase 3 · Mesas: plano, reservas y señal

- **Editor de plano por zonas** (pista, terraza, VIP): mesas que se arrastran
  sobre una cuadrícula, cada una con su capacidad, su consumo mínimo y su
  precio de señal.
- El fiester@ ve el plano en la ficha, elige una mesa libre y **paga la
  señal**. El resto del consumo mínimo se paga en el local, como ahora: sin
  cobro de consumiciones ni taquilla.
- En Puerta: lista de reservas de la noche, con el nombre, la hora y las
  personas, y un botón «Ha llegado».
- Cancelación: el negocio fija hasta cuándo se devuelve la señal.
- Encaja con el tipo de entrada «Mesa» que ya existe, que pasa a tener una
  mesa concreta del plano.

## Fase 4 · Clientes y campañas a seguidores

- **Clientes:** lista de quien compró, entró o sigue el local, con sus
  visitas, su gasto y su última noche. Solo se usa lo que el cliente aceptó
  en el consentimiento de marketing. Filtros por veces que ha venido, gasto,
  ciudad y edad por tramos.
- **Campañas:** un aviso push, o un correo por Resend, a un segmento
  («seguidores que no han venido en 30 días», «los que fueron a la última
  techno»):
  - con vista previa y programación;
  - con un **límite por plan**, como máximo uno por semana para cada
    fiester@, para que Fiestea no se convierta en spam;
  - con sus resultados: enviados, abiertos y compras hechas en las 48 h
    siguientes.
- Reaprovecha la cola de avisos del local (`queue_broadcast`) y los
  seguidores (`toggle_venue_follow`).
- Actualizar `legal-docs.ts`: qué datos ve el negocio y cómo darse de baja de
  las campañas. Cada aviso lleva «No quiero recibir más de este local».

---

## Reglas al construirlo

- **Sin romper la versión publicada ni la que revisa Apple.** Las migraciones
  solo añaden cosas:
  - columnas nuevas con valor por defecto;
  - tablas nuevas;
  - parámetros nuevos de `create_ticket_order` con `DEFAULT NULL`, para que
    las apps antiguas sigan llamándola igual. Hay que volver a dar los
    permisos tras recrearla.
  - Nada se borra ni se renombra.
- **Ya existe y se aprovecha:** el tipo de entrada «Mesa» (fase 3), las
  pestañas de Ventas «Gestión de entradas» y «Comisiones RRPP» (fase 1), los
  seguidores con `toggle_venue_follow` y la cola `queue_broadcast` (fase 4),
  y los equipos y ranking de RRPP (fase 2).
- Cada tabla nueva lleva `a_api_rate_guard` y RLS. Cada RPC, la autorización
  dentro, `COALESCE(…, FALSE)` en los permisos y
  `REVOKE ALL … FROM PUBLIC` + `GRANT` solo a quien la usa.
- Lo que el plan no incluye no se enseña en el panel: no basta con
  desactivarlo.

## Decisiones (aceptadas el 03-11-2026)

1. **Códigos de descuento:** Business sin límite; Pro con 3 códigos activos.
2. **Campañas:** Business, 8 avisos push al mes. Correo incluido hasta 2000
   envíos al mes; por encima, de pago. Nunca más de un aviso por semana a la
   misma persona.
3. **Mesas:** si no se presentan, la señal se la queda el local. Se devuelve
   si cancelas antes del límite que fije el local (por defecto, 24 h).
4. **Complementos:** los define libremente cada local (nombre, precio y
   stock), con sugerencias de copa, guardarropa y parking.
5. **Orden:** el de la tabla, empezando por el dashboard de Ventas.
