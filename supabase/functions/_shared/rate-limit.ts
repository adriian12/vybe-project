import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { json } from './cors.ts';

/**
 * Límite de peticiones de las Edge Functions, por usuario o por IP
 * (migración 092). Cuenta en `auth_throttle` con `consume_anon_rate_limit`.
 *
 * Con sesión se cuenta por usuario, no por IP: en una discoteca o con datos
 * móviles cientos de personas comparten IP. Sin sesión, por IP.
 *
 * Nunca bloquea por un fallo propio: si el contador no responde, la petición
 * pasa.
 */

export const clientIp = (req: Request): string | null =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || null;

/**
 * `true` si quien llama se ha pasado del límite.
 * @param max peticiones permitidas en la ventana
 * @param windowSeconds duración de la ventana (60 por defecto)
 */
export const overLimit = async (
  supabase: SupabaseClient,
  req: Request,
  name: string,
  max: number,
  opts: { userId?: string | null; windowSeconds?: number } = {},
): Promise<boolean> => {
  const ip = clientIp(req);
  const quien = opts.userId ? `u:${opts.userId}` : ip ? `ip:${ip}` : null;
  if (!quien) return false;
  const { data, error } = await supabase.rpc('consume_anon_rate_limit', {
    p_key: `fn:${name}:${quien}`,
    p_max: max,
    p_window_seconds: opts.windowSeconds ?? 60,
  });
  return !error && data === false;
};

export const tooManyRequests = () => json({ error: 'TOO_MANY_REQUESTS' }, 429);
