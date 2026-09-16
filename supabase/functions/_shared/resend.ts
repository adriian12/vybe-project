/**
 * Envío de correo por Resend.
 *
 * Estaba metido dentro de `send-sos-alert`, que era la única función que
 * mandaba correo. Ahora también manda el de verificación de la cuenta, así que
 * el trozo compartido vive aquí.
 *
 * Variables: RESEND_API_KEY, AUTH_FROM_EMAIL (o SOS_FROM_EMAIL como respaldo).
 */

export class ResendNotConfiguredError extends Error {
  constructor() {
    super('RESEND_NOT_CONFIGURED');
    this.name = 'ResendNotConfiguredError';
  }
}

export class ResendSendError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ResendSendError';
    this.status = status;
  }
}

export const isResendConfigured = (): boolean =>
  Boolean(Deno.env.get('RESEND_API_KEY')) &&
  Boolean(Deno.env.get('AUTH_FROM_EMAIL') ?? Deno.env.get('SOS_FROM_EMAIL'));

/**
 * El remitente del correo de la cuenta.
 *
 * `onboarding@resend.dev` es el remitente de pruebas de Resend y **sólo
 * entrega al correo del dueño de la cuenta de Resend**. Para escribir a
 * cualquier persona hace falta un dominio verificado en Resend y poner aquí una
 * dirección suya. No se puede comprobar desde el código, así que si los correos
 * no llegan a nadie más que a ti, es esto.
 */
const from = (): string =>
  Deno.env.get('AUTH_FROM_EMAIL') ?? Deno.env.get('SOS_FROM_EMAIL') ?? '';

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export const sendEmail = async (email: Email): Promise<string> => {
  const key = Deno.env.get('RESEND_API_KEY');
  const sender = from();
  if (!key || !sender) throw new ResendNotConfiguredError();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: sender,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      // Se manda también en texto plano: sin él muchos filtros lo puntúan como
      // correo basura, y el de verificación es justo el que no puede perderse.
      text: email.text,
    }),
  });

  const detail = await response.text();
  if (!response.ok) throw new ResendSendError(response.status, detail);

  return detail;
};
