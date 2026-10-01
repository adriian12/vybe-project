import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { overLimit, tooManyRequests } from '../_shared/rate-limit.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser, userClient } from '../_shared/supabase.ts';
import { sendTicketEmail } from '../_shared/ticket-mail.ts';

/**
 * Gestión de entradas desde el panel del negocio (migración 096).
 *
 *   POST { action: 'issue', typeId, quantity, name, email?, note? }
 *        → emite invitaciones (entradas de 0 €) y manda el correo con el PDF.
 *   POST { action: 'resend', orderId }
 *        → vuelve a mandar el correo de un pedido.
 *
 * Los permisos los deciden las funciones SQL con la sesión de quien llama
 * (`issue_comp_tickets`, `can_manage_ticket_order`): sólo el propietario del
 * negocio y administración. El correo sale con service role.
 */

const CODIGO = /^[A-Z_]+$/;

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const admin = adminClient();
  try {
    const user = await getUser(req, admin);
    if (!user) return json({ error: 'NOT_AUTHENTICATED' }, 401);
    if (await overLimit(admin, req, 'ticket-admin', 30, { userId: user.id })) return tooManyRequests();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const db = userClient(req);

    if (body.action === 'issue') {
      const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;
      const { data: orderId, error } = await db.rpc('issue_comp_tickets', {
        p_type_id: String(body.typeId ?? ''),
        p_quantity: Number(body.quantity ?? 1),
        p_holder_name: String(body.name ?? ''),
        p_holder_email: email,
        p_note: typeof body.note === 'string' ? body.note : null,
      });
      if (error) {
        const codigo = CODIGO.test(error.message) ? error.message : 'ISSUE_FAILED';
        if (codigo === 'ISSUE_FAILED') console.error('ticket-admin issue:', error);
        return json({ error: codigo }, 400);
      }
      // Sin correo, la entrada queda en la lista de asistentes y se descarga desde allí.
      const emailed = email ? await sendTicketEmail(admin, String(orderId)) : false;
      return json({ orderId, emailed });
    }

    if (body.action === 'resend') {
      const orderId = String(body.orderId ?? '');
      const { data: puede } = await db.rpc('can_manage_ticket_order', { p_order_id: orderId });
      if (puede !== true) return json({ error: 'NOT_AUTHORIZED' }, 403);
      // `sendTicketEmail` sólo manda si el pedido no se había enviado: se suelta la marca.
      await admin.from('ticket_orders').update({ email_sent_at: null }).eq('id', orderId);
      const emailed = await sendTicketEmail(admin, orderId);
      return emailed ? json({ emailed }) : json({ error: 'NO_EMAIL' }, 400);
    }

    return json({ error: 'INVALID_ACTION' }, 400);
  } catch (error) {
    console.error('ticket-admin:', error);
    return json({ error: 'INTERNAL' }, 500);
  }
});
