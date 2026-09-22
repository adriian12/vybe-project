import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';

/**
 * Moderación automática de fotos.
 *
 * Antes cualquiera publicaba al instante en un bucket público. Ahora cada foto
 * entra en `moderation_queue` y esta función decide:
 *
 *   - `approved`: la publica en el perfil llamando a review_photo().
 *   - `rejected`: la deja marcada y el cliente borra el fichero.
 *   - `unavailable`: el proveedor no responde o no está configurado. La foto
 *     NO se publica: se queda pendiente (`reason = 'unavailable'`) para
 *     revisión manual, un disparador avisa a los admins, y el cliente lo dice
 *     al momento y deja repetirla.
 *
 * Proveedor soportado: Sightengine (nudity, weapons, offensive).
 * Variables: SIGHTENGINE_USER, SIGHTENGINE_SECRET, MODERATION_THRESHOLD.
 */

const DEFAULT_THRESHOLD = 0.6;

interface SightengineResponse {
  status: string;
  nudity?: { sexual_activity?: number; sexual_display?: number; erotica?: number };
  weapon?: number;
  offensive?: { prob?: number };
  gore?: { prob?: number };
  faces?: unknown[];
}

/**
 * Además de lo prohibido, se comprueba que haya una cara.
 *
 * En una app donde te reconocen dentro del local, una foto de la pared o del
 * techo no sirve de nada, y revisar a mano todas las que llegan no es viable.
 * Con el modelo de rostros se rechaza en el momento y se le pide otra, y a la
 * cola manual sólo llegan los casos dudosos.
 */
