import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';
import { isResendConfigured, sendEmail } from '../_shared/resend.ts';
import { renderEmail } from '../_shared/email.ts';

/**
 * Alta de cuentas desde administración: una persona o un local, con nombre y
 * correo y nada más.
 *
 * No se pone contraseña: la cuenta se crea con el correo ya confirmado y a esa
 * dirección le llega un enlace para que la elija quien la vaya a usar. Así
 * administración nunca conoce la contraseña de nadie.
 *
 * Quien llama tiene que ser administración: se comprueba con su sesión contra
 * `profiles.role`, no con lo que diga el cuerpo de la petición.
 *
 * Variables: RESEND_API_KEY, AUTH_FROM_EMAIL (o SOS_FROM_EMAIL), APP_URL.
 */

const appUrl = (): string => (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');

const TEXTOS = {
  user: {
    subject: 'Tu cuenta ya está creada',
    title: 'Te hemos creado una cuenta',
    body: 'Elige tu contraseña y ya puedes entrar desde la app.',
    cta: 'Elegir contraseña',
  },
  venue: {
    subject: 'Tu negocio ya está dado de alta',
    title: 'Te hemos creado el acceso de tu negocio',
    body: 'Elige tu contraseña para entrar al panel y empezar a crear fiestas.',
    cta: 'Elegir contraseña',
  },
};

const plantilla = (tipo: 'user' | 'venue', nombre: string, link: string) => {
  const c = TEXTOS[tipo];
  const { html, text } = renderEmail({
    preheader: c.body,
    heading: c.title,
    paragraphs: [`Hola ${nombre || ''}.`, c.body],
    buttons: [{ text: c.cta, url: link }],
    showLink: link,
    note: 'Si no esperabas este correo, puedes ignorarlo.',
  });
  return { html, text, subject: c.subject };
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  try {
    const caller = await getUser(req, supabase);
    if (!caller) return json({ error: 'NOT_AUTHENTICATED' }, 401);

    const { data: perfil } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', caller.id)
      .maybeSingle();
    if (perfil?.role !== 'admin') return json({ error: 'NOT_AUTHORIZED' }, 403);

    const { type, name, email, venueType, city, latitude, longitude } = (await req.json()) as {
      type?: 'user' | 'venue';
      name?: string;
      email?: string;
      venueType?: string;
      city?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };

    const TIPOS_LOCAL = ['discoteca', 'bar', 'festival', 'fiesta_privada', 'evento_empresarial', 'local'];

    const tipo = type === 'venue' ? 'venue' : 'user';
    const nombre = (name ?? '').trim();
    const correo = (email ?? '').trim().toLowerCase();

    if (nombre.length < 2) return json({ error: 'NAME_REQUIRED' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return json({ error: 'EMAIL_INVALID' }, 400);

    // Si ya existe esa dirección no se crea nada: el alta duplicada dejaría dos
    // cuentas con el mismo correo y ninguna usable.
    const { data: existente } = await supabase.rpc('signup_availability', {
      p_email: correo,
      p_phone: null,
    });
    const libre = Array.isArray(existente) ? existente[0] : existente;
    if (libre && libre.email_taken) return json({ error: 'EMAIL_TAKEN' }, 409);

    const { data: creado, error: errorAlta } = await supabase.auth.admin.createUser({
      email: correo,
      email_confirm: true,
      user_metadata: tipo === 'venue' ? { name: nombre, account_type: 'venue' } : { name: nombre },
    });
    if (errorAlta || !creado?.user) {
      console.error('admin-create-account:', errorAlta?.message);
      return json({ error: 'CREATE_FAILED' }, 502);
    }

    const userId = creado.user.id;

    if (tipo === 'venue') {
      // Lo crea administración, así que nace verificado y con su ubicación:
      // sin coordenadas sus códigos QR no funcionarían. El tipo es obligatorio
      // en la base de datos.
      const tipoLocal = TIPOS_LOCAL.includes(venueType ?? '') ? venueType : 'discoteca';
      const tieneCoords = typeof latitude === 'number' && typeof longitude === 'number';
      const { error: errorVenue } = await supabase.from('venues').insert({
        venue_id: userId,
        name: nombre,
        email: correo,
        type: tipoLocal,
        city: city?.trim() || null,
        latitude: tieneCoords ? latitude : null,
        longitude: tieneCoords ? longitude : null,
        is_verified: true,
        verification_status: 'approved',
      });
      if (errorVenue) {
        console.error('admin-create-account venue:', errorVenue.message);
        await supabase.auth.admin.deleteUser(userId);
        return json({ error: 'CREATE_FAILED' }, 502);
      }
    } else {
      // Al perfil que crea el disparador del alta se le pone el nombre.
      await supabase.from('profiles').update({ name: nombre }).eq('user_id', userId);
    }

    // El enlace para elegir contraseña.
    const { data: enlace, error: errorEnlace } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: correo,
      options: { redirectTo: `${appUrl()}/auth/reset-password` },
    } as Parameters<typeof supabase.auth.admin.generateLink>[0]);

    const link = enlace?.properties?.action_link;
    if (errorEnlace || !link) {
      console.error('admin-create-account link:', errorEnlace?.message);
      return json({ id: userId, emailSent: false, error: 'LINK_FAILED' }, 200);
    }

    if (!isResendConfigured()) {
      return json({ id: userId, emailSent: false, error: 'EMAIL_NOT_CONFIGURED' }, 200);
    }

    const { html, text, subject } = plantilla(tipo, nombre, link);
    try {
      await sendEmail({ to: correo, subject, html, text });
    } catch (error) {
      console.error('admin-create-account mail:', error);
      return json({ id: userId, emailSent: false, error: 'EMAIL_FAILED' }, 200);
    }

    return json({ id: userId, emailSent: true });
  } catch (error) {
    console.error('admin-create-account:', error);
    return json({ error: 'SERVER_ERROR' }, 500);
  }
});
