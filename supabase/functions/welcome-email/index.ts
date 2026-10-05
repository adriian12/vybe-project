import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { BRAND, escapeHtml, renderEmail } from '../_shared/email.ts';
import { isResendConfigured, sendEmail } from '../_shared/resend.ts';

/**
 * Bienvenida a quien entra por primera vez con Google o Apple (migración 102).
 *
 * Con correo y contraseña ya llega el correo de verificación; con Google o
 * Apple no llegaba nada. Lo llama el disparador `profiles_welcome_email` (por
 * `pg_net`, con el mismo secreto que `send-push`), una sola vez por cuenta
 * (`profiles.welcome_email_sent_at`). Lleva la comparativa invitado/fiester@
 * de la app (`account-kind-info.tsx`).
 */

type Lang = 'es' | 'en' | 'de' | 'ca';

/** Las mismas filas que la tabla de la app: [clave, invitado, fiester@]. */
const FILAS: [string, boolean, boolean][] = [
  ['events', true, true],
  ['tickets', true, true],
  ['follow', true, true],
  ['qr', true, true],
  ['offers', true, true],
  ['raffles', false, true],
  ['challenges', false, true],
  ['songs', false, true],
  ['vibe', false, true],
  ['board', false, true],
  ['premium', false, true],
];

const TEXTOS: Record<
  Lang,
  {
    subject: string;
    eyebrow: string;
    heading: (name: string) => string;
    paragraphs: string[];
    compareTitle: string;
    guest: string;
    vyber: string;
    rows: Record<string, string>;
    button: string;
    note: string;
  }
> = {
  es: {
    subject: 'Bienvenid@ a Fiestea',
    eyebrow: 'Bienvenid@',
    heading: (n) => (n ? `¡Hola, ${n}!` : '¡Hola!'),
    paragraphs: [
      'Ya tienes tu cuenta de Fiestea: todas las fiestas de tu zona, sus entradas y lo que pasa dentro, en una sola app.',
      'Puedes usarla de dos formas y cambiar cuando quieras desde tu perfil. Como invitado ves la fiesta; como Fiester@ la juegas: entras con tu foto de la noche, sales en el Flechazo y conoces a quien está allí.',
    ],
    compareTitle: 'Invitado o Fiester@',
    guest: 'Invitado',
    vyber: 'Fiester@',
    rows: {
      events: 'Fiestas, mapa y precios',
      tickets: 'Entradas',
      follow: 'Avisos y seguir negocios',
      qr: 'Entrar con QR',
      offers: 'Ofertas y vales',
      raffles: 'Sorteos de la noche',
      challenges: 'Retos y sellos',
      songs: 'Votar la canción',
      vibe: 'Ambiente y cuánta gente',
      board: 'Flechazo: tablón, match y chat',
      premium: 'Premium',
    },
    button: 'Ver fiestas',
    note: 'Has recibido este correo porque has creado una cuenta en Fiestea con Google o Apple.',
  },
  en: {
    subject: 'Welcome to Fiestea',
    eyebrow: 'Welcome',
    heading: (n) => (n ? `Hi, ${n}!` : 'Hi!'),
    paragraphs: [
      'Your Fiestea account is ready: every party around you, its tickets and what happens inside, in one app.',
      'You can use it in two ways and switch anytime from your profile. As a guest you see the party; as a Fiester you play it: you get in with your photo of the night, show up in Flechazo and meet who is there.',
    ],
    compareTitle: 'Guest or Fiester',
    guest: 'Guest',
    vyber: 'Fiester',
    rows: {
      events: 'Parties, map and prices',
      tickets: 'Tickets',
      follow: 'Alerts and following venues',
      qr: 'Enter with QR',
      offers: 'Offers and vouchers',
      raffles: 'Raffles of the night',
      challenges: 'Challenges and stamps',
      songs: 'Vote for the song',
      vibe: 'Vibe and how many people',
      board: 'Flechazo: board, match and chat',
      premium: 'Premium',
    },
    button: 'See parties',
    note: 'You received this email because you created a Fiestea account with Google or Apple.',
  },
  de: {
    subject: 'Willkommen bei Fiestea',
    eyebrow: 'Willkommen',
    heading: (n) => (n ? `Hallo, ${n}!` : 'Hallo!'),
    paragraphs: [
      'Dein Fiestea-Konto ist bereit: alle Partys in deiner Nähe, ihre Tickets und was drinnen passiert, in einer App.',
      'Du kannst sie auf zwei Arten nutzen und jederzeit im Profil wechseln. Als Gast siehst du die Party; als Fiester spielst du sie: Du kommst mit deinem Foto der Nacht rein, erscheinst im Flechazo und lernst Leute vor Ort kennen.',
    ],
    compareTitle: 'Gast oder Fiester',
    guest: 'Gast',
    vyber: 'Fiester',
    rows: {
      events: 'Partys, Karte und Preise',
      tickets: 'Tickets',
      follow: 'Hinweise und Locations folgen',
      qr: 'Mit QR rein',
      offers: 'Angebote und Gutscheine',
      raffles: 'Verlosungen der Nacht',
      challenges: 'Challenges und Stempel',
      songs: 'Den Song wählen',
      vibe: 'Stimmung und wie viele Leute',
      board: 'Flechazo: Pinnwand, Match und Chat',
      premium: 'Premium',
    },
    button: 'Partys ansehen',
    note: 'Du erhältst diese E-Mail, weil du ein Fiestea-Konto mit Google oder Apple erstellt hast.',
  },
  ca: {
    subject: 'Benvingut/da a Fiestea',
    eyebrow: 'Benvingut/da',
    heading: (n) => (n ? `Hola, ${n}!` : 'Hola!'),
    paragraphs: [
      'Ja tens el teu compte de Fiestea: totes les festes de la teva zona, les seves entrades i el que passa a dins, en una sola app.',
      "La pots fer servir de dues maneres i canviar quan vulguis des del perfil. Com a convidat veus la festa; com a Fiester@ la jugues: hi entres amb la foto de la nit, surts al Flechazo i coneixes qui hi ha.",
    ],
    compareTitle: 'Convidat o Fiester@',
    guest: 'Convidat',
    vyber: 'Fiester@',
    rows: {
      events: 'Festes, mapa i preus',
      tickets: 'Entrades',
      follow: 'Avisos i seguir negocis',
      qr: 'Entrar amb QR',
      offers: 'Ofertes i vals',
      raffles: 'Sortejos de la nit',
      challenges: 'Reptes i segells',
      songs: 'Votar la cançó',
      vibe: 'Ambient i quanta gent hi ha',
      board: 'Flechazo: tauler, match i xat',
      premium: 'Premium',
    },
    button: 'Veure festes',
    note: "Has rebut aquest correu perquè has creat un compte a Fiestea amb Google o Apple.",
  },
};

