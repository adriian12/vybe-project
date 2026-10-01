# Estado del proyecto

Sustituye a `IMPLEMENTACION_COMPLETA.md`, que daba por terminadas cosas que no
lo estaban. Este documento dice qué funciona, qué depende de una clave externa y
qué queda fuera.

Última revisión: reparación integral (`006`), roadmap de producto (`007`) y
puesta en marcha contra la base de datos real (`008`–`013`), incluidas las
pruebas de extremo a extremo del flujo completo.

---

## Comprobaciones

```bash
npm run verify   # typecheck + lint + tests + build
```

Estado actual: **0 errores de TypeScript, 0 errores de ESLint, 29 tests en
verde, build correcto** (incluido el service worker de la PWA).

### Probado contra el proyecto real

Con cuentas creadas por el flujo de registro normal, no insertadas a mano:

| Recorrido | Resultado |
|-----------|-----------|
| Registro de usuario y de local | El trigger crea el perfil o el local con su tipo |
| Canje de código con geocerca | Entra dentro del radio; `TOO_FAR` desde Madrid; `INVALID_CODE` con un código inventado |
| Local sin aprobar | `VENUE_NOT_VERIFIED`: su código no da acceso hasta que administración lo aprueba |
| Descubrimiento | Sólo se ven entre sí quienes han hecho check-in en el mismo evento, y deja de aparecer quien ya fue swipeado |
| Swipe recíproco | Se crea la conexión y se puede abrir el chat |
| Chat | Mensaje entregado; suplantar el remitente se rechaza |
| Aislamiento | Un tercero no lee mensajes ajenos ni lista perfiles |
| Panel del local | Crea evento, genera código, ve su embudo; las métricas de otro local devuelven `NOT_AUTHORIZED` |
| Panel de administración | Aprueba locales, ve y resuelve denuncias, suspende y reactiva perfiles, aprueba fotos de la cola |
| Sin sesión | El rol `anon` no lee ninguna tabla ni ejecuta ninguna función |

### Fallos que sólo aparecieron al probarlo

Ninguno se veía en el código ni en los tests: eran diferencias entre lo que
declaran las migraciones y lo que había en la base de datos.

- **No se creaba ningún match.** `connections` no tenía la restricción única del
  par, así que el `ON CONFLICT` del trigger `check_match()` abortaba el segundo
  swipe. Sin conexión, tampoco se podía abrir el chat. (010)
- **La pantalla de conexiones salía vacía.** Faltaban las claves foráneas de
  `connections` y `messages` hacia `profiles`, y PostgREST las necesita para
  resolver el embed de `api.getMatches()`. (013)
- **Un local leía las métricas de la competencia.** Las funciones de
  estadísticas son `SECURITY DEFINER` y ninguna comprobaba de quién era el
  evento. (011)
- **Nadie podía iniciar sesión.** Las diez cuentas existentes no tenían fila en
  `profiles`: vivían en una tabla `users` heredada. (008)
- **`anon` podía ejecutar 44 funciones** por `/rest/v1/rpc/`, entre ellas
  `cleanup_expired_event_codes()`, que desactiva códigos de acceso. (009, 012)
- **Una vista `active_conversations`** con `SECURITY DEFINER` dejaba ver a
  cualquier cuenta con quién habla todo el mundo. Se eliminó: no la usaba nadie. (009)

---

## Funciona de extremo a extremo

### Acceso y cuentas
- Registro y login de usuarios y de locales con Supabase Auth.
- El perfil o el local se crean con el trigger `handle_new_user()`. Antes se
  insertaban desde el cliente justo después de `signUp()`, cuando todavía no hay
  sesión, y la policy los rechazaba en silencio.
- Confirmación de email con reenvío.
- Rutas protegidas por `<ProtectedRoute>` con roles (`user`, `venue`, `admin`).
- Administración por `profiles.role`, no por un email escrito en el código.
- **Consentimiento RGPD** bloqueante antes de usar la app, con registro de la
  versión aceptada de cada documento.

### Acceso a eventos
- Lista de eventos reales, ordenados por distancia, con **contadores de
  actividad** (cuánta gente ha dicho que va y cuánta está dentro).
- **"Voy a ir"**: ataca el problema de la sala vacía, que era el mayor riesgo
  de producto. Antes nadie veía a nadie hasta que alguien más entraba.
- Geolocalización real del dispositivo. Antes se enviaban unas coordenadas fijas
  de Madrid en una app de Mallorca.
