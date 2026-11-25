import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { overLimit, tooManyRequests } from '../_shared/rate-limit.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';
import { borrarCuenta } from '../_shared/borrar-cuenta.ts';

/**
 * Borrado duro de la cuenta (art. 17 RGPD).
 *
 * `request_account_deletion()` oculta el perfil de inmediato; aquí se completa
 * lo que necesita service role: los ficheros de Storage y el usuario de auth.
 * Al eliminar auth.users, las tablas con ON DELETE CASCADE se limpian solas.
 */

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'No autenticado' }, 401);
    if (await overLimit(supabase, req, 'delete-account', 5, { userId: user.id })) return tooManyRequests();

    let body: { appleConfirmed?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // Sin cuerpo.
    }

    const r = await borrarCuenta(supabase, user.id, { appleConfirmed: body.appleConfirmed });
    if (!r.ok) return json({ error: r.error }, r.status);
    return json({ deleted: true, files: r.files });
  } catch (error) {
    console.error('Account deletion error:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
