import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

/** Cliente con service role: salta RLS. Nunca lo expongas al navegador. */
export const adminClient = (): SupabaseClient =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

/**
 * Cliente con la sesión de quien llama: las funciones SQL ven su `auth.uid()`
 * y deciden ellas los permisos, como desde la app.
 */
export const userClient = (req: Request): SupabaseClient =>
  createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

export interface AuthedUser {
  id: string;
  email?: string;
}

/**
 * Resuelve el usuario a partir del encabezado Authorization.
 *
 * Todas las funciones que tocan datos personales lo exigen: la de SMS estaba
 * abierta y cualquiera podía usarla.
 */
export const getUser = async (
  req: Request,
  supabase: SupabaseClient,
): Promise<AuthedUser | null> => {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(header.replace('Bearer ', ''));

  if (error || !user) return null;
  return { id: user.id, email: user.email ?? undefined };
};

/** Id del perfil del usuario autenticado. */
export const getProfileId = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> => {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.id ?? null;
};
