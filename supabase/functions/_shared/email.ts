/**
 * Diseño de los correos de Fiestea: fondo negro, tarjeta gris oscura, acento
 * amarillo y el logo de la app, como la propia app. Lo usan todos los correos
 * (alta, contraseña, avisos, entradas) para que se vean iguales.
 *
 * Tablas y estilos en línea: es lo único que respetan todos los clientes de
 * correo (Gmail, Outlook, Apple Mail). Las fuentes de la app (Outfit y Plus
 * Jakarta Sans) sólo las cargan algunos clientes; el resto usa la del sistema.
 */

export const BRAND = {
  name: 'Fiestea',
  web: 'https://fiestea.es',
  app: 'https://app.fiestea.es',
  logo: 'https://fiestea.es/icons/icon-192.png',
  tagline: 'Encuentra tu fiesta. Vívela a tope.',
  bg: '#0B0B0D',
  card: '#1A1A1E',
  cardSoft: '#232328',
  line: '#2E2E33',
  text: '#FFFFFF',
  muted: '#A6A6AE',
  accent: '#F8D000',
  onAccent: '#111114',
} as const;

const FONT = "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const DISPLAY = "'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export interface EmailButton {
  text: string;
  url: string;
  /** `secondary`: botón con borde, para una segunda acción. */
  style?: 'primary' | 'secondary';
}

export interface EmailContent {
  /** Texto que se ve en la lista de correos, antes de abrirlo. */
  preheader?: string;
  /** Etiqueta pequeña amarilla encima del título («TU ENTRADA»). */
  eyebrow?: string;
  heading: string;
  /** Párrafos de texto plano (se escapan). */
  paragraphs?: string[];
  /** HTML ya preparado (p. ej. la tarjeta de una entrada), debajo de los párrafos. */
  blockHtml?: string;
  buttons?: EmailButton[];
  /** El enlace en texto, por si el cliente no pinta el botón. */
  showLink?: string;
  /** Letra pequeña al final de la tarjeta. */
  note?: string;
}

const boton = (b: EmailButton) =>
  b.style === 'secondary'
    ? `<a href="${escapeHtml(b.url)}" style="display:inline-block;margin:4px;border:1px solid ${BRAND.line};color:${BRAND.text};text-decoration:none;font-family:${FONT};font-size:15px;font-weight:700;padding:13px 22px;border-radius:14px;">${escapeHtml(b.text)}</a>`
    : `<a href="${escapeHtml(b.url)}" style="display:inline-block;margin:4px;background:${BRAND.accent};color:${BRAND.onAccent};text-decoration:none;font-family:${FONT};font-size:15px;font-weight:800;padding:14px 26px;border-radius:14px;">${escapeHtml(b.text)}</a>`;

/** El correo completo (HTML y texto) con el diseño de Fiestea. */
export const renderEmail = (c: EmailContent): { html: string; text: string } => {
  const parrafos = (c.paragraphs ?? [])
    .map(
      (p) =>
        `<tr><td style="font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.muted};padding-bottom:14px;white-space:pre-line;">${escapeHtml(p)}</td></tr>`,
    )
    .join('');
  const botones = c.buttons?.length
    ? `<tr><td align="center" style="padding:12px 0 22px;">${c.buttons.map(boton).join('')}</td></tr>`
    : '';
  const enlace = c.showLink
    ? `<tr><td style="font-family:${FONT};font-size:12px;line-height:1.5;color:${BRAND.muted};padding-bottom:16px;word-break:break-all;">${escapeHtml(c.showLink)}</td></tr>`
    : '';
  const nota = c.note
    ? `<tr><td style="font-family:${FONT};font-size:12px;line-height:1.5;color:${BRAND.muted};border-top:1px solid ${BRAND.line};padding-top:16px;">${escapeHtml(c.note)}</td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<title>${escapeHtml(c.heading)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(c.preheader ?? c.heading)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:28px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding:0 4px 18px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:10px;"><img src="${BRAND.logo}" width="40" height="40" alt="" style="display:block;border-radius:10px;"></td>
            <td style="font-family:${DISPLAY};font-size:22px;font-weight:800;color:${BRAND.text};">${BRAND.name}</td>
          </tr></table>
        </td></tr>
        <tr><td style="background:${BRAND.card};border-radius:20px;padding:30px 26px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${c.eyebrow ? `<tr><td style="font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.accent};padding-bottom:8px;">${escapeHtml(c.eyebrow)}</td></tr>` : ''}
            <tr><td style="font-family:${DISPLAY};font-size:26px;line-height:1.2;font-weight:800;color:${BRAND.text};padding-bottom:14px;">${escapeHtml(c.heading)}</td></tr>
            ${parrafos}
            ${c.blockHtml ? `<tr><td style="padding:4px 0 16px;">${c.blockHtml}</td></tr>` : ''}
            ${botones}
            ${enlace}
            ${nota}
          </table>
        </td></tr>
        <tr><td align="center" style="font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted};padding:20px 10px 0;">
          <span style="color:${BRAND.accent};font-weight:700;">${BRAND.tagline}</span><br>
          <a href="${BRAND.web}/legal/privacidad" style="color:${BRAND.muted};">Privacidad</a> ·
          <a href="${BRAND.web}/legal/terminos" style="color:${BRAND.muted};">Términos</a> ·
          <a href="${BRAND.web}/legal/soporte" style="color:${BRAND.muted};">Soporte</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    c.heading,
    ...(c.paragraphs ?? []),
    ...(c.buttons ?? []).map((b) => `${b.text}: ${b.url}`),
    c.note ?? '',
    `— ${BRAND.name} · ${BRAND.web}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { html, text };
};
