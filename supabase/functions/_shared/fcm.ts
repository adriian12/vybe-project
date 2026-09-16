/**
 * Envío de avisos a los teléfonos por Firebase Cloud Messaging.
 *
 * Los navegadores se suscriben con VAPID y se les escribe con Web Push. Un
 * teléfono con la aplicación instalada, en cambio, sólo acepta avisos que
 * vengan de Firebase, y para hablar con Firebase hay que identificarse con una
 * cuenta de servicio.
 *
 * La versión antigua de la API usaba una «clave de servidor» que se enviaba tal
 * cual; Google la retiró. La actual pide un token de OAuth2 que se obtiene
 * firmando un JWT con la clave privada de la cuenta de servicio, que es lo que
 * hace este módulo.
 *
 * Variables: FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY
 *
 * Las tres salen del fichero JSON que Firebase genera en
 * Configuración del proyecto > Cuentas de servicio > Generar nueva clave.
 */

export class FcmNotConfiguredError extends Error {
  constructor() {
    super('FCM_NOT_CONFIGURED');
    this.name = 'FcmNotConfiguredError';
  }
}

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const readServiceAccount = (): ServiceAccount | null => {
  const projectId = Deno.env.get('FCM_PROJECT_ID');
  const clientEmail = Deno.env.get('FCM_CLIENT_EMAIL');
  const privateKey = Deno.env.get('FCM_PRIVATE_KEY');

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    // Al guardarla como variable de entorno los saltos de línea llegan
    // escapados, y sin ellos la clave no se puede importar.
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
};

export const isFcmConfigured = (): boolean => readServiceAccount() !== null;

const base64url = (input: ArrayBuffer | string): string => {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Convierte la clave PEM de la cuenta de servicio en algo que sepa firmar. */
const importPrivateKey = async (pem: string): Promise<CryptoKey> => {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
};

/** Token de acceso, cacheado mientras siga siendo válido. */
let cachedToken: { value: string; expiresAt: number } | null = null;

const getAccessToken = async (account: ServiceAccount): Promise<string> => {
  // Google los da con una hora de vigencia; se renueva un minuto antes para no
  // llegar tarde por el camino.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );

  const key = await importPrivateKey(account.privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );

  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`No se pudo obtener el token de Firebase: ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.value;
};

export interface FcmResult {
  ok: boolean;
  /** El token ya no vale: el teléfono desinstaló la aplicación o la reinstaló. */
  expired: boolean;
}

/**
 * Manda un aviso a un teléfono.
 *
 * Devuelve si llegó y si el token ha caducado, para que quien llama pueda
 * borrarlo en lugar de reintentar con él para siempre.
 */
export const sendFcm = async (
  token: string,
  notification: { title: string; body: string; url?: string; tag?: string },
): Promise<FcmResult> => {
  const account = readServiceAccount();
  if (!account) throw new FcmNotConfiguredError();

  const accessToken = await getAccessToken(account);

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          // Los datos llegan al manejador de la aplicación: es lo que permite
          // abrir la pantalla correcta al tocar el aviso.
          data: {
            url: notification.url ?? '/home',
            ...(notification.tag ? { tag: notification.tag } : {}),
          },
          android: {
            priority: 'HIGH',
            notification: {
              // Agrupa los avisos del mismo hilo en lugar de apilarlos.
              tag: notification.tag,
              // El morado de la aplicación en el icono pequeño.
              color: '#9b87f5',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                'thread-id': notification.tag,
              },
            },
          },
        },
      }),
    },
  );

  if (response.ok) return { ok: true, expired: false };

  const detail = await response.text();

  // 404 y `UNREGISTERED` significan que ese teléfono ya no existe para nosotros.
  const expired =
    response.status === 404 ||
    detail.includes('UNREGISTERED') ||
    detail.includes('INVALID_ARGUMENT');

  if (!expired) console.error('Error de Firebase:', response.status, detail);

  return { ok: false, expired };
};
