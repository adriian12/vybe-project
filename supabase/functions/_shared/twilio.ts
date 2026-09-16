/**
 * Envío de SMS por Twilio.
 *
 * Admite dos formas de autenticarse, en este orden:
 *
 *   1. **API Key** (`TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET`). Es la
 *      recomendada: se puede revocar sola sin rotar las credenciales maestras
 *      de la cuenta.
 *   2. **Auth Token** de la cuenta (`TWILIO_AUTH_TOKEN`).
 *
 * En ambos casos la URL usa siempre el Account SID (`AC…`); lo que cambia es
 * el par de Basic auth.
 */

export class TwilioNotConfiguredError extends Error {
  constructor() {
    super('SMS_NOT_CONFIGURED');
    this.name = 'TwilioNotConfiguredError';
  }
}

export class TwilioSendError extends Error {
  constructor(readonly detail: string) {
    super('SMS_SEND_FAILED');
    this.name = 'TwilioSendError';
  }
}

interface TwilioCredentials {
  accountSid: string;
  authUser: string;
  authPass: string;
  fromNumber: string;
}

const readCredentials = (): TwilioCredentials | null => {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!accountSid || !fromNumber) return null;

  const apiKeySid = Deno.env.get('TWILIO_API_KEY_SID');
  const apiKeySecret = Deno.env.get('TWILIO_API_KEY_SECRET');

  if (apiKeySid && apiKeySecret) {
    return { accountSid, authUser: apiKeySid, authPass: apiKeySecret, fromNumber };
  }

  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (authToken) {
    return { accountSid, authUser: accountSid, authPass: authToken, fromNumber };
  }

  return null;
};

/** ¿Hay credenciales suficientes para enviar SMS? */
export const isTwilioConfigured = (): boolean => readCredentials() !== null;

/**
 * Envía un SMS. Lanza `TwilioNotConfiguredError` si faltan credenciales, para
 * que quien llama pueda responder con un mensaje claro en vez de fingir que
 * el mensaje ha salido.
 */
export const sendSms = async (to: string, body: string): Promise<void> => {
  const credentials = readCredentials();
  if (!credentials) throw new TwilioNotConfiguredError();

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${credentials.authUser}:${credentials.authPass}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: credentials.fromNumber, Body: body }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    console.error('Twilio error:', response.status, detail);
    throw new TwilioSendError(detail);
  }
};

/** Variante que no lanza: devuelve si se pudo enviar. Útil para envíos en lote. */
export const trySendSms = async (to: string, body: string): Promise<boolean> => {
  try {
    await sendSms(to, body);
    return true;
  } catch {
    return false;
  }
};
