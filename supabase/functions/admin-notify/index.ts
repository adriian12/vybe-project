import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';
import { isResendConfigured, sendEmail } from '../_shared/resend.ts';

/**
 * Avisos de administración a usuarios y locales (migración 071).
 *
 *   · `preview`: cuántas suscripciones caducan en 7 días sin renovarse solas y
 *     todavía no se han avisado.
 *   · `expiring` (`kind: user|venue`): «Tu suscripción está a punto de
 *     caducar» a quien la ha cancelado, está en prueba o la dio
 *     administración. Quien renueva sola no recibe nada. Una vez por fecha de
 *     caducidad (`subscription_notices`). Usuarios: push y correo; locales:
 *     correo (la cuenta del local no tiene app).
 *   · `update` (`kind`, `title`, `body`): una novedad. Usuarios: push a todos
 *     (por la cola de avisos); locales: correo a todos.
 *
 * Sólo administración (`profiles.role = 'admin'`).
 *
 * Variables: PUSH_HOOK_SECRET, SUPABASE_URL, RESEND_API_KEY, AUTH_FROM_EMAIL, APP_URL.
 */

const DIAS = 7;

type Locale = 'es' | 'en' | 'de' | 'ca';
const idioma = (value: unknown): Locale => {
  const base = typeof value === 'string' ? value.slice(0, 2).toLowerCase() : '';
  return base === 'en' || base === 'de' || base === 'ca' ? base : 'es';
};

const TEXTOS: Record<Locale, (fecha: string) => { title: string; body: string }> = {
  es: (fecha) => ({
    title: 'Tu suscripción está a punto de caducar',
    body: `Tu Premium termina el ${fecha}. Renuévalo desde tu perfil para no perder tus ventajas.`,
  }),
  en: (fecha) => ({
    title: 'Your subscription is about to expire',
    body: `Your Premium ends on ${fecha}. Renew it from your profile to keep your perks.`,
  }),
  de: (fecha) => ({
    title: 'Dein Abo läuft bald ab',
    body: `Dein Premium endet am ${fecha}. Verlängere es in deinem Profil, um deine Vorteile zu behalten.`,
  }),
  ca: (fecha) => ({
    title: 'La teva subscripció està a punt de caducar',
    body: `El teu Premium acaba el ${fecha}. Renova'l des del teu perfil per no perdre els avantatges.`,
  }),
};

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const correoHtml = (titulo: string, cuerpo: string, cta?: { texto: string; url: string }) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#111114;color:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <h1 style="font-size:22px;margin:0 0 12px">${escapar(titulo)}</h1>
    <p style="color:#b8b8bd;line-height:1.6;margin:0 0 24px;white-space:pre-line">${escapar(cuerpo)}</p>
    ${cta ? `<p style="margin:0 0 24px"><a href="${cta.url}" style="display:inline-block;background:#f8d000;color:#1c1c1c;font-weight:700;text-decoration:none;padding:14px 24px;border-radius:14px">${escapar(cta.texto)}</a></p>` : ''}
  </div>
