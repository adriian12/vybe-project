import { APP_URL, DEFAULT_IMAGE, eventIdOf, loadEventShare, posterVersion } from './_share.js';

/**
 * `/event/:id` para los robots de vista previa (la regla está en
 * `vercel.json`): una página mínima con las etiquetas Open Graph de la fiesta,
 * para que el enlace salga con su cartel, su nombre, el día y la sala en vez
 * de la tarjeta genérica de Fiestea. Las personas nunca llegan aquí.
 */

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MADRID = 'Europe/Madrid';

/** «jue, 15 oct · 23:59 · Fitz, Palma» */
const descripcion = (start: string, place: string | null, city: string | null): string => {
  const d = new Date(start);
  const dia = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: MADRID });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: MADRID });
  const sitio = [place, city && city !== place ? city : null].filter(Boolean).join(', ');
  return [dia.replace(/\.$/, ''), hora, sitio].filter(Boolean).join(' · ');
};

const pagina = (meta: { title: string; description: string; url: string; image: string; jpeg: boolean }) => {
  const t = escapar(meta.title);
  const d = escapar(meta.description);
  const u = escapar(meta.url);
  const i = escapar(meta.image);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${t} · Fiestea</title>
<meta name="description" content="${d}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${u}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Fiestea">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
<meta property="og:image" content="${i}">
<meta property="og:image:secure_url" content="${i}">
<meta property="og:image:type" content="${meta.jpeg ? 'image/jpeg' : 'image/png'}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${t}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${i}">
</head>
<body><a href="${u}">${t}</a></body>
</html>`;
};

export async function GET(request: Request): Promise<Response> {
  const id = eventIdOf(request);
  const ev = id ? await loadEventShare(id) : null;

  const html = ev
    ? pagina({
        title: ev.name,
        description: descripcion(ev.start_date, ev.place, ev.city),
        url: `${APP_URL}/event/${id}`,
        image: ev.poster_url
          ? `${APP_URL}/api/share-image?id=${id}&v=${posterVersion(ev.poster_url)}`
          : DEFAULT_IMAGE,
        jpeg: Boolean(ev.poster_url),
      })
    : pagina({
        title: 'Fiestea · Las fiestas de Mallorca en tu móvil',
        description: 'Descubre qué hay esta noche, compra tu entrada y entra con el QR.',
        url: APP_URL,
        image: DEFAULT_IMAGE,
        jpeg: false,
      });

  return new Response(html, {
    status: ev ? 200 : 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    },
  });
}
