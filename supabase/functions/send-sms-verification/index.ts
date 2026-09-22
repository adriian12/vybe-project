import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';
import { sendSms, TwilioNotConfiguredError, TwilioSendError } from '../_shared/twilio.ts';

/**
 * Envía un código de verificación por SMS.
 *
 * La versión original era una simulación: aceptaba un `code` enviado por el
 * cliente, lo escribía en la consola y devolvía `success: true` sin mandar
 * nada. Además estaba abierta sin autenticación, así que cualquiera podía
 * usarla para bombardear números.
 *
 * Ahora:
 *   - Exige un JWT válido; el número se asocia al usuario autenticado.
 *   - El código lo genera el servidor y se guarda en `verification_codes`,
 *     que es lo que comprueba api.verifyPhoneCode().
 *   - Límite de envíos por usuario y hora.
 *   - Si faltan credenciales de Twilio devuelve 503 en lugar de fingir éxito.
 */

const CODE_TTL_MINUTES = 10;
const MAX_CODES_PER_HOUR = 5;

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'No autenticado' }, 401);

    const { phoneNumber } = (await req.json()) as { phoneNumber?: string };
    if (!phoneNumber || !/^\+?[0-9]{9,15}$/.test(phoneNumber)) {
      return json({ error: 'Número de teléfono no válido' }, 400);
    }

    // Límite de envíos por usuario y hora.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('verification_codes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gt('created_at', oneHourAgo);

    if ((count ?? 0) >= MAX_CODES_PER_HOUR) {
      return json({ error: 'Demasiados intentos. Prueba dentro de un rato.' }, 429);
    }

    // El código lo decide el servidor: nunca se acepta el del cliente.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from('verification_codes').insert({
      user_id: user.id,
      user_type: 'user',
      code,
      expires_at: expiresAt,
      verified: false,
    });

    if (insertError) {
      console.error('Error storing verification code:', insertError);
      return json({ error: 'No se pudo generar el código' }, 500);
    }

    await sendSms(
      phoneNumber,
      `Tu código de verificación de Vybes es ${code}. Caduca en ${CODE_TTL_MINUTES} minutos.`,
    );

    // Guardamos el teléfono, todavía sin verificar.
    await supabase.from('profiles').update({ phone: phoneNumber }).eq('user_id', user.id);

    return json({ success: true, expiresAt });
  } catch (error) {
    if (error instanceof TwilioNotConfiguredError) {
      return json(
        { error: 'El envío de SMS no está configurado. Faltan las credenciales de Twilio.' },
        503,
      );
    }
    if (error instanceof TwilioSendError) {
      return json({ error: 'No se pudo enviar el SMS. Revisa el número.' }, 502);
    }

    console.error('Unexpected error:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
