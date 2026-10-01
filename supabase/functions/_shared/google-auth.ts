/**
 * Token de acceso a las API de Google con una cuenta de servicio (Google Play
 * Developer API, Google Wallet…).
 *
 * La cuenta sale de `GOOGLE_SERVICE_ACCOUNT_JSON` (el JSON entero de la
 * clave) o, si no está, de la de Firebase que ya usan los avisos
 * (`FCM_CLIENT_EMAIL` y `FCM_PRIVATE_KEY`). Basta con dar permisos a esa
 * cuenta en Play Console.
 *
 * Google Wallet usa su propia cuenta (`GOOGLE_WALLET_SERVICE_ACCOUNT_JSON`),
 * del proyecto de Google Cloud «Fiestea», invitada como Desarrollador en la
 * consola de Wallet.
 */

/** `wallet`: la cuenta de Google Wallet; `default`: Play y lo demás. */
export type GoogleAccountKind = 'default' | 'wallet';

interface Cuenta {
  clientEmail: string;
  privateKey: string;
}

const limpiarClave = (clave: string) =>
  clave
    .trim()
    .replace(/^['"]|['"]$/g, '')
    // Guardada como variable, los saltos de línea llegan escapados (a veces dos veces).
    .replace(/\\+n/g, '\n');

const desdeJson = (nombre: string): Cuenta | null => {
  const json = Deno.env.get(nombre);
  if (!json) return null;
  try {
    const d = JSON.parse(json) as { client_email?: string; private_key?: string };
    if (d.client_email && d.private_key) return { clientEmail: d.client_email, privateKey: limpiarClave(d.private_key) };
  } catch {
    console.error(`${nombre} no es un JSON válido`);
  }
  return null;
};

export const googleServiceAccount = (kind: GoogleAccountKind = 'default'): Cuenta | null => {
  if (kind === 'wallet') return desdeJson('GOOGLE_WALLET_SERVICE_ACCOUNT_JSON');
  const json = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (json) {
    try {
      const d = JSON.parse(json) as { client_email?: string; private_key?: string };
      if (d.client_email && d.private_key) return { clientEmail: d.client_email, privateKey: limpiarClave(d.private_key) };
    } catch {
      console.error('GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido');
    }
  }
  const clientEmail = Deno.env.get('FCM_CLIENT_EMAIL');
  const privateKey = Deno.env.get('FCM_PRIVATE_KEY');
  return clientEmail && privateKey ? { clientEmail, privateKey: limpiarClave(privateKey) } : null;
};

const base64url = (input: ArrayBuffer | string): string => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const importarClave = (pem: string): Promise<CryptoKey> => {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/[^A-Za-z0-9+/=]/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
};

/** Firma un JWT RS256 con la clave de la cuenta de servicio. */
export const signGoogleJwt = async (
  claims: Record<string, unknown>,
  kind: GoogleAccountKind = 'default',
): Promise<string> => {
  const cuenta = googleServiceAccount(kind);
  if (!cuenta) throw new Error('GOOGLE_NOT_CONFIGURED');
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = base64url(JSON.stringify(claims));
  const firma = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    await importarClave(cuenta.privateKey),
    new TextEncoder().encode(`${header}.${cuerpo}`),
  );
  return `${header}.${cuerpo}.${base64url(firma)}`;
};

const cache = new Map<string, { value: string; expiresAt: number }>();

/** Token OAuth para un ámbito, guardado mientras dure (una hora). */
export const googleAccessToken = async (scope: string, kind: GoogleAccountKind = 'default'): Promise<string> => {
  const clave = `${kind}:${scope}`;
  const guardado = cache.get(clave);
  if (guardado && guardado.expiresAt > Date.now() + 60_000) return guardado.value;

  const cuenta = googleServiceAccount(kind);
  if (!cuenta) throw new Error('GOOGLE_NOT_CONFIGURED');
  const ahora = Math.floor(Date.now() / 1000);
  const assertion = await signGoogleJwt({
    iss: cuenta.clientEmail,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600,
  }, kind);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!r.ok) throw new Error(`Token de Google: ${r.status} ${await r.text()}`);
  const d = (await r.json()) as { access_token: string; expires_in: number };
  cache.set(clave, { value: d.access_token, expiresAt: Date.now() + d.expires_in * 1000 });
  return d.access_token;
};
