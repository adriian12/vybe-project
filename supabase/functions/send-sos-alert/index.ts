import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser, getProfileId } from '../_shared/supabase.ts';
import { trySendSms, isTwilioConfigured } from '../_shared/twilio.ts';

/**
 * Avisa a los contactos de confianza cuando alguien pulsa el botón de
 * emergencia, con su ubicación en vivo.
 *
 * Canales: SMS por Twilio y correo por Resend. Cada uno se activa por separado;
 * si no hay ninguno configurado la alerta queda registrada igualmente y se
 * devuelve el detalle para que la interfaz pueda avisar.
 *
 * Variables: TWILIO_ACCOUNT_SID + TWILIO_API_KEY_SID/SECRET (o TWILIO_AUTH_TOKEN),
 *            RESEND_API_KEY, SOS_FROM_EMAIL, APP_URL
 */

const mapsLink = (lat?: number | null, lng?: number | null): string | null =>
  lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null;

const sendEmail = async (to: string, subject: string, text: string): Promise<boolean> => {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('SOS_FROM_EMAIL');
  if (!key || !from) return false;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!response.ok) console.error('Resend error:', await response.text());
  return response.ok;
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'No autenticado' }, 401);

    const profileId = await getProfileId(supabase, user.id);
    if (!profileId) return json({ error: 'Perfil no encontrado' }, 404);

    const { alertId } = (await req.json()) as { alertId?: string };
    if (!alertId) return json({ error: 'Falta el identificador de la alerta' }, 400);

    // La alerta debe ser de quien llama: nadie dispara avisos en nombre de otro.
    const { data: alert } = await supabase
      .from('sos_alerts')
      .select('*, profiles!inner(name), events(name)')
      .eq('id', alertId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (!alert) return json({ error: 'Alerta no encontrada' }, 404);

    const record = alert as typeof alert & {
      profiles: { name: string } | null;
      events: { name: string } | null;
    };

    const { data: contacts } = await supabase
      .from('trusted_contacts')
      .select('name, phone, email')
      .eq('profile_id', profileId);

    if (!contacts || contacts.length === 0) {
      return json({ error: 'NO_CONTACTS', notified: 0 }, 400);
    }

    const name = record.profiles?.name ?? 'Alguien';
    const place = record.events?.name ?? null;
    const link = mapsLink(record.latitude, record.longitude);

    /**
     * El mensaje va dirigido a cada contacto por su nombre.
     *
     * Un aviso impersonal que empieza por «alerta del sistema» se confunde con
     * publicidad y se ignora; el nombre de quien recibe y de quien pide ayuda es
     * lo que hace que se lea a las tres de la mañana. Se mantiene corto para que
     * quepa en un solo SMS: el enlace de Google Maps cuenta dentro de los 160
     * caracteres.
     */
    const messageFor = (contactName: string): string => {
      const where = link
        ? `se encuentra en ${link}`
        : place
          ? `está en ${place}, sin ubicación exacta`
          : 'no ha podido compartir su ubicación';

      return [
        `Hola ${contactName}, tu amigo/a ${name} necesita ayuda y ${where}.`,
        place && link ? `Evento: ${place}.` : null,
        record.note ? `Dice: ${record.note}` : null,
        '- Vybes',
      ]
        .filter(Boolean)
        .join(' ');
    };

    let notified = 0;
    for (const contact of contacts) {
      const text = messageFor(contact.name);
      const results = await Promise.all([
        contact.phone ? trySendSms(contact.phone, text) : Promise.resolve(false),
        contact.email
          ? sendEmail(contact.email, `${name} necesita ayuda`, text)
          : Promise.resolve(false),
      ]);
      if (results.some(Boolean)) notified += 1;
    }

    // Si no hay canales configurados la alerta existe pero nadie la recibe:
    // la interfaz debe poder decirlo con claridad.
    const channelsConfigured = isTwilioConfigured() || Boolean(Deno.env.get('RESEND_API_KEY'));

    return json({ notified, total: contacts.length, channelsConfigured });
  } catch (error) {
    console.error('SOS error:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
