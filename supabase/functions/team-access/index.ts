import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';

/**
 * Enlaces del equipo, sin cuenta (migración 072): Seguridad y Camareros para
 * una noche, RRPP fijo hasta que el local lo revoque.
 *
 * La página `/equipo/<token>` llama aquí; la función se despliega sin JWT y la
 * protección va dentro, igual que `door-counter`:
 *
 *   - El token son 144 bits aleatorios; se busca por su SHA-256.
 *   - `team_link_action()` comprueba que el enlace siga vivo, decide qué
 *     acciones tiene cada papel y las ata al evento y al local del enlace.
 *   - Aquí, además, un tope de peticiones por enlace.
 */

const ACTIONS = new Set([
  'state',
  'sos',
  'sos_ack',
  'sos_resolve',
  'occupancy',
  'count',
  'guests',
  'admit',
  'ticket',
  'entry',
  'reports',
  'revoke',
  'voucher',
  'offers',
  'events',
  'event',
  'save_entry',
  'delete_entry',
]);

/** Errores de la base de datos que se le cuentan a la página tal cual. */
const KNOWN = [
  'INVALID_LINK',
  'INVALID_ACTION',
  'NOT_AUTHORIZED',
  'INVALID_DELTA',
  'INVALID_TOTAL',
  'CAPACITY_REQUIRED',
  'EVENT_NOT_LIVE',
  'EVENT_NOT_FOUND',
  'ENTRY_NOT_FOUND',
  'ENTRY_LOCKED',
  'ALERT_NOT_FOUND',
  'TICKET_NOT_FOUND',
  'TICKET_REFUNDED',
  'GUEST_LIST_CLOSED',
  'NAME_REQUIRED',
  'INVALID_COMPANIONS',
];

/** Una página de seguridad refresca varias tarjetas cada pocos segundos. */
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, number[]>();

const tooMany = (key: string): boolean => {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  if (hits.size > 2_000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }

  return recent.length > MAX_PER_WINDOW;
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_BODY' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const action = typeof body.action === 'string' ? body.action : '';
  const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args) ? body.args : {};

  if (token.length < 16 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return json({ error: 'INVALID_LINK' }, 401);
  }
  if (!ACTIONS.has(action)) return json({ error: 'INVALID_ACTION' }, 400);
  if (JSON.stringify(args).length > 2_000) return json({ error: 'INVALID_BODY' }, 400);

  const tokenHash = await sha256(token);
  if (tooMany(tokenHash)) return json({ error: 'TOO_MANY_REQUESTS' }, 429);

  const { data, error } = await adminClient().rpc('team_link_action', {
    p_token_hash: tokenHash,
    p_action: action,
    p_args: args,
  });

  if (error) {
    const code = KNOWN.find((k) => error.message?.includes(k));
    if (code === 'INVALID_LINK') return json({ error: code }, 401);
    if (code) return json({ error: code }, 400);
    // Un uuid o un número mal formado en los argumentos.
    if (error.code === '22P02') return json({ error: 'INVALID_BODY' }, 400);
    console.error('team-access:', error);
    return json({ error: 'INTERNAL' }, 500);
  }

  return json({ data });
});
