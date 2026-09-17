import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';

/**
 * Qué le pasa a cada correo después de salir.
 *
 * Que Resend devuelva 200 sólo significa que ha aceptado el envío. Lo que pasa
 * a continuación —que el buzón no exista, que el servidor de destino lo
 * rechace, que acabe en spam y alguien lo marque— llega por este webhook, y sin
 * él no había forma de distinguir a quien no recibe el correo de quien no se ha
 * registrado.
 *
 * Se configura en Resend, en Webhooks, apuntando a esta función.
 *
 * También recibe `email.received`: el correo que llega a cualquier dirección de
 * vybes.es (soporte@, admin@, hola@…), porque el MX del dominio apunta a Resend.
 * Resend no tiene buzón con IMAP, así que se reenvía a un correo de verdad con
 * `Reply-To` al remitente: contestar desde Gmail le responde a él.
 *
 * Variables:
 *   - RESEND_WEBHOOK_SECRET: el «signing secret» del webhook.
 *   - INBOUND_FORWARD_TO: a quién se reenvía (varios, separados por comas).
 *   - INBOUND_FORWARD_FROM: remitente del reenvío, p. ej. `Vybe <reenvio@vybes.es>`
 *     (si falta, AUTH_FROM_EMAIL).
 *   - RESEND_FULL_API_KEY: clave de Resend con acceso completo. La de envío
 *     (RESEND_API_KEY) no puede leer los correos recibidos.
 */

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    [key: string]: unknown;
  };
}

/**
 * Comprueba la firma de Svix, que es lo que usa Resend.
 *
 * La cabecera trae una o varias firmas separadas por espacios, cada una como
 * `v1,<base64>`. Se comparan todas porque durante una rotación de secreto
 * conviven la vieja y la nueva.
 */
const firmaValida = async (
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  cabecera: string,
): Promise<boolean> => {
  // El secreto viene como `whsec_<base64>`; lo que se usa es lo de después.
  const bruto = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const clave = Uint8Array.from(atob(bruto), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'raw',
    clave,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const firmado = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );

  const esperada = btoa(String.fromCharCode(...new Uint8Array(firmado)));

  return cabecera
    .split(' ')
    .map((parte) => parte.split(',')[1])
    .some((firma) => firma === esperada);
};

const escapar = (valor: string): string =>
  valor.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Resend puede devolver el HTML como `data:text/html;base64,…`. */
const htmlDe = (valor: unknown): string | null => {
  if (typeof valor !== 'string' || valor === '') return null;
  const dataUri = /^data:[^,]*?(;base64)?,(.*)$/s.exec(valor);
  if (!dataUri) return valor;
  try {
    if (!dataUri[1]) return decodeURIComponent(dataUri[2]);
    const bytes = Uint8Array.from(atob(dataUri[2]), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

interface CorreoRecibido {
  from?: string;
  to?: string[];
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
  attachments?: { filename?: string; size?: number }[];
}

/** Reenvía un correo entrante de vybes.es al buzón configurado. */
const reenviarRecibido = async (emailId: string): Promise<void> => {
  const clave = Deno.env.get('RESEND_FULL_API_KEY') ?? Deno.env.get('RESEND_API_KEY');
  const destino = (Deno.env.get('INBOUND_FORWARD_TO') ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  const remitente = Deno.env.get('INBOUND_FORWARD_FROM') ?? Deno.env.get('AUTH_FROM_EMAIL');

  if (!clave || destino.length === 0 || !remitente) {
    console.error('resend-webhook: correo recibido sin reenviar (faltan RESEND_FULL_API_KEY, INBOUND_FORWARD_TO o INBOUND_FORWARD_FROM)');
    return;
  }

  const respuesta = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${clave}` },
  });
  if (!respuesta.ok) {
    console.error('resend-webhook: no se pudo leer el correo recibido', respuesta.status, await respuesta.text());
    return;
  }

  const correo = (await respuesta.json()) as CorreoRecibido;
  const de = correo.headers?.from ?? correo.from ?? '';

  // Un reenvío que vuelve a entrar en vybes.es crearía un bucle infinito.
  const direccionRemitente = /<([^>]+)>/.exec(remitente)?.[1] ?? remitente;
  if (de.includes(direccionRemitente)) return;

  const para = (correo.to ?? []).join(', ');
  const adjuntos = (correo.attachments ?? []).map((a) => a.filename).filter(Boolean);
  const aviso = adjuntos.length
    ? ` · ${adjuntos.length} adjunto(s): ${adjuntos.join(', ')} (descárgalos en Resend → Emails → Receiving)`
    : '';

  const cabeceraHtml = `<p style="font:13px Arial,sans-serif;color:#6b6b70;margin:0 0 12px">Recibido en <b>${escapar(para)}</b> de <b>${escapar(de)}</b>${escapar(aviso)}</p><hr style="border:0;border-top:1px solid #e4e4e7;margin:0 0 16px">`;
  const html = htmlDe(correo.html);
  const texto = correo.text ?? '';

  const envio = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: remitente,
      to: destino,
      reply_to: correo.from,
      subject: `[${para}] ${correo.subject || '(sin asunto)'}`,
      html: cabeceraHtml + (html ?? `<pre style="white-space:pre-wrap;font:14px Arial,sans-serif">${escapar(texto)}</pre>`),
      text: `Recibido en ${para} de ${de}${aviso}\n\n${texto}`,
    }),
  });

  if (!envio.ok) {
    console.error('resend-webhook: no se pudo reenviar el correo', envio.status, await envio.text());
  }
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  const body = await req.text();

  // Sin secreto no se acepta nada: este endpoint es público y sin firma
  // cualquiera podría llenar la tabla de rebotes inventados.
  if (!secret) {
    console.error('resend-webhook: falta RESEND_WEBHOOK_SECRET');
    return json({ error: 'NOT_CONFIGURED' }, 503);
  }

  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const firma = req.headers.get('svix-signature');

  if (!id || !timestamp || !firma) return json({ error: 'Sin firma' }, 401);

  // Una firma válida de hace horas puede ser una repetición: se descarta lo que
  // tenga más de cinco minutos.
  const edad = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(edad) || edad > 300) return json({ error: 'Caducado' }, 401);

  if (!(await firmaValida(secret, id, timestamp, body, firma))) {
    return json({ error: 'Firma incorrecta' }, 401);
  }

  try {
    const evento = JSON.parse(body) as ResendEvent;

    // Correo que entra en vybes.es: se reenvía, no es un evento de un envío nuestro.
    if (evento.type === 'email.received') {
      if (evento.data?.email_id) await reenviarRecibido(evento.data.email_id);
      return json({ ok: true });
    }

    const destinatarios = Array.isArray(evento.data?.to)
      ? evento.data?.to
      : [evento.data?.to].filter(Boolean);

    if (destinatarios.length === 0 || !evento.type) return json({ ok: true });

    const supabase = adminClient();

    // `email.bounced` -> `bounced`: el prefijo no aporta nada y complica las
    // consultas.
    const tipo = evento.type.replace(/^email\./, '');

    await supabase.from('email_events').insert(
      destinatarios.map((email) => ({
        message_id: evento.data?.email_id ?? null,
        email: String(email).toLowerCase(),
        event: tipo,
        detail: evento.data ?? null,
      })),
    );

    return json({ ok: true });
  } catch (error) {
    console.error('resend-webhook:', error);
    // Se responde 200 igualmente: si se devuelve un error, Resend reintenta el
    // mismo evento durante días y no va a salir mejor la segunda vez.
    return json({ ok: false }, 200);
  }
});
