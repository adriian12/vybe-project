import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import {
  isResendConfigured,
  sendEmail,
  ResendNotConfiguredError,
  ResendSendError,
} from '../_shared/resend.ts';

/**
 * Alta de cuenta y correo de verificación, por Resend.
 *
 * Por qué no se usa `supabase.auth.signUp()` desde el navegador:
 *
 *   El servicio de correo que trae Supabase de serie **sólo entrega a los
 *   miembros de tu organización de Supabase** y admite dos o tres correos por
 *   hora. Con él, quien se registraba desde fuera no recibía nada y la cuenta
 *   se quedaba sin verificar para siempre. Configurar un SMTP propio se hace en
 *   el panel, no desde código, así que dependía de acordarse de hacerlo.
 *
 *   `generateLink()` crea la cuenta y **devuelve** el enlace de confirmación en
 *   lugar de mandarlo. Con eso el correo sale por Resend, que es el proveedor
 *   que ya se usa para los avisos de emergencia, y el alta deja de depender de
 *   ninguna configuración del panel.
 *
 * La documentación del local no se puede subir aquí: son ficheros de hasta
 * 10 MB y todavía no hay sesión con la que autenticar la subida. Lo que se
 * devuelve es una URL firmada por fichero para que el navegador los suba
 * directamente al bucket privado.
 *
 * Variables: RESEND_API_KEY, AUTH_FROM_EMAIL (o SOS_FROM_EMAIL), APP_URL.
 *
 * Marca: el backend es el mismo para Fiestea y Vybes, así que la app dice cuál
 * es (`brand`) y el correo sale con su nombre, sus colores y el enlace a su
 * web. Sin `brand` (versiones antiguas de la app), Fiestea, que es la marca
 * principal. Las dos webs están en las «Redirect URLs» de Supabase Auth.
 */

type Action = 'signup' | 'resend' | 'recover' | 'check';

interface DocumentRequest {
  name: string;
  size: number;
}

interface RequestBody {
  action: Action;
  email: string;
  password?: string;
  metadata?: Record<string, unknown>;
  documents?: DocumentRequest[];
  /** Para `check`: el móvil que se quiere registrar. */
  phone?: string;
  locale?: string;
  brand?: string;
}

const MAX_DOCUMENTS = 6;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

interface Brand {
  name: string;
  appUrl: string;
  /** Fondo, tarjeta, borde, acento y texto del botón. */
  bg: string;
  card: string;
  line: string;
  accent: string;
  onAccent: string;
}

const BRANDS: Record<string, Brand> = {
  fiestea: {
    name: 'Fiestea',
    appUrl: 'https://app.fiestea.es',
    bg: '#111114',
    card: '#1C1C1F',
    line: '#2E2E33',
    accent: '#F8D000',
    onAccent: '#1C1C1C',
  },
  vybes: {
    name: 'Vybes',
    appUrl: (Deno.env.get('APP_URL') ?? 'https://app.vybes.es').replace(/\/$/, ''),
    bg: '#121832',
    card: '#1E2449',
    line: '#363C63',
    accent: '#9b87f5',
    onAccent: '#ffffff',
  },
};

const pickBrand = (brand: string | undefined): Brand => BRANDS[(brand ?? '').toLowerCase()] ?? BRANDS.fiestea;

// ============================================================================
// Textos
// ============================================================================

type Copy = { subject: string; heading: string; body: string; cta: string; ignore: string };

type Kind = 'confirm' | 'recover' | 'exists';

