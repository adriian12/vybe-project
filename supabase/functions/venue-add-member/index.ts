import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';

/**
 * Añade a alguien al equipo de un local a partir de su email.
 *
 * Hace falta service role para buscar en auth.users; el cliente no puede
 * (ni debe) consultar esa tabla. La persona tiene que tener ya una cuenta:
 * no creamos usuarios aquí para no abrir una vía de alta sin verificación.
 */

type VenueRole = 'owner' | 'security';
const ROLES: VenueRole[] = ['owner', 'security'];

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'No autenticado' }, 401);

    const { venueId, email, role } = (await req.json()) as {
      venueId?: string;
      email?: string;
      role?: VenueRole;
    };

    if (!venueId || !email || !role || !ROLES.includes(role)) {
      return json({ error: 'Parámetros no válidos' }, 400);
    }

    // Sólo el propietario gestiona el equipo.
    const { data: venue } = await supabase
      .from('venues')
      .select('id, venue_id')
      .eq('id', venueId)
      .maybeSingle();

    const { data: membership } = await supabase
      .from('venue_members')
      .select('role')
      .eq('venue_id', venueId)
      .eq('user_id', user.id)
      .maybeSingle();

    const isOwner = venue?.venue_id === user.id || membership?.role === 'owner';
    if (!isOwner) return json({ error: 'NOT_AUTHORIZED' }, 403);

    // Buscamos la cuenta por email. listUsers pagina; con el filtro basta una.
    const normalised = email.trim().toLowerCase();
    const { data: list, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    if (listError) {
      console.error('Error listing users:', listError);
      return json({ error: 'LOOKUP_FAILED' }, 500);
    }

    const target = list.users.find((u) => u.email?.toLowerCase() === normalised);
    if (!target) return json({ error: 'USER_NOT_FOUND' }, 404);

    const { error } = await supabase.from('venue_members').upsert(
      { venue_id: venueId, user_id: target.id, email: target.email, role },
      { onConflict: 'venue_id,user_id' },
    );

    if (error) {
      console.error('Error adding member:', error);
      return json({ error: 'ADD_FAILED' }, 500);
    }

    return json({ added: true });
  } catch (error) {
    console.error('Add member error:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