const scorePhoto = async (
  url: string,
): Promise<{ score: number; reason: string | null; faces: number } | null> => {
  const user = Deno.env.get('SIGHTENGINE_USER');
  const secret = Deno.env.get('SIGHTENGINE_SECRET');
  if (!user || !secret) return null;

  const params = new URLSearchParams({
    url,
    models: 'nudity-2.1,weapon,offensive,gore,face-attributes',
    api_user: user,
    api_secret: secret,
  });

  const response = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`);
  if (!response.ok) throw new Error(`Sightengine ${response.status}`);

  const result = (await response.json()) as SightengineResponse;
  if (result.status !== 'success') throw new Error('Sightengine status not success');

  const checks: [string, number][] = [
    ['nudity', Math.max(
      result.nudity?.sexual_activity ?? 0,
      result.nudity?.sexual_display ?? 0,
      result.nudity?.erotica ?? 0,
    )],
    ['weapon', result.weapon ?? 0],
    ['offensive', result.offensive?.prob ?? 0],
    ['gore', result.gore?.prob ?? 0],
  ];

  const [reason, score] = checks.reduce((worst, current) =>
    current[1] > worst[1] ? current : worst,
  );

  return { score, reason, faces: Array.isArray(result.faces) ? result.faces.length : 0 };
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();
  let itemId: string | undefined;

  /** Sin revisión automática no se publica nada: queda para revisión manual. */
  const unavailable = async () => {
    if (itemId) {
      await supabase
        .from('moderation_queue')
        .update({ reason: 'unavailable' })
        .eq('id', itemId)
        .eq('status', 'pending');
    }
    return json({ decision: 'unavailable', reason: 'unavailable', configured: false });
  };

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'No autenticado' }, 401);

    const body = (await req.json()) as { itemId?: string; url?: string };
    const url = body.url;
    if (!body.itemId || !url) return json({ error: 'Faltan parámetros' }, 400);

    // El elemento debe pertenecer a quien llama.
    const { data: item } = await supabase
      .from('moderation_queue')
      .select('id, profile_id, kind, event_id, profiles!inner(user_id)')
      .eq('id', body.itemId)
      .maybeSingle();

    const owner = (item as { profiles?: { user_id: string } } | null)?.profiles?.user_id;
    if (!item || owner !== user.id) return json({ error: 'No autorizado' }, 403);
    itemId = body.itemId;

    const analysis = await scorePhoto(url);
    if (!analysis) return await unavailable();

    const threshold = Number(Deno.env.get('MODERATION_THRESHOLD') ?? DEFAULT_THRESHOLD);

    // Una cara y sólo una: ni fotos de paisaje ni de grupo, donde no se sabe
    // a quién se está dando like.
    const faceProblem = analysis.faces === 0 ? 'no_face' : analysis.faces > 1 ? 'many_faces' : null;
    const approved = analysis.score < threshold && faceProblem === null;
    const rejectionReason = faceProblem ?? analysis.reason;

    await supabase
      .from('moderation_queue')
      .update({
        status: approved ? 'approved' : 'rejected',
        score: analysis.score,
        reason: approved ? null : rejectionReason,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', body.itemId);

    // Si ésta ha pasado, las del mismo tipo que se quedaron pendientes porque
    // la revisión no respondía ya no hacen falta: fuera de la cola manual. Las
    // fotos del perfil no, porque cada una es distinta.
    if (approved && item.kind !== 'photo') {
      let viejas = supabase
        .from('moderation_queue')
        .update({ status: 'rejected', reason: 'superseded', reviewed_at: new Date().toISOString() })
        .eq('profile_id', item.profile_id)
        .eq('kind', item.kind)
        .eq('status', 'pending')
        .eq('reason', 'unavailable')
        .neq('id', body.itemId);
      if (item.kind === 'event_photo' && item.event_id) viejas = viejas.eq('event_id', item.event_id);
      await viejas;
    }

    // La verificación facial no publica ninguna foto: sólo confirma que hay
    // una cara y una sola. Es aquí, con la clave de servicio, donde se decide,
    // porque `profiles.face_verified` está cerrada a escrituras del navegador.
    if (item.kind === 'face_verification') {
      if (approved) {
        await supabase.rpc('set_face_verified', { p_profile_id: item.profile_id });
      }

      return json({
        decision: approved ? 'approved' : 'rejected',
        reason: approved ? null : rejectionReason,
        faces: analysis.faces,
        configured: true,
      });
    }

    // La foto del evento no se publica en el perfil: es de esta noche y sólo
    // vale para el tablón de este evento. La guarda el cliente con
    // set_event_photo() en cuanto sabe que ha pasado la revisión.
    // El avatar aprobado se pone aquí, con la clave de servicio: la base de
    // datos no deja al navegador poner un avatar que no haya pasado la revisión.
    // Una sola foto al entrar: si la de la noche pasa y la cuenta aún no estaba
    // verificada, la verifica (primera foto del perfil y cara comprobada).
    if (approved && item.kind === 'event_photo') {
      await supabase.rpc('verify_from_event_photo', { p_profile_id: item.profile_id, p_url: url });
    }

    if (approved && item.kind === 'avatar') {
      await supabase.from('profiles').update({ avatar: url }).eq('id', item.profile_id);
    }

    if (approved && item.kind !== 'event_photo' && item.kind !== 'avatar') {
      // Publica la foto en el perfil usando la misma función que el panel.
      const { error } = await supabase.rpc('review_photo', {
        p_item_id: body.itemId,
        p_approve: true,
        p_reason: null,
      });

      // La RPC exige rol admin; con service role se salta RLS pero is_admin()
      // devuelve false, así que aplicamos el cambio directamente si falla.
      if (error) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('photos, avatar')
          .eq('id', item.profile_id)
          .maybeSingle();

        const photos = [...(profile?.photos ?? []), url];
        await supabase
          .from('profiles')
          .update({ photos, avatar: profile?.avatar ?? url })
          .eq('id', item.profile_id);
      }
    }

    return json({
      decision: approved ? 'approved' : 'rejected',
      score: analysis.score,
      reason: approved ? null : rejectionReason,
      faces: analysis.faces,
      configured: true,
    });
  } catch (error) {
    console.error('Moderation error:', error);
    return await unavailable();
  }
});

export { corsHeaders };
