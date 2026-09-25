import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { isResendConfigured, sendEmail } from '../_shared/resend.ts';
import { renderEmail } from '../_shared/email.ts';

/**
 * Formulario «Solicitar demo» de la landing.
 *
 * Es público —quien lo rellena todavía no tiene cuenta—, así que se despliega
 * sin JWT y la protección va dentro:
 *
 *   - Validación de cada campo en el servidor, no sólo en el navegador.
 *   - Un campo trampa (`website`) que una persona no ve: si llega relleno es un
 *     robot, y se le contesta que todo ha ido bien sin guardar nada.
 *   - Cinco envíos por IP a la hora. La IP no se guarda: sólo un hash con sal.
 *   - El mismo contacto dos veces en un día no duplica la solicitud.
 *
 * La solicitud se guarda en `venue_leads` y después se avisa por correo. Si el
 * correo falla, la solicitud ya está guardada y se ve en administración.
 */

const TYPES = ['discoteca', 'bar', 'festival', 'club', 'beach_club', 'otro'];
const LOCALES = ['es', 'en', 'de', 'ca'];
const MAX_PER_HOUR = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()-]{9,20}$/;

/** El aviso va a este correo; por defecto, el de contacto de la empresa. */
const notifyTo = (): string => Deno.env.get('LEADS_NOTIFY_EMAIL') ?? 'rojasadrian12@gmail.com';

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const hashIp = async (ip: string): Promise<string> => {
  const salt = Deno.env.get('SUPABASE_URL') ?? 'vybe';
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_BODY' }, 400);
  }

  // Robot: se le dice que sí y no se guarda nada.
  if (clean(body.website, 200)) return json({ ok: true });

  const venueName = clean(body.venueName, 120);
  const city = clean(body.city, 80);
  const contact = clean(body.contact, 160);
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : '';
  const venueType = TYPES.includes(String(body.venueType)) ? String(body.venueType) : null;
  const locale = LOCALES.includes(String(body.locale)) ? String(body.locale) : 'es';

  if (venueName.length < 2 || city.length < 2) return json({ error: 'INVALID_FIELDS' }, 400);
  if (!EMAIL_RE.test(contact) && !PHONE_RE.test(contact)) return json({ error: 'INVALID_CONTACT' }, 400);
  if (body.consent !== true) return json({ error: 'CONSENT_REQUIRED' }, 400);

  const supabase = adminClient();
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const ipHash = await hashIp(ip);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recent } = await supabase
    .from('venue_leads')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gt('created_at', hourAgo);

  if ((recent ?? 0) >= MAX_PER_HOUR) return json({ error: 'TOO_MANY' }, 429);

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: duplicate } = await supabase
    .from('venue_leads')
    .select('id', { count: 'exact', head: true })
    .eq('contact', contact)
    .gt('created_at', dayAgo);

  if ((duplicate ?? 0) > 0) return json({ ok: true, duplicate: true });

  const { error } = await supabase.from('venue_leads').insert({
    venue_name: venueName,
    city,
    venue_type: venueType,
    contact,
    message: message || null,
    locale,
    source: 'landing',
    ip_hash: ipHash,
  });

  if (error) {
    console.error('venue-lead insert', error);
    return json({ error: 'SAVE_FAILED' }, 500);
  }

  if (isResendConfigured()) {
    const rows: [string, string][] = [
      ['Negocio', venueName],
      ['Tipo', venueType ?? '—'],
      ['Ciudad', city],
      ['Contacto', contact],
      ['Idioma', locale],
      ['Mensaje', message || '—'],
    ];
    const tabla = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#A6A6AE;font-size:13px;vertical-align:top;">${k}</td><td style="padding:6px 0;color:#FFFFFF;font-size:14px;white-space:pre-wrap;">${escapeHtml(v)}</td></tr>`,
      )
      .join('')}</table>`;
    const { html } = renderEmail({
      eyebrow: 'Nueva solicitud',
      heading: `Demo para ${venueName}`,
      paragraphs: ['Un negocio ha pedido una demo desde la web.'],
      blockHtml: tabla,
      buttons: [{ text: 'Ver solicitudes', url: 'https://app.fiestea.es/admin/dashboard' }],
    });
    const text = ['Nueva solicitud de demo desde la landing', '', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');

    try {
      await sendEmail({ to: notifyTo(), subject: `Fiestea · Solicitud de ${venueName} (${city})`, html, text });
    } catch (mailError) {
      // La solicitud ya está guardada: el aviso por correo es un extra.
      console.error('venue-lead email', mailError);
    }
  }

  return json({ ok: true });
});
