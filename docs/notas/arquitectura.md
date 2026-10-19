# Arquitectura y flujos

## Stack

- React 18, **Vite** (PWA con service worker), shadcn/Radix, Tailwind
- **Capacitor 8**: la misma web empaquetada para Android e iOS (`android/`, `ios/`).
  La app es `es.fiestea.app` en Android y `es.fiestea.ios` en iOS (`appId`
  interno de Capacitor: `com.vybe.app`; cuenta el de cada proyecto nativo). Android 16 (API 36, mínimo API 24), iOS 15.
- i18next: ES / EN / DE / CA
- **Supabase** (Auth + PostgreSQL con RLS + Realtime + Storage + Edge Functions)
- React Query, RHF+Zod, qrcode.react, html5-qrcode, Sentry, Vitest
- Origen Lovable (`lovable-tagger`)

## Estructura

```
vybe-project/
  src/pages/          Auth, VerifyEmail, Home, Location, EventAccess,
                      EventSwiping, Matches, Likes, Chat, Profile, Legal,
                      venue/, admin/
  src/components/     protected-route, error-boundary, consent-gate, pwa-prompt,
                      qr-scanner, camera-capture, face/phone-verification,
                      interest-picker, discovery-filters, groups-sheet,
                      safety-sheet, privacy-sheet, language-switcher,
                      venue/, admin/, ui/
  src/context/        app-context, premium-context
  src/services/       acceso a Supabase y a las Edge Functions, por dominio
  src/i18n/           locales es/en/de/ca
  src/lib/            observability (Sentry + analítica)
  android/ ios/         proyectos nativos generados por Capacitor
  supabase/migrations/  numeradas; se aplican en orden
  supabase/policies/    storage_policies.sql
  supabase/functions/   una carpeta por Edge Function; `_shared/` con correo,
                        Stripe, PDF de entradas, Wallet y textos push
SETUP.md, README.md, CREAR_USUARIOS.md, ESTADO.md
```

## Flujos

Registro → consentimiento RGPD → verificar email → lista de eventos (con
contadores de asistencia) → verificar ubicación (GPS real) → escanear QR →
`redeem_event_code()` valida en servidor y hace check-in → 3 fotos con la cámara
(pasan por moderación) → swipe con filtros e intereses → match → chat Realtime
efímero.

Locales: alta → aprobación por administración → crear evento (suelto o
recurrente) → generar código, general o con nombre para cada relaciones
públicas → aforo en vivo con aviso al llegar al límite → promociones y vales
que sólo ve quien ha entrado → embudo, curva horaria, demografía agregada,
comparativa por noche y curva de abandono → aviso inmediato si alguien pide
ayuda dentro → cartel imprimible y vista para el monitor de la entrada →
equipo con roles. El plan (gratis, pro o business) decide qué está disponible.

Captación: landing pública en `/` (`src/pages/LandingPage.tsx`) → formulario
«Solicitar demo» → Edge Function `venue-lead` (sin JWT: valida, campo trampa,
5 envíos por IP a la hora, avisa por correo a `LEADS_NOTIFY_EMAIL` o al correo
de la empresa) → tabla `venue_leads` (migración 037, sólo la lee
administración) → `/admin/dashboard` → Solicitudes, con estado y botón de
contacto.

Storage buckets:
- `event-photos`: **privado** (migración 094). Fotos de la noche, del perfil y
  de verificación.
- `documents`: privado.
- `event-posters`: público (carteles, migración 095).
- `avatars` y `venue-logos`: públicos.

## Deploy

Hosting estático (Vercel/Netlify) + Supabase cloud. Configurar Site URL y
Redirect URLs en Auth. **Requiere HTTPS**: la app usa cámara y geolocalización.
