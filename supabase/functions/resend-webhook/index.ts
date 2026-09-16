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
 * Variables: RESEND_WEBHOOK_SECRET (el «signing secret» que da Resend).
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
