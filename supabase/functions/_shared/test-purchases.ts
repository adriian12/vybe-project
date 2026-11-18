import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

/**
 * ¿Puede esta cuenta activar algo con una compra de prueba (sandbox de Apple,
 * licencia de prueba de Google)?
 *
 * Con la app publicada, las compras de prueba no deben dar Premium a nadie:
 * se compran gratis. Pero el revisor de Apple compra en sandbox en cada
 * actualización, y si su compra falla rechaza la versión. Así que sólo valen
 * para los administradores y para las cuentas de revisión: por defecto
 * `revision.apple@fiestea.es`, o las de `TEST_PURCHASE_EMAILS` (separadas por
 * comas). `APPLE_ALLOW_SANDBOX` y `GOOGLE_ALLOW_TEST` siguen abriéndolas a
 * todo el mundo, pero ya no hacen falta y no deben estar puestas.
 */
const CUENTAS_DE_PRUEBA = (Deno.env.get('TEST_PURCHASE_EMAILS') ?? 'revision.apple@fiestea.es')
  .split(',')
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

export const testPurchaseAllowed = async (supabase: SupabaseClient, profileId: string): Promise<boolean> => {
  const { data } = await supabase.from('profiles').select('role, email').eq('id', profileId).maybeSingle();
  const perfil = data as { role?: string | null; email?: string | null } | null;
  if (!perfil) return false;
  return perfil.role === 'admin' || CUENTAS_DE_PRUEBA.includes((perfil.email ?? '').toLowerCase());
};
