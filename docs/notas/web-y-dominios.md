# Web, dominios, Vercel y SEO

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- **Vercel `fiestea`:** el «ignored build step» sólo deja compilar `main`. Antes
  esperaba la rama `fiestea` y cancelaba todos los despliegues.
- **Cada dominio sirve una parte** (`src/lib/hosts.ts`). `fiestea.es`: landing y
  legales; cualquier otra ruta se reenvía a `app.fiestea.es`. `app.fiestea.es`: sólo
  locales y administración; las pantallas de clubber muestran `MobileOnlyPage`,
  el registro es sólo de local y el acceso de admin es el formulario de usuario
  (`/auth?type=user`), sin registro. **Allí no existe interfaz de clubber**:
  `StaffOnlyWeb` cierra cualquier sesión de cuenta normal y la manda a
  `/descargar` con un motivo (`location.state.motivo`); el acceso de
  administración rechaza a quien no es admin, y confirmar el email o cambiar la
  contraseña termina también en `/descargar` («entra desde la app»). Esas dos
  rutas de los correos son las únicas que una cuenta normal puede usar en la
  web. El equipo de un local (`venue_members`) sí entra, a su panel.
  `localhost`, las previews de Vercel y la app nativa ven todo. Para probar los modos en local, crea un
  `.env.development.local` con `VITE_LANDING_URL=http://localhost:5173` y
  `VITE_APP_URL=http://127.0.0.1:5173`, y reinicia Vite.
- **Dominios en Vercel.** `www.fiestea.es` redirige a `fiestea.es` (Vercel →
  Domains), así que `vercel.json` no debe redirigir entre los dos: dos reglas
  opuestas dejan la landing en un bucle. En producción `hosts.ts` fija
  `fiestea.es` y `app.fiestea.es` sin mirar `VITE_LANDING_URL`/`VITE_APP_URL`.
  Si `VITE_CARTO_API_KEY` empieza por `eyJ`, la compilación se aborta a
  propósito: en septiembre eso tuvo parada la web días sin que se notara.
- **`/` no es lo mismo en todas partes.** En `fiestea.es` es la landing; en
  `app.fiestea.es`, el acceso de negocios; dentro de la app instalada (Capacitor o
  PWA standalone), la bienvenida (`Index`). Lo decide `RootPage` en `App.tsx`.
- **CARTO exige clave** desde 2026 (`VITE_CARTO_API_KEY`, gratis en
  carto.com/basemaps/apikey). Sin ella cada tesela es una marca de agua «API KEY
  REQUIRED», así que `map-thumb.tsx` no pide teselas si falta. **No confundir con
  el API Access Token del Workspace** (`eyJ…`, en `CARTO_API_TOKEN`, lo usa el
  MCP): da acceso a los datos de la cuenta y con prefijo `VITE_` acabaría en el
  bundle. `vite.config.ts` para la compilación si lo detecta.
- **Publicar:** la lista completa (Vercel, DNS, Supabase, Resend, Stripe,
  tiendas, legal) está en `vybe-project/PUBLICAR.md`.
- **SEO de la web** (`fiestea.es`): `index.html` lleva título, descripción,
  Open Graph (`public/og-image.png`, 1200 × 630) y datos estructurados
  (Organization, WebSite, MobileApplication, sin valoraciones inventadas).
  Cada página pública cambia título, descripción y canonical con `setSeo()`
  (`src/lib/seo.ts`). `public/sitemap.xml` y `robots.txt` están en `public/`.
  Las visitas se cuentan con la analítica propia (`page_view`,
  `page-view-tracker.tsx`), sin cookies. El botón de WhatsApp de la landing
  sólo sale con `VITE_WHATSAPP_NUMBER`.
- **La landing no inventa nada.** El diseño de Stitch traía cifras («+45.000
  clubbers»), testimonios y tecnología (balizas BLE, cifrado de extremo a
  extremo, biometría) que no existen. Se quitaron: en una web de captación eso
  es publicidad engañosa. Las cifras del panel de ejemplo van marcadas como
  «Vista de ejemplo».
