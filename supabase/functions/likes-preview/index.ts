import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getProfileId, getUser } from '../_shared/supabase.ts';

/**
 * «Le gustas» para quien no es premium.
 *
 * Se enseña cuánta gente te ha dado like, con una miniatura pixelada de cada
 * persona y sin nombre ni id. La miniatura se hace aquí, en el servidor: si se
 * mandara la foto real y se pixelara en la pantalla, cualquiera la sacaría de
 * la red con un inspector y el premium no serviría de nada.
 *
 * Quien es premium no pasa por aquí: usa `get_likes_received()`.
 */

/** 10 × 12 píxeles: se adivina un color y una silueta, no una cara. */
const ANCHO = 10;
const ALTO = 12;

const miniatura = async (url: string | null): Promise<string | null> => {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const image = await Image.decode(new Uint8Array(await response.arrayBuffer()));
    const tiny = image.cover(ANCHO, ALTO);
    const png = await tiny.encode();
    let binary = '';
    for (const byte of png) binary += String.fromCharCode(byte);
    return `data:image/png;base64,${btoa(binary)}`;
  } catch (error) {
    console.error('likes-preview miniatura:', error);
    return null;
  }
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'No autenticado' }, 401);

    const profileId = await getProfileId(supabase, user.id);
    if (!profileId) return json({ likes: [] });

    const { data: premium } = await supabase.rpc('is_premium', { p_profile_id: profileId });
    if (premium === true) return json({ premium: true, likes: [] });

    const { data, error } = await supabase.rpc('likes_for_preview', { p_profile_id: profileId });
    if (error) {
      console.error('likes_for_preview:', error.message);
      return json({ likes: [] });
    }

    const rows = (data ?? []) as {
      profile_id: string | null;
      name: string | null;
      age: number | null;
      photo_url: string | null;
      swipe_type: string;
      event_name: string | null;
      liked_at: string;
    }[];

    // El super like se ve tal cual: quien lo manda quiere que se sepa. Los
    // demás, pixelados y sin nombre ni id.
    const likes = await Promise.all(
      rows.map(async (row, index) => {
        const superLike = row.swipe_type === 'super_like';
        return {
          key: `${index}-${row.liked_at}`,
          profileId: superLike ? row.profile_id : null,
          name: superLike ? row.name : null,
          age: superLike ? row.age : null,
          photo: superLike ? row.photo_url : null,
          preview: superLike ? null : await miniatura(row.photo_url),
          swipeType: row.swipe_type,
          eventName: row.event_name,
          likedAt: row.liked_at,
        };
      }),
    );

    return json({ premium: false, likes });
  } catch (error) {
    console.error('likes-preview:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
