import { supabase } from '@/integrations/supabase/client';
import i18n from '@/i18n';

/**
 * Alta de cuenta y correos de la cuenta.
 *
 * No se usa `supabase.auth.signUp()`: el servicio de correo que Supabase trae
 * de serie sólo entrega a los miembros de la organización de Supabase y admite
 * dos o tres mensajes por hora, así que quien se registraba desde fuera no
 * recibía nunca el correo de verificación. La Edge Function `auth-email` crea
 * la cuenta y manda el correo por Resend, que es el proveedor que ya usamos.
 */

export type AuthEmailError =
  | 'INVALID_EMAIL'
  | 'WEAK_PASSWORD'
  | 'TOO_MANY_REQUESTS'
  | 'EMAIL_NOT_CONFIGURED'
  | 'EMAIL_SEND_FAILED'
  | 'SIGNUP_FAILED'
  | 'EMAIL_TAKEN'
  | 'PHONE_TAKEN'
  | 'NETWORK';

export class AuthEmailFailure extends Error {
  readonly code: AuthEmailError;
  /** La cuenta existe aunque el correo no haya salido: se puede reenviar. */
  readonly accountCreated: boolean;

  constructor(code: AuthEmailError, accountCreated = false) {
    super(code);
    this.name = 'AuthEmailFailure';
    this.code = code;
    this.accountCreated = accountCreated;
  }
}

interface SignedUpload {
  name: string;
  path: string;
  token: string;
}

interface AuthEmailResponse {
  ok?: boolean;
  alreadyRegistered?: boolean;
  uploads?: SignedUpload[];
  error?: AuthEmailError;
  created?: boolean;
}

const call = async (payload: Record<string, unknown>): Promise<AuthEmailResponse> => {
  const { data, error } = await supabase.functions.invoke<AuthEmailResponse>('auth-email', {
    body: { ...payload, locale: i18n.resolvedLanguage ?? 'es' },
  });

  // `invoke` trata cualquier código distinto de 2xx como error y deja el cuerpo
  // dentro del contexto. Sin leerlo se pierde el motivo y sólo queda un
  // «Edge Function returned a non-2xx status code», que no dice nada.
  if (error) {
    const context = (error as { context?: Response }).context;

    if (context && typeof context.json === 'function') {
      try {
        const body = (await context.json()) as AuthEmailResponse;
        if (body?.error) throw new AuthEmailFailure(body.error, Boolean(body.created));
      } catch (parsed) {
        if (parsed instanceof AuthEmailFailure) throw parsed;
      }
    }

    throw new AuthEmailFailure('NETWORK');
  }

  if (data?.error) throw new AuthEmailFailure(data.error, Boolean(data.created));
  return data ?? {};
};

export const authEmailService = {
  /**
   * Crea la cuenta y manda el correo de verificación.
   *
   * `documents` sólo lo usa el alta de local: la función devuelve una URL
   * firmada por fichero y la subida la hace el navegador directamente contra
   * Storage, porque todavía no hay sesión y los ficheros no caben en el cuerpo
   * de la petición.
   */
  signUp: async (input: {
    email: string;
    password: string;
    metadata: Record<string, unknown>;
    documents?: File[];
  }): Promise<{ alreadyRegistered: boolean }> => {
    const response = await call({
      action: 'signup',
      email: input.email,
      password: input.password,
      metadata: input.metadata,
      documents: input.documents?.map((file) => ({ name: file.name, size: file.size })),
    });

    if (input.documents?.length && response.uploads?.length) {
      await authEmailService.uploadDocuments(input.documents, response.uploads);
    }

    return { alreadyRegistered: Boolean(response.alreadyRegistered) };
  },

  /**
   * Sube los documentos del local con las URLs firmadas.
   *
   * Si alguno falla no se tira el alta abajo: la cuenta ya existe y el local
   * puede volver a subirlos desde su panel. Perder el registro entero por un
   * PDF sería mucho peor.
   */
  uploadDocuments: async (files: File[], uploads: SignedUpload[]): Promise<number> => {
    let uploaded = 0;

    await Promise.all(
      uploads.map(async (upload) => {
        const file = files.find((f) => f.name === upload.name);
        if (!file) return;

        const { error } = await supabase.storage
          .from('documents')
          .uploadToSignedUrl(upload.path, upload.token, file);

        if (error) console.error('No se pudo subir el documento:', upload.name, error.message);
        else uploaded += 1;
      }),
    );

    return uploaded;
  },

  /**
   * ¿El correo o el móvil ya tienen cuenta? El formulario de alta lo pregunta
   * al salir de cada campo para marcarlo en rojo. Si falla la red, se da por
   * libre: el alta lo vuelve a comprobar en el servidor.
   */
  checkAvailability: async (email: string, phone?: string): Promise<{ emailTaken: boolean; phoneTaken: boolean }> => {
    try {
      const response = (await call({ action: 'check', email, phone })) as {
        emailTaken?: boolean;
        phoneTaken?: boolean;
      };
      return { emailTaken: Boolean(response.emailTaken), phoneTaken: Boolean(response.phoneTaken) };
    } catch {
      return { emailTaken: false, phoneTaken: false };
    }
  },

  /** Vuelve a mandar el correo de verificación. */
  resendConfirmation: async (email: string): Promise<void> => {
    await call({ action: 'resend', email });
  },

  /** Manda el enlace para cambiar la contraseña. */
  requestPasswordReset: async (email: string): Promise<void> => {
    await call({ action: 'recover', email });
  },
};

/** Traduce el código de error a una clave de i18n. */
export const authEmailMessage = (error: unknown): string => {
  if (!(error instanceof AuthEmailFailure)) return 'errors.generic';

  const claves: Record<AuthEmailError, string> = {
    INVALID_EMAIL: 'auth.errors.invalidEmail',
    WEAK_PASSWORD: 'auth.errors.passwordShort',
    TOO_MANY_REQUESTS: 'auth.errors.tooManyAttempts',
    EMAIL_NOT_CONFIGURED: 'auth.errors.emailNotConfigured',
    EMAIL_SEND_FAILED: 'auth.errors.emailSendFailed',
    SIGNUP_FAILED: 'errors.generic',
    EMAIL_TAKEN: 'auth.errors.emailTaken',
    PHONE_TAKEN: 'auth.errors.phoneTaken',
    NETWORK: 'errors.generic',
  };

  return claves[error.code];
};
