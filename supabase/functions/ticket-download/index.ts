import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { loadTicketOrder, renderTicketsPdf } from '../_shared/ticket-pdf.ts';
import { buildWalletPass, walletConfigured } from '../_shared/wallet-pass.ts';

/**
 * Descargar las entradas de un pedido (migración 077):
 *
 *   GET ?t=<download_token>                    → PDF con todas las entradas
 *   GET ?t=<download_token>&code=E-XXXX        → PDF de esa entrada
 *   GET ?t=<download_token>&code=E-XXXX&format=pkpass → pase de Apple Wallet
 *
 * Sin JWT: se abre desde el correo o desde el navegador del móvil. Lo que
 * protege es el token del pedido (144 bits aleatorios).
 */

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';
  const code = url.searchParams.get('code') ?? undefined;
  const format = url.searchParams.get('format') ?? 'pdf';
  if (!/^[a-f0-9]{24,64}$/.test(token)) return json({ error: 'INVALID_LINK' }, 404);

  try {
    const pedido = await loadTicketOrder(adminClient(), { token });
    if (!pedido || pedido.data.tickets.length === 0) return json({ error: 'NOT_FOUND' }, 404);
    if (code && !pedido.data.tickets.some((t) => t.code === code)) return json({ error: 'NOT_FOUND' }, 404);

    const nombre = pedido.data.eventName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'entrada';

    if (format === 'pkpass') {
      if (!walletConfigured() || !code) return json({ error: 'WALLET_NOT_AVAILABLE' }, 404);
      const pass = await buildWalletPass(pedido.data, code, pedido.location);
      return new Response(pass, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Disposition': `attachment; filename="${nombre}-${code}.pkpass"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const pdf = await renderTicketsPdf(pedido.data, code);
    return new Response(pdf, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nombre}${code ? `-${code}` : ''}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('ticket-download:', error);
    return json({ error: 'INTERNAL' }, 500);
  }
});
