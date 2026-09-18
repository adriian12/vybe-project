import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';

/**
 * Buscador de canciones para «Vota la próxima canción».
 *
 * Escribir el título a mano da diez versiones de la misma canción («despacito»,
 * «Despacito - Luis Fonsi», «despasito»…) y los votos se reparten. Con un
 * buscador todos eligen la misma ficha y los votos se suman.
 *
 * Se usa el buscador público de Deezer: no pide clave ni cuenta y su catálogo
 * cubre lo que suena en una discoteca. Pasa por aquí y no desde el navegador
 * porque Deezer no permite peticiones directas desde otra web (CORS). Exige
 * sesión (JWT): sólo lo usa quien está dentro de un evento.
 */

interface DeezerTrack {
  id: number;
  title: string;
  artist?: { name?: string };
  album?: { cover_small?: string; cover_medium?: string };
}

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  let query = '';
  try {
    const body = (await req.json()) as { q?: unknown };
    query = typeof body.q === 'string' ? body.q.trim().slice(0, 80) : '';
  } catch {
    return json({ error: 'INVALID_BODY' }, 400);
  }

  if (query.length < 2) return json({ results: [] });

  try {
    const response = await fetch(
      `https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=8`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return json({ results: [] });

    const data = (await response.json()) as { data?: DeezerTrack[] };
    const results = (data.data ?? []).map((track) => ({
      deezerId: track.id,
      title: track.title,
      artist: track.artist?.name ?? null,
      cover: track.album?.cover_small ?? track.album?.cover_medium ?? null,
    }));

    return json({ results });
  } catch (error) {
    // Si Deezer no responde, la persona puede escribir el título a mano.
    console.error('song-search:', error);
    return json({ results: [] });
  }
});
