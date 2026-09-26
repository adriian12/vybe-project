import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { escapeHtml, renderEmail, BRAND } from './email.ts';
import { isResendConfigured, sendEmail } from './resend.ts';
import { loadTicketOrder, renderTicketsPdf } from './ticket-pdf.ts';
import { walletConfigured } from './wallet-pass.ts';

/**
 * El correo con las entradas de un pedido (migración 077): siempre llega una
 * copia a quien compra, con el PDF adjunto, el botón de descarga y el de Apple
 * Wallet. Cada asistente con un correo distinto recibe además la suya.
 * Una sola vez por pedido (`email_sent_at`).
 */

const base = () => `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')}/functions/v1/ticket-download`;

const b64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const cuando = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(new Date(iso));

export const sendTicketEmail = async (supabase: SupabaseClient, orderId: string): Promise<boolean> => {
  if (!isResendConfigured()) return false;
  const pedido = await loadTicketOrder(supabase, { orderId });
  if (!pedido || pedido.emailSentAt) return false;
  const { data, token } = pedido;

  // Cada entrada se reconoce por el nombre de quien la lleva, no por su código.
  const nombreDe = (codigo: string, i: number) =>
    data.tickets.find((t) => t.code === codigo)?.holderName?.trim() || `${data.typeName} ${i + 1}`;

  const enviar = async (to: string, codigos: string[]) => {
    const unaSola = codigos.length === 1 ? codigos[0] : undefined;
    const nombres = codigos.map(nombreDe);
    const pdf = await renderTicketsPdf(data, unaSola);
    const descarga = `${base()}?t=${token}${unaSola ? `&code=${encodeURIComponent(unaSola)}` : ''}`;
    const botones = [{ text: codigos.length > 1 ? 'Descargar las entradas' : 'Descargar la entrada', url: descarga }];
    if (walletConfigured()) {
      for (const [i, c] of codigos.slice(0, 10).entries()) {
        botones.push({
          text: `Apple Wallet · ${nombres[i]}`,
          url: `${base()}?t=${token}&code=${encodeURIComponent(c)}&format=pkpass`,
          style: 'secondary',
        } as never);
      }
    }
    const tarjeta = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cardSoft};border-radius:14px;">
      <tr><td style="padding:16px 18px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
        <div style="color:${BRAND.accent};font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(data.typeName)}</div>
        <div style="color:#fff;font-size:18px;font-weight:800;padding-top:4px;">${escapeHtml(data.eventName)}</div>
        <div style="color:${BRAND.muted};font-size:14px;padding-top:6px;">${escapeHtml(cuando(data.startDate))}</div>
        <div style="color:${BRAND.muted};font-size:14px;">${escapeHtml(data.placeLine ?? data.address ?? data.venueName)}</div>
        <div style="color:#fff;font-size:14px;padding-top:8px;">${codigos.length} ${codigos.length === 1 ? 'entrada' : 'entradas'} · ${nombres.map(escapeHtml).join(', ')}</div>
      </td></tr></table>`;
    const { html, text } = renderEmail({
      preheader: `Tu entrada para ${data.eventName}`,
      eyebrow: 'Tu entrada',
      heading: data.eventName,
      paragraphs: ['Aquí tienes tu entrada. Va también adjunta en PDF: enseña el QR en la puerta.'],
      blockHtml: tarjeta,
      buttons: botones,
      note: `Entrada vendida por ${data.venueName} a través de ${BRAND.name}. Cada entrada vale una sola vez.`,
    });
    await sendEmail({
      to,
      subject: `Tu entrada · ${data.eventName}`,
      html,
      text,
      attachments: [{ filename: `entrada-${unaSola ?? data.orderId.slice(0, 8)}.pdf`, content: b64(pdf) }],
    });
  };

  const todos = data.tickets.map((t) => t.code);
  if (pedido.buyerEmail) await enviar(pedido.buyerEmail, todos);

  // Cada asistente con su propio correo recibe también la suya.
  const comprador = (pedido.buyerEmail ?? '').toLowerCase();
  for (const t of data.tickets) {
    const correo = (t.holderEmail ?? '').toLowerCase();
    if (correo && correo !== comprador) {
      try {
        await enviar(correo, [t.code]);
      } catch (error) {
        console.error('ticket-mail asistente:', error);
      }
    }
  }

  await supabase.from('ticket_orders').update({ email_sent_at: new Date().toISOString() }).eq('id', orderId);
  return true;
};
