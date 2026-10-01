export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // `svix-*` las manda Resend en su webhook: sin ellas en la lista, el
  // navegador nunca llegaría a enviarlas.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-push-secret, svix-id, svix-timestamp, svix-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

export const preflight = (req: Request): Response | null =>
  req.method === 'OPTIONS' ? new Response(null, { headers: corsHeaders }) : null;
