import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';

/**
 * Contador de puerta con enlace, sin cuenta.
 *
 * El local crea desde su panel un enlace para la noche (`create_counter_link`)
 * y se lo pasa al portero, que cuenta desde cualquier móvil en `/contador/<token>`.
 * El portero no tiene cuenta en Vybe, así que esta función se despliega sin JWT
 * y la protección va dentro:
 *
 *   - El token son 144 bits aleatorios; en la base de datos sólo está su SHA-256.
 *   - El enlace caduca dos horas después del cierre y se puede revocar.
 *   - La base de datos limita cada cambio (±20 de golpe, total entre 0 y el
 *     doble del aforo) y sólo deja contar con el evento en marcha.
 *   - Aquí, además, un tope de peticiones por enlace.
 *
 * Acciones: `state` (lee), `adjust` (`delta`) y `set` (`total`).
 */

type Action = 'state' | 'adjust' | 'set';

/** Errores de `counter_link_apply` que se le cuentan al contador tal cual. */
const KNOWN = ['INVALID_LINK', 'INVALID_DELTA', 'INVALID_TOTAL', 'CAPACITY_REQUIRED', 'EVENT_NOT_LIVE'];

/**
 * Tope de peticiones por enlace. El contador agrupa las pulsaciones y manda como
 * mucho una por segundo, así que 30 por cada 10 s sobra para dos porteros con el
 * mismo enlace. Vive en la memoria de la instancia: frena un abuso, no es una
 * garantía, y la base de datos pone sus propios límites.
 */
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

const tooMany = (key: string): boolean => {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  // Que el mapa no crezca sin fin con enlaces viejos.
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

const asInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

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
  const action = body.action as Action;

  // Los tokens se generan con 24 caracteres; algo muy distinto no es un enlace.
  if (token.length < 16 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return json({ error: 'INVALID_LINK' }, 401);
  }
  if (!['state', 'adjust', 'set'].includes(action)) {
    return json({ error: 'INVALID_ACTION' }, 400);
  }

  const tokenHash = await sha256(token);
  if (tooMany(tokenHash)) return json({ error: 'TOO_MANY_REQUESTS' }, 429);

  const delta = action === 'adjust' ? asInt(body.delta) : null;
  const total = action === 'set' ? asInt(body.total) : null;
  if (action === 'adjust' && delta === null) return json({ error: 'INVALID_DELTA' }, 400);
  if (action === 'set' && total === null) return json({ error: 'INVALID_TOTAL' }, 400);

  const { data, error } = await adminClient().rpc('counter_link_apply', {
    p_token_hash: tokenHash,
    p_delta: delta,
    p_total: total,
  });

  if (error) {
    const code = KNOWN.find((k) => error.message?.includes(k));
    if (code === 'INVALID_LINK') return json({ error: code }, 401);
    if (code) return json({ error: code }, 400);
    console.error('door-counter:', error);
    return json({ error: 'INTERNAL' }, 500);
  }

  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) return json({ error: 'INVALID_LINK' }, 401);

  return json({
    eventName: row.event_name,
    venueName: row.venue_name,
    total: row.total,
    capacity: row.capacity,
    inside: Number(row.inside),
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  });
});