</body></html>`;

const fecha = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'NOT_AUTHENTICATED' }, 401);
    const { data: perfil } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
    if (perfil?.role !== 'admin') return json({ error: 'NOT_AUTHORIZED' }, 403);

    const { action, kind, title, body } = (await req.json()) as {
      action?: 'preview' | 'expiring' | 'update';
      kind?: 'user' | 'venue';
      title?: string;
      body?: string;
    };

    const pendientes = async (tipo: 'user' | 'venue') => {
      const { data } = await supabase.rpc('admin_expiring_targets', { p_kind: tipo, p_days: DIAS });
      return ((data ?? []) as {
        target_id: string;
        name: string | null;
        email: string | null;
        locale: string | null;
        plan: string | null;
        expires_at: string;
        notified: boolean;
      }[]).filter((row) => !row.notified);
    };

    // ------------------------------------------------------------ preview
    if (action === 'preview') {
      const [usuarios, locales] = await Promise.all([pendientes('user'), pendientes('venue')]);
      return json({ users: usuarios.length, venues: locales.length });
    }

    const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');
    const functionsUrl = `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')}/functions/v1`;
    const pushSecret = Deno.env.get('PUSH_HOOK_SECRET') ?? '';

    const push = async (profileId: string, texto: { title: string; body: string }, url: string) => {
      try {
        const r = await fetch(`${functionsUrl}/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-push-secret': pushSecret },
          body: JSON.stringify({ profileId, kind: 'admin', ...texto, url, tag: 'subscription' }),
        });
        return r.ok;
      } catch {
        return false;
      }
    };

    const correo = async (to: string, subject: string, html: string, text: string) => {
      if (!isResendConfigured()) return false;
      try {
        await sendEmail({ to, subject, html, text });
        return true;
      } catch (error) {
        console.error('admin-notify mail:', error);
        return false;
      }
    };

    // ----------------------------------------------------------- expiring
    if (action === 'expiring' && (kind === 'user' || kind === 'venue')) {
      const lista = await pendientes(kind);
      let enviados = 0;

      for (const row of lista) {
        let ok = false;
        if (kind === 'user') {
          const loc = idioma(row.locale);
          const texto = TEXTOS[loc](fecha(row.expires_at, loc));
          const [p, m] = await Promise.all([
            push(row.target_id, texto, '/profile'),
            row.email
              ? correo(row.email, texto.title, correoHtml(texto.title, texto.body, { texto: 'Abrir la app', url: `${appUrl}/profile` }), texto.body)
              : Promise.resolve(false),
          ]);
          ok = p || m;
        } else if (row.email) {
          const plan = row.plan === 'business' ? 'Business' : 'Pro';
          const titulo = 'Tu suscripción está a punto de caducar';
          const cuerpo = `Hola ${row.name ?? ''}.\n\nTu plan ${plan} termina el ${fecha(row.expires_at, 'es')} y no se renovará solo. Si no lo renuevas, el panel volverá al plan gratuito y dejarás de tener sus funciones.\n\nPuedes renovarlo desde el panel del local, en Plan.`;
          ok = await correo(row.email, titulo, correoHtml(titulo, cuerpo, { texto: 'Renovar mi plan', url: `${appUrl}/venue/dashboard?seccion=plan` }), cuerpo);
        }
        if (ok) {
          enviados += 1;
          await supabase
            .from('subscription_notices')
            .upsert({ kind, target_id: row.target_id, expires_at: row.expires_at }, { onConflict: 'kind,target_id,expires_at' });
        }
      }
      return json({ sent: enviados, total: lista.length });
    }

    // ------------------------------------------------------------- update
    if (action === 'update' && (kind === 'user' || kind === 'venue')) {
      const titulo = (title ?? '').trim().slice(0, 80);
      const cuerpo = (body ?? '').trim().slice(0, kind === 'user' ? 200 : 2000);
      if (!titulo || !cuerpo) return json({ error: 'EMPTY_MESSAGE' }, 400);

      if (kind === 'user') {
        // Por la cola de avisos: sale al momento a todos los que tienen activados
        // los avisos (disparador `broadcasts_send_now`).
        const { error } = await supabase.from('broadcasts').insert({
          title: titulo,
          body: cuerpo,
          url: '/home',
          created_by: user.id,
        });
        if (error) {
          console.error('admin-notify broadcast:', error.message);
          return json({ error: 'SEND_FAILED' }, 502);
        }
        return json({ queued: true });
      }

      const { data: locales } = await supabase.from('venues').select('email, name').not('email', 'is', null);
      let enviados = 0;
      for (const local of locales ?? []) {
        const texto = `Hola ${local.name ?? ''}.\n\n${cuerpo}`;
        if (await correo(local.email as string, titulo, correoHtml(titulo, texto, { texto: 'Abrir el panel', url: `${appUrl}/venue/dashboard` }), texto)) {
          enviados += 1;
        }
      }
      return json({ sent: enviados, total: (locales ?? []).length });
    }

    return json({ error: 'Acción no válida' }, 400);
  } catch (error) {
    console.error('admin-notify:', error);
    return json({ error: 'SERVER_ERROR' }, 500);
  }
});