const idioma = (locale: string | null | undefined): Lang => {
  const corto = (locale ?? 'es').slice(0, 2);
  return corto === 'en' || corto === 'de' || corto === 'ca' ? corto : 'es';
};

/** La tabla de la app, en HTML de correo (tablas y estilos en línea). */
const tabla = (t: (typeof TEXTOS)['es']): string => {
  const marca = (si: boolean) =>
    si
      ? `<span style="color:#22C55E;font-size:18px;font-weight:800;">&#10003;</span>`
      : `<span style="color:#EF4444;font-size:18px;font-weight:800;">&#10007;</span>`;
  const celda = `font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;padding:9px 10px;border-top:1px solid #2E2E34;`;
  const filas = FILAS.map(
    ([clave, invitado, vyber]) =>
      `<tr><td style="${celda}color:#FFFFFF;">${escapeHtml(t.rows[clave])}</td><td align="center" style="${celda}">${marca(invitado)}</td><td align="center" style="${celda}">${marca(vyber)}</td></tr>`,
  ).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cardSoft};border-radius:14px;overflow:hidden;">
    <tr>
      <td style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;padding:12px 10px;color:${BRAND.accent};font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(t.compareTitle)}</td>
      <td align="center" style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;padding:12px 10px;color:${BRAND.muted};font-size:12px;font-weight:800;">${escapeHtml(t.guest)}</td>
      <td align="center" style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;padding:12px 10px;color:${BRAND.accent};font-size:12px;font-weight:800;">${escapeHtml(t.vyber)}</td>
    </tr>
    ${filas}
  </table>`;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const secreto = Deno.env.get('PUSH_HOOK_SECRET');
  if (!secreto || req.headers.get('x-push-secret') !== secreto) return json({ error: 'NOT_AUTHORIZED' }, 401);
  if (!isResendConfigured()) return json({ sent: false, reason: 'RESEND_NOT_CONFIGURED' });

  try {
    const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
    if (!userId) return json({ error: 'BAD_REQUEST' }, 400);
    const supabase = adminClient();

    // Una sola vez por cuenta: se reserva antes de mandar (dos llamadas a la
    // vez no mandan dos correos).
    const { data: reserva } = await supabase
      .from('profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('welcome_email_sent_at', null)
      .select('name, locale');
    const perfil = reserva?.[0];
    if (!perfil) return json({ sent: false, reason: 'ALREADY_SENT' });

    const { data: usuario } = await supabase.auth.admin.getUserById(userId);
    const correo = usuario?.user?.email;
    if (!correo) return json({ sent: false, reason: 'NO_EMAIL' });

    const t = TEXTOS[idioma(perfil.locale as string | null)];
    const nombre = String(perfil.name ?? '').trim().split(' ')[0] ?? '';
    const { html, text } = renderEmail({
      preheader: t.paragraphs[0],
      eyebrow: t.eyebrow,
      heading: t.heading(nombre),
      paragraphs: t.paragraphs,
      blockHtml: tabla(t),
      buttons: [{ text: t.button, url: `${BRAND.web}` }],
      note: t.note,
    });
    try {
      await sendEmail({ to: correo, subject: t.subject, html, text });
    } catch (error) {
      // No ha salido: se suelta la reserva para que un reintento pueda mandarlo.
      await supabase.from('profiles').update({ welcome_email_sent_at: null }).eq('user_id', userId);
      throw error;
    }
    return json({ sent: true });
  } catch (error) {
    console.error('welcome-email:', error);
    return json({ error: 'INTERNAL' }, 500);
  }
});