const COPY: Record<string, Record<Kind, Copy>> = {
  es: {
    confirm: {
      subject: 'Confirma tu cuenta de {app}',
      heading: 'Ya casi estás',
      body: 'Confirma tu correo para entrar en {app} y empezar a descubrir fiestas.',
      cta: 'Confirmar mi cuenta',
      ignore: 'Si no has creado ninguna cuenta en {app}, ignora este mensaje.',
    },
    recover: {
      subject: 'Cambia tu contraseña de {app}',
      heading: 'Cambia tu contraseña',
      body: 'Pulsa el botón para elegir una contraseña nueva. El enlace caduca en una hora.',
      cta: 'Cambiar la contraseña',
      ignore: 'Si no has pedido cambiarla, ignora este mensaje: tu contraseña sigue igual.',
    },
    exists: {
      subject: 'Ya tienes una cuenta en {app}',
      heading: 'Ya tienes cuenta',
      body: 'Alguien ha intentado registrarse con este correo, pero ya tienes una cuenta en {app}. Entra con tu contraseña o, si no la recuerdas, elige una nueva con este botón. El enlace caduca en una hora.',
      cta: 'Elegir una contraseña nueva',
      ignore: 'Si no has sido tú, ignora este mensaje: tu cuenta sigue igual.',
    },
  },
  en: {
    confirm: {
      subject: 'Confirm your {app} account',
      heading: 'Almost there',
      body: 'Confirm your email to get into {app} and start discovering parties.',
      cta: 'Confirm my account',
      ignore: "If you didn't create a {app} account, ignore this message.",
    },
    recover: {
      subject: 'Change your {app} password',
      heading: 'Change your password',
      body: 'Tap the button to choose a new password. The link expires in one hour.',
      cta: 'Change password',
      ignore: "If you didn't ask for this, ignore it: your password has not changed.",
    },
    exists: {
      subject: 'You already have a {app} account',
      heading: 'You already have an account',
      body: "Someone tried to sign up with this email, but you already have a {app} account. Log in with your password or, if you don't remember it, choose a new one with this button. The link expires in one hour.",
      cta: 'Choose a new password',
      ignore: "If it wasn't you, ignore this message: your account is unchanged.",
    },
  },
  de: {
    confirm: {
      subject: 'Bestätige dein {app}-Konto',
      heading: 'Fast geschafft',
      body: 'Bestätige deine E-Mail, um {app} zu nutzen und Partys zu entdecken.',
      cta: 'Konto bestätigen',
      ignore: 'Wenn du kein {app}-Konto erstellt hast, ignoriere diese Nachricht.',
    },
    recover: {
      subject: 'Ändere dein {app}-Passwort',
      heading: 'Passwort ändern',
      body: 'Tippe auf den Button, um ein neues Passwort zu wählen. Der Link ist eine Stunde gültig.',
      cta: 'Passwort ändern',
      ignore: 'Wenn du das nicht angefordert hast, ignoriere diese Nachricht: Dein Passwort bleibt gleich.',
    },
    exists: {
      subject: 'Du hast bereits ein {app}-Konto',
      heading: 'Du hast schon ein Konto',
      body: 'Jemand wollte sich mit dieser E-Mail registrieren, aber du hast bereits ein {app}-Konto. Melde dich mit deinem Passwort an oder wähle mit diesem Button ein neues. Der Link ist eine Stunde gültig.',
      cta: 'Neues Passwort wählen',
      ignore: 'Wenn du das nicht warst, ignoriere diese Nachricht: Dein Konto bleibt unverändert.',
    },
  },
  ca: {
    confirm: {
      subject: 'Confirma el teu compte de {app}',
      heading: 'Ja gairebé hi ets',
      body: 'Confirma el teu correu per entrar a {app} i començar a descobrir festes.',
      cta: 'Confirmar el meu compte',
      ignore: "Si no has creat cap compte a {app}, ignora aquest missatge.",
    },
    recover: {
      subject: 'Canvia la contrasenya de {app}',
      heading: 'Canvia la contrasenya',
      body: "Prem el botó per triar una contrasenya nova. L'enllaç caduca en una hora.",
      cta: 'Canviar la contrasenya',
      ignore: "Si no ho has demanat, ignora aquest missatge: la contrasenya continua igual.",
    },
    exists: {
      subject: 'Ja tens un compte a {app}',
      heading: 'Ja tens compte',
      body: "Algú ha intentat registrar-se amb aquest correu, però ja tens un compte a {app}. Entra amb la teva contrasenya o, si no la recordes, tria'n una de nova amb aquest botó. L'enllaç caduca en una hora.",
      cta: 'Triar una contrasenya nova',
      ignore: "Si no has estat tu, ignora aquest missatge: el teu compte continua igual.",
    },
  },
};

const pickCopy = (locale: string | undefined, kind: Kind, app: string): Copy => {
  const copy = (COPY[(locale ?? 'es').slice(0, 2)] ?? COPY.es)[kind];
  const put = (text: string) => text.replaceAll('{app}', app);
  return {
    subject: put(copy.subject),
    heading: put(copy.heading),
    body: put(copy.body),
    cta: put(copy.cta),
    ignore: put(copy.ignore),
  };
};

/** Escapa lo que va dentro del HTML: el nombre lo escribe quien se registra. */
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/**
 * La plantilla del correo.
 *
 * Tablas y estilos en línea, que es lo único que entienden todos los clientes
 * de correo. El enlace aparece además en texto porque hay clientes que no
 * pintan el botón.
 */
