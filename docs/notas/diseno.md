# Diseño (Stitch · «Balearic Electric»)

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- La interfaz sigue el proyecto de Stitch **«Vybes Nightlife App»**
  (`8985536777979226204`, MCP `stitch`). Las 33 pantallas descargadas (HTML y
  captura) están en `diseños/stitch/`, y el guion con el que se generaron en
  `diseños/STITCH.md`. Del HTML de Stitch se toma la composición, no el código.
- Tipografías **Outfit** (titulares, `font-display`) y **Plus Jakarta Sans**
  (texto), empaquetadas con `@fontsource-variable` para que la app instalada
  no dependa de Google Fonts. La escala de Stitch vive en Tailwind con sus
  nombres: `text-headline-xl/lg/md`, `text-title-card`, `text-body-md/sm`,
  `text-label-pill`, `text-caption`.
- **`cn()` tiene esa escala registrada en `tailwind-merge`** (`src/lib/utils.ts`).
  Sin eso, `text-caption` junto a `text-party-gray` se tomaba por dos colores y
  se borraba el tamaño. Si añades un tamaño a Tailwind, añádelo también ahí.
- Las **tarjetas blancas** de los paneles de local y administración no se
  pintan una a una: `.surface-light` (o `.cards-light` en el contenedor, que
  afecta a todos los `Card`) redefine los tokens (`--card`, `--field`,
  `--party-gray`…) y los controles de dentro se adaptan solos. `party.gray` es
  una variable por eso.
- **La marca es «Fiestea»** (`fiestea.es`, `app.fiestea.es`): app, nombre en
  Android/iOS, paquete de las tiendas (`es.fiestea.app`), manifiesto, landing,
  correos, avisos push y APK (`Fiestea.apk`). La interfaz dice «fiester@»,
  «crush» y «negocio». **«Vybe», «Vybes» y «vyber» no salen en nada que vea
  alguien fuera del código**: textos, correos, tiendas, consolas (Google,
  Firebase, Apple), dominios ni ficheros que se entreguen. Si algo visible aún
  lo lleva, se cambia. Sólo pueden quedarse los nombres internos que nadie ve
  (variables, `VybeMark`, claves `vybe_…`, el nombre del repositorio).
- **El logotipo es la F amarilla inclinada con destello** (dibujo en
  `vybe-logo.tsx`). Vive en tres sitios que deben
  coincidir: `src/components/brand/vybe-logo.tsx`, `public/favicon.svg` y
  `scripts/generate-icons.py`, que pinta con Pillow todos los iconos (PWA,
  favicon, lanzador y primer plano adaptativo de Android, icono de iOS) y las
  pantallas de arranque. Si cambia el logo, cambia los tres y ejecuta
  `python scripts/generate-icons.py`.
- La barra de abajo es **Inicio · Mapa · Entradas · Crushes · Perfil**. La
  pestaña «Buscar» del diseño no existe: el buscador está en el mapa.
- Rutas nuevas: `/event/:id` (ficha), `/map` (Leaflet con teselas oscuras de
  CARTO, carga perezosa), `/tickets` (pase de la fiesta, vales con QR y
  pasadas), `/u/:id` (perfil de una conexión). `/matches` y `/likes` son la
  misma pantalla con dos pestañas.
- El formulario de evento ya escribe `recurrence` (`weekly`/`biweekly`) y el
  aforo; la base de datos crea las siguientes ediciones.
