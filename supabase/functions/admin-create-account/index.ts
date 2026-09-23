import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';
import { isResendConfigured, sendEmail } from '../_shared/resend.ts';

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
    subject: 'Tu local ya está dado de alta',
    title: 'Te hemos creado el acceso de tu local',
    body: 'Elige tu contraseña para entrar al panel y empezar a crear fiestas.',
    cta: 'Elegir contraseña',
  },
};

const plantilla = (tipo: 'user' | 'venue', nombre: string, link: string) => {
  const c = TEXTOS[tipo];
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#111114;color:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <h1 style="font-size:22px;margin:0 0 8px">${c.title}</h1>
    <p style="color:#b8b8bd;line-height:1.5;margin:0 0 8px">Hola ${nombre || ''}.</p>
    <p style="color:#b8b8bd;line-height:1.5;margin:0 0 24px">${c.body}</p>
    <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#f8d000;color:#1c1c1c;font-weight:700;text-decoration:none;padding:14px 24px;border-radius:14px">${c.cta}</a></p>
    <p style="color:#6f6f78;font-size:12px;line-height:1.5;margin:0">Si no esperabas este correo, puedes ignorarlo.</p>
  </div>
</body></html>`;
  const text = `${c.title}\n\n${c.body}\n\n${link}`;
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

    const { type, name, email } = (await req.json()) as {
      type?: 'user' | 'venue';
      name?: string;
      email?: string;
    };

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
      // El local nace sin verificar: se aprueba desde «Altas de locales», que
      // es donde se miran los papeles.
      const { error: errorVenue } = await supabase.from('venues').insert({
        venue_id: userId,
        name: nombre,
        email: correo,
        is_verified: false,
        verification_status: 'pending',
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
