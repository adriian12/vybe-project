import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';

/**
 * Denegar el alta de un negocio: se borra entero.
 *
 * Antes «Denegar» sólo lo marcaba como rechazado y el correo, el teléfono y el
 * NIF se quedaban ocupados: quien se equivocó al darse de alta no podía volver
 * a intentarlo. Si no se aprueba, el negocio no ha llegado a existir:
 *   - se borran sus ficheros (logo y documentos) y la fila de `venues`;
 *   - y su cuenta de acceso, si sólo era del negocio (sin perfil de fiester@
 *     ni otros negocios). Si la persona usa también la app, se le deja la
 *     cuenta y sólo se va el negocio.
 * Sólo para negocios sin aprobar: uno aprobado se gestiona desde su ficha.
 */

const PAGINA = 100;

const vaciarCarpeta = async (supabase: ReturnType<typeof adminClient>, bucket: string, carpeta: string) => {
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(carpeta, { limit: PAGINA });
    if (error || !data || data.length === 0) return;
    const { error: borrar } = await supabase.storage.from(bucket).remove(data.map((f) => `${carpeta}/${f.name}`));
    if (borrar || data.length < PAGINA) return;
  }
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const supabase = adminClient();

  try {
    const caller = await getUser(req, supabase);
    if (!caller) return json({ error: 'NOT_AUTHENTICATED' }, 401);
    const { data: perfil } = await supabase.from('profiles').select('role').eq('user_id', caller.id).maybeSingle();
    if (perfil?.role !== 'admin') return json({ error: 'NOT_AUTHORIZED' }, 403);

    const { venueId } = (await req.json().catch(() => ({}))) as { venueId?: string };
    if (!venueId) return json({ error: 'VENUE_REQUIRED' }, 400);

    const { data: venue } = await supabase
      .from('venues')
      .select('id, venue_id, is_verified, verification_status, is_platform')
      .eq('id', venueId)
      .maybeSingle();
    if (!venue) return json({ error: 'VENUE_NOT_FOUND' }, 404);
    if (venue.is_platform || venue.is_verified || venue.verification_status === 'approved') {
      return json({ error: 'ALREADY_APPROVED' }, 409);
    }

    const duenio = venue.venue_id as string | null;

    // ¿La cuenta es sólo de este negocio?
    let borrarCuenta = false;
    if (duenio) {
      const [{ data: fiester }, { count: otros }] = await Promise.all([
        supabase.from('profiles').select('id, staff_only').eq('user_id', duenio).maybeSingle(),
        supabase.from('venues').select('id', { count: 'exact', head: true }).eq('venue_id', duenio).neq('id', venue.id),
      ]);
      borrarCuenta = (!fiester || fiester.staff_only === true) && (otros ?? 0) === 0;
    }

    await vaciarCarpeta(supabase, 'venue-logos', venue.id);
    if (duenio && borrarCuenta) await vaciarCarpeta(supabase, 'documents', duenio);

    const { error: borrarVenue } = await supabase.from('venues').delete().eq('id', venue.id);
    if (borrarVenue) {
      console.error('admin-reject-venue venue:', borrarVenue);
      return json({ error: 'DELETE_FAILED' }, 500);
    }

    if (duenio && borrarCuenta) {
      const { error } = await supabase.auth.admin.deleteUser(duenio);
      if (error) {
        console.error('admin-reject-venue user:', error);
        return json({ deleted: true, accountDeleted: false });
      }
    }

    return json({ deleted: true, accountDeleted: borrarCuenta });
  } catch (error) {
    console.error('admin-reject-venue:', error);
    return json({ error: 'INTERNAL' }, 500);
  }
});