- Escáner QR con cámara (`html5-qrcode`) y entrada manual.
- Canjeo validado **en servidor** con `redeem_event_code()`: vigencia, local
  verificado, evento en curso y geocerca.
- Check-in en `event_attendance`, con *heartbeat* y expulsión al terminar.

### Descubrimiento y chat
- Sólo se ven perfiles de quien ha hecho check-in **en el mismo evento**.
- **Intereses y etiquetas**: el emparejamiento ya no depende sólo de la
  proximidad, que es un filtro y no un algoritmo. Los perfiles con intereses en
  común aparecen primero.
- **Filtros avanzados** por edad e intereses (función Premium).
- **Grupos**: crear uno, compartir código y ver los demás grupos del evento.
- **Chat efímero**: la conversación caduca 24 h después del evento salvo que
  ambas partes pulsen "conservar".
- Chat en tiempo real con marcas de leído y paginación (antes se cargaba el
  historial completo en cada arranque, sin límite).
- **"Quién te ha dado like"**, que estaba vendido en Premium sin implementar.
- Reportar y bloquear desde la tarjeta y desde el chat.
- **Modo invisible** y **historial de eventos con reputación**.

### Seguridad de las personas
- **Botón de emergencia** con contactos de confianza y ubicación en vivo.
- **Moderación de fotos**: nada llega al perfil sin pasar por
  `moderation_queue`; con proveedor configurado la decisión es inmediata.
- **Suspensión de cuentas** desde administración, con efecto real.
- **Límites de uso** aplicados por triggers en swipes y mensajes.

### Perfil
- Edición de datos, intereses y plan de la noche.
- Fotos con cámara subidas a Storage. **Al borrarlas se elimina el fichero**,
  no sólo la URL del perfil.
- Verificación facial con `FaceDetector` más comprobaciones de calidad.
- Verificación de teléfono por SMS.
- Preferencias de notificaciones.
- **Privacidad y datos**: descarga de todo lo que guardamos y borrado de cuenta.

### Locales

- **Aforo en vivo** con aviso al llegar al umbral, que sustituye al clicker de
  la puerta y cubre la obligación legal de controlarlo.
- **Un código por relaciones públicas**, con atribución real de cuánta gente ha
  traído cada uno: es lo que evita pagar a ciegas por listas infladas.
- **Promociones y vales** visibles sólo para quien ha hecho check-in, con
  validación en barra escribiendo el código. Cada vale sirve una vez.
- **Aviso inmediato** al equipo del local si alguien pide ayuda dentro, con
  enlace al mapa y confirmación de que se está atendiendo.
- **Moderación de su propia puerta**: ver denuncias de gente que está dentro y
  retirarle el acceso al evento sin tocar su cuenta.
- **Demografía agregada**, comparativa por día de la semana y curva de abandono
  por horas.
- **Eventos recurrentes**, cartel imprimible y vista a pantalla completa para el
  monitor de la entrada.
- **Planes** gratis, pro y business, con los límites aplicados por la base de
  datos.
- Panel con código de acceso, estadísticas, eventos y **equipo**.
- **Rotación automática del código** cada 15–120 minutos.
- **Embudo por evento** (intención → check-in → swipes → matches → reservas) y
  **curva de entradas por hora**.
- **Exportación a CSV** para comparar eventos fuera de la app.
- **Equipo con roles**: propietario, personal y marketing.
- Estadísticas reales; antes eran `Math.random()` y números fijos.

### Administración
- Aprobación de locales, moderación de fotos y de reportes, alertas de
  emergencia y **embudo de activación** de los últimos 30 días.

### Plataforma
- **Multiidioma ES / EN / DE / CA** con detección por navegador. Mallorca en
  temporada es sobre todo turismo alemán y británico.
- **PWA instalable** con service worker, aviso de actualización e indicador de
  desconexión.
- **Notificaciones push** de matches y mensajes.
- **Error boundary** por ruta: un fallo de render ya no deja pantalla en blanco.
- **Sentry** y analítica de producto propia.
- **CI** que ejecuta typecheck, lint, tests y build, y falla si vuelve a
  colarse un script de terceros en el bundle.

---

## Depende de credenciales externas

Todo está implementado; sin la clave el sistema lo dice en vez de fingir que
funciona.

