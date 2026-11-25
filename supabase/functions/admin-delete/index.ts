import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { overLimit, tooManyRequests } from '../_shared/rate-limit.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';
import { borrarCuenta, purgeBucket } from '../_shared/borrar-cuenta.ts';

/**
 * Administración borra un negocio o una cuenta.
 *
 * - `{ type: 'venue', id: venues.id, withOwner }`: borra el local con sus
 *   fiestas, logo y todo lo que cuelga de él (ON DELETE CASCADE). Con
 *   `withOwner`, también la cuenta de quien lo dio de alta.
 * - `{ type: 'user', id: profiles.id }`: borra la cuenta como si la persona
 *   la borrase desde la app (Premium cancelado, ficheros, auth), y con ella
 *   sus locales.
 *
 * Nunca se borra:
 * - un local con entradas cobradas: los pedidos son contabilidad y se irían
 *   en cascada (`VENUE_HAS_SALES`);
 * - el local de la casa (`HOUSE_VENUE`);
 * - administración, la propia cuenta, `sistema@` ni las cuentas de revisión
 *   de las tiendas (`PROTECTED_ACCOUNT`).
 *
 * Quien llama tiene que ser administración: se comprueba con su sesión contra
 * `profiles.role`, no con lo que diga el cuerpo.
 */

const PROTEGIDAS = ['sistema@fiestea.es', 'revision.apple@fiestea.es', 'revision.negocio@fiestea.es'];

type Cliente = ReturnType<typeof adminClient>;

/** Pedidos con dinero de por medio en estos locales. */
const ventasCobradas = async (supabase: Cliente, venueIds: string[]): Promise<number> => {
  if (venueIds.length === 0) return 0;
  const { count, error } = await supabase
    .from('ticket_orders')
    .select('id', { count: 'exact', head: true })
    .in('venue_id', venueIds)
    .not('paid_at', 'is', null)
    .gt('amount_cents', 0);
  if (error) throw error;
  return count ?? 0;
};

/** ¿Se puede borrar esta cuenta? Devuelve el código del motivo si no. */
const cuentaProtegida = async (supabase: Cliente, userId: string, callerId: string): Promise<string | null> => {
  if (userId === callerId) return 'PROTECTED_ACCOUNT';
  const { data: perfil } = await supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle();
  if (perfil?.role === 'admin') return 'PROTECTED_ACCOUNT';
  const { data } = await supabase.auth.admin.getUserById(userId);
  if (PROTEGIDAS.includes((data?.user?.email ?? '').toLowerCase())) return 'PROTECTED_ACCOUNT';
  return null;
};

/** Los locales de una cuenta, comprobando que se pueden borrar con ella. */
const localesDe = async (supabase: Cliente, userId: string): Promise<{ ids: string[]; error?: string }> => {
  const { data } = await supabase.from('venues').select('id, is_platform').eq('venue_id', userId);
  const locales = data ?? [];
  if (locales.some((v) => v.is_platform)) return { ids: [], error: 'HOUSE_VENUE' };
  const ids = locales.map((v) => v.id as string);
  if ((await ventasCobradas(supabase, ids)) > 0) return { ids, error: 'VENUE_HAS_SALES' };
  return { ids };
};

const borrarLogos = async (supabase: Cliente, venueIds: string[]) => {
  for (const id of venueIds) await purgeBucket(supabase, 'venue-logos', id);
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  try {
    const caller = await getUser(req, supabase);
    if (!caller) return json({ error: 'NOT_AUTHENTICATED' }, 401);

    const { data: yo } = await supabase.from('profiles').select('role').eq('user_id', caller.id).maybeSingle();
    if (yo?.role !== 'admin') return json({ error: 'NOT_AUTHORIZED' }, 403);
    if (await overLimit(supabase, req, 'admin-delete', 30, { userId: caller.id })) return tooManyRequests();

    const { type, id, withOwner } = (await req.json()) as { type?: string; id?: string; withOwner?: boolean };
    if (!id || (type !== 'venue' && type !== 'user')) return json({ error: 'BAD_REQUEST' }, 400);

    if (type === 'venue') {
      const { data: local } = await supabase.from('venues').select('id, venue_id, is_platform').eq('id', id).maybeSingle();
      if (!local) return json({ error: 'NOT_FOUND' }, 404);
      if (local.is_platform) return json({ error: 'HOUSE_VENUE' }, 409);
      if ((await ventasCobradas(supabase, [local.id])) > 0) return json({ error: 'VENUE_HAS_SALES' }, 409);

      const dueno = local.venue_id as string | null;
      if (withOwner && dueno) {
        const motivo = await cuentaProtegida(supabase, dueno, caller.id);
        if (motivo) return json({ error: motivo }, 409);
        // Con la cuenta se van todos sus locales: tienen que poder borrarse.
        const suyos = await localesDe(supabase, dueno);
        if (suyos.error) return json({ error: suyos.error }, 409);

        await borrarLogos(supabase, suyos.ids);
        const r = await borrarCuenta(supabase, dueno, { bucketsExtra: ['event-posters'] });
        if (!r.ok) return json({ error: r.error }, r.status);
        return json({ deleted: true, owner: true });
      }

      await borrarLogos(supabase, [local.id]);
      const { error } = await supabase.from('venues').delete().eq('id', local.id);
      if (error) {
        console.error('admin-delete venue:', error);
        return json({ error: 'DELETE_FAILED' }, 500);
      }
      return json({ deleted: true, owner: false });
    }

    // Cuenta
    const { data: perfil } = await supabase.from('profiles').select('user_id').eq('id', id).maybeSingle();
    const userId = perfil?.user_id as string | undefined;
    if (!userId) return json({ error: 'NOT_FOUND' }, 404);

    const motivo = await cuentaProtegida(supabase, userId, caller.id);
    if (motivo) return json({ error: motivo }, 409);
    const suyos = await localesDe(supabase, userId);
    if (suyos.error) return json({ error: suyos.error }, 409);

    await borrarLogos(supabase, suyos.ids);
    const r = await borrarCuenta(supabase, userId, {
      bucketsExtra: suyos.ids.length > 0 ? ['event-posters'] : [],
    });
    if (!r.ok) return json({ error: r.error }, r.status);
    return json({ deleted: true, venues: suyos.ids.length });
  } catch (error) {
    console.error('admin-delete error:', error);
    return json({ error: 'INTERNAL' }, 500);
  }
});
