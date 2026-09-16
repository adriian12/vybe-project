# Vybe

App de networking social para eventos y fiestas en Mallorca. Sólo puedes ver y
conectar con gente que está **físicamente en el mismo evento que tú**, verificado
por geolocalización y un código QR que emite el local.

## Cómo funciona

```
Registro ──▶ Verificar email ──▶ Lista de eventos
                                      │
                                      ▼
                     Verificar ubicación (GPS real)
                                      │
                                      ▼
                   Escanear QR / introducir código
                                      │
                    redeem_event_code() valida en servidor:
                    código vigente · local verificado ·
                    evento en curso · dentro del radio
                                      │
                                      ▼
                       Check-in en event_attendance
                                      │
                                      ▼
                3 fotos con la cámara ──▶ Swipe ──▶ Match ──▶ Chat
```

El radio de visibilidad depende del tipo de local: bar y local 50 m, discoteca
100 m, evento empresarial 250 m, festival 500 m.

Para los locales hay un panel aparte con generación de códigos, estadísticas de
asistencia y gestión de eventos. La administración aprueba los locales antes de
que puedan operar.

## Stack

- React 18 + TypeScript + Vite, **PWA instalable** con service worker
- shadcn/ui (Radix + Tailwind)
- Supabase: Auth, PostgreSQL con RLS, Realtime, Storage y Edge Functions
- React Router 6, TanStack Query, React Hook Form + Zod
- i18next (**ES / EN / DE / CA**), `html5-qrcode`, Sentry
- Vitest para las pruebas

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y rellena las claves de Supabase
npm run dev                  # http://localhost:5173
```

Antes de arrancar hay que aplicar las migraciones SQL. **La `006` y la `007`
son obligatorias**: sin la 006 el registro no crea el perfil, las policies de
`profiles` entran en recursión y los códigos de acceso quedan expuestos; la 007
añade intereses, grupos, moderación, límites de uso y los derechos RGPD.

El detalle completo está en **[SETUP.md](SETUP.md)**.

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [SETUP.md](SETUP.md) | Instalación, migraciones, Storage, autenticación y problemas comunes |
| [CREAR_USUARIOS.md](CREAR_USUARIOS.md) | Usuarios de prueba y cómo recorrer el flujo completo |
| [ESTADO.md](ESTADO.md) | Qué funciona, qué necesita credenciales externas y qué queda fuera |

## Estructura

```
src/
  pages/            Index, Auth, VerifyEmail, Home, Location, EventAccess,
                    EventSwiping, Matches, Likes, Chat, Profile, Legal,
                    venue/VenueDashboard, admin/AdminDashboard
  components/       protected-route, error-boundary, consent-gate, pwa-prompt,
                    qr-scanner, camera-capture, face-verification,
                    phone-verification, interest-picker, discovery-filters,
                    groups-sheet, safety-sheet, privacy-sheet,
                    language-switcher, profile-card, chat-window,
                    venue/, admin/, ui/ (shadcn)
  context/          app-context (sesión, evento activo, filtros)
                    premium-context (suscripción)
  services/         api, social, safety, privacy, venue-service, push, geo
  i18n/             configuración y locales es/en/de/ca
  lib/              observability (Sentry + analítica)
  service-worker.ts caché de la shell y notificaciones push
supabase/
  migrations/       001 → 007
  policies/         storage_policies.sql
  functions/        moderate-photo, send-sos-alert, stripe-checkout,
                    stripe-webhook, delete-account, venue-add-member,
                    send-push, analytics-collect, send-sms-verification
```

## Base de datos

24 tablas con Row Level Security en todas. Las piezas centrales:

- `profiles` / `venues` / `venue_members` — cuentas y equipos, creadas por trigger
- `events` / `event_codes` / `event_intents` — eventos, códigos e intención de ir
- `event_attendance` — check-ins validados; determina quién se ve con quién
- `interests` / `profile_interests` — base del emparejamiento por afinidad
- `swipes` / `connections` / `messages` — matching y chat efímero
- `groups` / `group_members` — salir de fiesta en grupo
- `reports` / `blocks` / `moderation_queue` — moderación
- `trusted_contacts` / `sos_alerts` — botón de emergencia
- `push_subscriptions` / `rate_limits` / `user_consents` / `analytics_events`

Funciones clave: `redeem_event_code()`, `get_nearby_profiles()`,
`get_event_funnel()`, `get_likes_received()`, `export_my_data()`,
`consume_rate_limit()`, `current_profile_id()`, `is_admin()`.

## Scripts

```bash
npm run dev        # servidor de desarrollo en :5173
npm run build      # build de producción
npm run preview    # previsualizar el build
npm run typecheck  # TypeScript sin emitir
npm run lint       # ESLint
npm run test       # Vitest
npm run verify     # typecheck + lint + tests + build
```

## Despliegue

Hosting estático (Vercel, Netlify) más Supabase cloud.

1. Variables de entorno: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
2. Build: `npm run build`. Directorio publicado: `dist`.
3. En Supabase, **Authentication > URL Configuration**: añade tu dominio como
   *Site URL* y `https://tu-dominio.com/auth/verify-email` como *Redirect URL*.

La app usa cámara, geolocalización, service worker y notificaciones push, así
que **debe servirse por HTTPS**.

Despliega también las Edge Functions y sus secretos: ver [SETUP.md](SETUP.md).

## Licencia

MIT.