| Función | Variables | Sin configurar |
|---------|-----------|----------------|
| Notificaciones push | `VITE_VAPID_PUBLIC_KEY` (cliente) y `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_HOOK_SECRET` (función) | El interruptor aparece desactivado |
| SMS de verificación y SOS | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_FROM_NUMBER` (o `TWILIO_AUTH_TOKEN` en vez de la API Key) | Devuelve 503 con mensaje explícito |
| Correo del SOS | `RESEND_API_KEY`, `SOS_FROM_EMAIL` | La alerta se registra pero no se envía |
| Moderación automática de fotos | `SIGHTENGINE_USER`, `SIGHTENGINE_SECRET`, `MODERATION_THRESHOLD` | La foto se publica y queda en la cola manual |
| Cobro de Premium | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_EVENT`, `STRIPE_PRICE_LIFETIME`, `STRIPE_WEBHOOK_SECRET` | La suscripción se activa sin cobrar |
| Reporte de errores | `VITE_SENTRY_DSN` | Sentry no se inicializa |
| Verificación facial externa | `VITE_FACE_VERIFICATION_URL` | Se usa la detección del navegador |

---

## Pendiente de decisión humana

- **Textos legales.** `src/pages/LegalPage.tsx` ya lleva los datos del
  responsable, pero sigue siendo una plantilla y **debe revisarlo un abogado**
  antes de abrir el servicio.
- **Verificación documental de edad.** Hoy la edad es autodeclarada y la
  verificación facial comprueba que hay una cara, no quién es. Para una app 18+
  en entornos con alcohol conviene delegar en el control de puerta del local o
  contratar un proveedor de verificación de identidad.
- **Rotar la anon key**: estuvo versionada en git.
- **Los secretos de las Edge Functions no están subidos.** `npm run secrets:push`
  necesita el CLI autenticado con la cuenta que aloja Vybe, y hoy lo está con
  otra. Mientras tanto, las funciones que dependen de Twilio, Resend, Stripe o
  Sightengine responden como «sin configurar».
- **`verify_jwt` de `stripe-webhook`, `send-push` y `analytics-collect`.** Se
  desplegaron por MCP, que no aplica `config.toml`, así que nacieron exigiendo
  JWT. Hay que desactivarlo en el panel: Stripe no envía ninguno.
- **Tablas heredadas** (`users`, `venue_profiles`, `venue_events`,
  `user_preferences`, `blocked_users`, `notifications`, `activity_log`,
  `event_attendance_legacy`). Ya no las alcanza el cliente, pero siguen ahí.
  Borrarlas es reversible sólo con copia de seguridad.

---

## Fuera de alcance

- Edición de eventos ya creados desde el panel (se pueden borrar; la API
  `updateEvent` existe pero no tiene interfaz).
- Emparejamiento grupo-con-grupo: los grupos se crean y se ven, pero el swipe
  sigue siendo entre personas.
- Tests end-to-end con navegador (los actuales cubren utilidades, contratos de
  la API y consistencia de traducciones). El flujo completo se ha probado contra
  el proyecto real, pero a mano y sin dejar automatizado el recorrido.

---

## Seguridad — qué se corrigió

| Problema | Estado |
|----------|--------|
| Script de terceros (`gpteng.co`) en el bundle de producción | Eliminado; la CI falla si vuelve |
| Fotos borradas seguían siendo públicas en Storage | Se borra el objeto |
| Cualquiera con la anon key podía listar todos los códigos activos | `event_codes` ya no es legible; se canjea con una función `SECURITY DEFINER` |
| Policies de `profiles` en recursión infinita (`42P17`) | Corregido con funciones `SECURITY DEFINER` |
| Rutas de local y administración accesibles por URL | `<ProtectedRoute>` |
| Policies sin `TO authenticated` | Corregido en todas las tablas |
| `verification_codes` con RLS y ninguna policy | Corregido |
| Edge Function de SMS abierta sin autenticación | Exige JWT y limita a 5 envíos/hora |
| Sin límites de uso: swipes y mensajes scriptables | Triggers `consume_rate_limit` |
| Sin borrado ni exportación de datos (RGPD) | `export_my_data()` y borrado duro |
| Sin consentimiento registrado | `user_consents` + pantalla bloqueante |
| Fotos publicadas sin moderación | Cola de moderación |
| `.env` versionado en git | Desindexado |
| Contraseñas de prueba en `info.txt` | Archivo eliminado |
| `getMessages()` cargaba el historial completo | Paginado |
| `<html lang="en">` con interfaz en español | Sincronizado con el idioma activo |