const template = (copy: Copy, link: string, brand: Brand): { html: string; text: string } => {
  const safeLink = escapeHtml(link);

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${brand.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.bg};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${brand.card};border-radius:16px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="font-size:28px;font-weight:800;color:${brand.accent};padding-bottom:8px;">${escapeHtml(brand.name)}</td></tr>
        <tr><td style="font-size:20px;font-weight:700;color:#ffffff;padding-bottom:12px;">${escapeHtml(copy.heading)}</td></tr>
        <tr><td style="font-size:15px;line-height:1.55;color:#c8ccd6;padding-bottom:28px;">${escapeHtml(copy.body)}</td></tr>
        <tr><td align="center" style="padding-bottom:28px;">
          <a href="${safeLink}" style="display:inline-block;background:${brand.accent};color:${brand.onAccent};text-decoration:none;font-size:16px;font-weight:600;padding:14px 28px;border-radius:999px;">${escapeHtml(copy.cta)}</a>
        </td></tr>
        <tr><td style="font-size:12px;line-height:1.5;color:#8e93a3;padding-bottom:16px;word-break:break-all;">${safeLink}</td></tr>
        <tr><td style="font-size:12px;line-height:1.5;color:#8e93a3;border-top:1px solid ${brand.line};padding-top:16px;">${escapeHtml(copy.ignore)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `${copy.heading}\n\n${copy.body}\n\n${link}\n\n${copy.ignore}`;
  return { html, text };
};

// ============================================================================
// Freno
// ============================================================================

/**
 * Deja pasar o no según cuántas veces se haya intentado ya.
 *
 * Se cuenta por correo y por IP: por correo para no poder bombardear un buzón
 * ajeno, y por IP para no poder dar de alta cuentas en cadena. Si el contador
 * falla se deja pasar: un fallo de la base de datos no puede dejar a nadie sin
 * poder registrarse.
 */
const allowed = async (
  supabase: ReturnType<typeof adminClient>,
  email: string,
  ip: string | null,
): Promise<boolean> => {
  const checks: Promise<boolean>[] = [
    supabase
      .rpc('consume_anon_rate_limit', { p_key: `email:${email}`, p_max: 5, p_window_seconds: 3600 })
      .then(({ data, error }) => (error ? true : data !== false)),
  ];

  if (ip) {
    checks.push(
      supabase
        .rpc('consume_anon_rate_limit', { p_key: `ip:${ip}`, p_max: 20, p_window_seconds: 3600 })
        .then(({ data, error }) => (error ? true : data !== false)),
    );
  }

  return (await Promise.all(checks)).every(Boolean);
};

// ============================================================================

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  if (!isResendConfigured()) {
    console.error('auth-email: faltan RESEND_API_KEY o AUTH_FROM_EMAIL/SOS_FROM_EMAIL');
    return json({ error: 'EMAIL_NOT_CONFIGURED' }, 503);
  }

  const supabase = adminClient();

  try {
    const body = (await req.json()) as RequestBody;
    const email = (body.email ?? '').trim().toLowerCase();
    const action: Action = body.action ?? 'signup';

    const ipCheck =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('cf-connecting-ip');

    /** ¿Correo o móvil ya registrados? Lo pregunta el formulario de alta. */
    const disponibilidad = async (phone: string | undefined) => {
      const { data } = await supabase.rpc('signup_availability', { p_email: email, p_phone: phone ?? null });
      const row = (data as { email_taken: boolean; phone_taken: boolean }[] | null)?.[0];
      return { emailTaken: Boolean(row?.email_taken), phoneTaken: Boolean(row?.phone_taken) };
    };

    if (action === 'check') {
      // Límite por IP: responder si un correo existe no puede servir para
      // recorrerse una lista entera.
      if (ipCheck) {
        const { data: ok } = await supabase.rpc('consume_anon_rate_limit', {
          p_key: `check:${ipCheck}`,
          p_max: 60,
          p_window_seconds: 3600,
        });
        if (ok === false) return json({ error: 'TOO_MANY_REQUESTS' }, 429);
      }
      return json({ ok: true, ...(await disponibilidad(body.phone)) });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return json({ error: 'INVALID_EMAIL' }, 400);
    }

    if (action === 'signup' && (body.password ?? '').length < 8) {
      return json({ error: 'WEAK_PASSWORD' }, 400);
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('cf-connecting-ip');

    if (!(await allowed(supabase, email, ip))) {
      return json({ error: 'TOO_MANY_REQUESTS' }, 429);
    }

    // Alta con un correo o un móvil que ya tienen cuenta: se dice claramente y
    // el formulario lo marca en rojo. Antes se contestaba «revisa tu correo» y
    // llegaba un «ya tienes cuenta» que no se esperaba.
    if (action === 'signup') {
      const phone = typeof body.metadata?.phone === 'string' ? (body.metadata.phone as string) : undefined;
      const { emailTaken, phoneTaken } = await disponibilidad(phone);
      if (emailTaken) return json({ error: 'EMAIL_TAKEN' }, 409);
      if (phoneTaken) return json({ error: 'PHONE_TAKEN' }, 409);
    }

    // ------------------------------------------------------------------ enlace
    // `signup` crea la cuenta; `resend` la vuelve a enlazar sin duplicarla; y
    // `recover` sólo sirve para una cuenta que ya existe.
    // Ojo: el tipo de Supabase es `recovery`. Con `recover` generateLink()
    // devolvía «Invalid email action link type» y el correo nunca salía.
    const linkType = action === 'recover' ? 'recovery' : 'signup';

    // Cada tipo aterriza donde toca: confirmar lleva a la pantalla de
    // verificación y recuperar a la de elegir contraseña nueva.
    const brand = pickBrand(body.brand);
    const resetUrl = `${brand.appUrl}/auth/reset-password`;
    const redirectTo = linkType === 'recovery' ? resetUrl : `${brand.appUrl}/auth/verify-email`;

    /** Manda un correo con el enlace; devuelve la respuesta de error o null. */
    const send = async (kind: Kind, link: string): Promise<Response | null> => {
      const copy = pickCopy(body.locale, kind, brand.name);
      const { html, text } = template(copy, link, brand);
      try {
        await sendEmail({ to: email, subject: copy.subject, html, text });
        return null;
      } catch (sendError) {
        if (sendError instanceof ResendNotConfiguredError) {
          return json({ error: 'EMAIL_NOT_CONFIGURED' }, 503);
        }
        if (sendError instanceof ResendSendError) {
          console.error('Resend', sendError.status, sendError.message);
          return json({ error: 'EMAIL_SEND_FAILED', created: kind === 'confirm' }, 502);
        }
        throw sendError;
      }
    };

    const { data, error } = await supabase.auth.admin.generateLink({
      type: linkType,
      email,
      ...(linkType === 'signup' ? { password: body.password ?? '' } : {}),
      options: {
        redirectTo,
        ...(linkType === 'signup' ? { data: body.metadata ?? {} } : {}),
      },
    } as Parameters<typeof supabase.auth.admin.generateLink>[0]);

    if (error) {
      const message = error.message ?? '';

      // Que la cuenta ya exista no se le cuenta a quien pregunta: sería una
      // forma de averiguar quién está registrado en una app de ligar. Pero sí
      // se le escribe a ese correo: «ya tienes cuenta» con un enlace para
      // cambiar la contraseña. Antes no le llegaba nada y parecía que el
      // correo de verificación no funcionaba.
      if (/already registered|already been registered|already exists/i.test(message)) {
        const { data: recovery } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: resetUrl },
        });
        const recoveryLink = recovery?.properties?.action_link;
        if (recoveryLink) {
          const failed = await send('exists', recoveryLink);
          if (failed) return failed;
        }
        return json({ ok: true, alreadyRegistered: true });
      }

      // Pedir el cambio de contraseña de un correo que no existe tampoco se
      // delata: se responde igual que si se hubiera mandado.
      if (linkType === 'recovery' && /not found|no user/i.test(message)) {
        return json({ ok: true });
      }
      if (/rate limit/i.test(message)) return json({ error: 'TOO_MANY_REQUESTS' }, 429);

      console.error('generateLink:', message);
      return json({ error: 'SIGNUP_FAILED' }, 400);
    }

    const link = data.properties?.action_link;
    const userId = data.user?.id ?? null;
    if (!link) {
      console.error('generateLink no devolvió enlace');
      return json({ error: 'SIGNUP_FAILED' }, 500);
    }

    // ------------------------------------------------- documentos del local
    // Se firman URLs de subida en lugar de recibir los ficheros: la petición
    // tiene un tope de tamaño muy por debajo de 10 MB por documento.
    const uploads: { name: string; path: string; token: string }[] = [];

    if (action === 'signup' && userId && Array.isArray(body.documents)) {
      const wanted = body.documents.slice(0, MAX_DOCUMENTS).filter(
        (d) => typeof d.name === 'string' && d.name.length > 0 && d.size <= MAX_DOCUMENT_BYTES,
      );

      for (const [index, document] of wanted.entries()) {
        // La primera carpeta tiene que ser el uid: lo exigen las policies del
        // bucket, y así un local no puede escribir en la carpeta de otro.
        const safeName = document.name.replace(/[^\w.-]/g, '_').slice(-80);
        const path = `${userId}/${Date.now()}-${index}-${safeName}`;

        const { data: signed, error: signError } = await supabase.storage
          .from('documents')
          .createSignedUploadUrl(path);

        if (signError || !signed) {
          console.error('createSignedUploadUrl:', signError?.message);
          continue;
        }

        uploads.push({ name: document.name, path, token: signed.token });
      }

      if (uploads.length > 0) {
        await supabase
          .from('venues')
          .update({ documents: uploads.map((u) => u.path) })
          .eq('venue_id', userId);
      }
    }

    // -------------------------------------------------------------- el correo
    // Si falla con la cuenta ya creada, `created` permite ofrecer el reenvío en
    // vez de dejar a alguien pensando que no se ha registrado.
    const failed = await send(linkType === 'recovery' ? 'recover' : 'confirm', link);
    if (failed) return failed;

    return json({ ok: true, uploads });
  } catch (error) {
    console.error('auth-email:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
