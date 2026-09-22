import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
/**
 * Por defecto la analítica va a nuestra propia Edge Function; VITE_ANALYTICS_URL
 * permite apuntar a un proveedor externo sin tocar código.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANALYTICS_ENDPOINT =
  (import.meta.env.VITE_ANALYTICS_URL as string | undefined) ??
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/analytics-collect` : undefined);
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Parámetros que nunca deben salir del dispositivo en una traza de error. */
const SENSITIVE_PARAMS = /([?&])(lat|lng|latitude|longitude|code|token|token_hash|email)=[^&]*/gi;

/**
 * Inicializa el reporte de errores.
 *
 * Sin `VITE_SENTRY_DSN` no se activa nada: en desarrollo no queremos ruido y no
 * tiene sentido intentar enviar eventos a ninguna parte.
 *
 * Vybe trata ubicación, fotos y conversaciones privadas, así que el envío de
 * datos personales se desactiva de forma explícita en vez de confiar en el
 * valor por defecto del SDK.
 */
export const initObservability = () => {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Lo define Vite en tiempo de compilación. Sin él, todos los errores de
    // todos los despliegues caen en el mismo saco y no hay forma de saber si
    // un fallo llegó con el último cambio.
    release: __APP_RELEASE__,

    // Sin datos personales: ni IP, ni cookies, ni cabeceras de la petición.
    sendDefaultPii: false,

    tracesSampleRate: 0.1,
    // Session Replay grabaría la pantalla, incluidos chats y fotos. Desactivado.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    beforeSend(event) {
      // Coordenadas, códigos de acceso y tokens fuera de las URLs.
      if (event.request?.url) {
        event.request.url = event.request.url.replace(SENSITIVE_PARAMS, '$1$2=***');
      }
      delete event.request?.cookies;
      delete event.request?.headers;

      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((crumb) =>
          typeof crumb.data?.url === 'string'
            ? { ...crumb, data: { ...crumb.data, url: crumb.data.url.replace(SENSITIVE_PARAMS, '$1$2=***') } }
            : crumb,
        );
      }

      return event;
    },
  });
};

/**
 * Lanza un error de prueba para comprobar que Sentry recibe eventos.
 *
 * Sólo existe en desarrollo: en producción no queremos un botón que rompa la
 * aplicación a propósito.
 */
export const throwTestError = () => {
  throw new Error('Vybe: error de prueba para verificar Sentry');
};

/** Asocia los errores al usuario sin enviar datos personales. */
export const identifyUser = (profileId: string | null, role?: string) => {
  if (!DSN) return;
  Sentry.setUser(profileId ? { id: profileId, segment: role } : null);
};

// ============================================================================
// Analítica de producto
// ============================================================================

export type AnalyticsEvent =
  | 'signup_started'
  | 'signup_completed'
  | 'email_verified'
  | 'event_viewed'
  | 'location_verified'
  | 'code_redeemed'
  | 'code_rejected'
  | 'photos_uploaded'
  | 'swipe'
  | 'match'
  | 'message_sent'
  | 'premium_dialog_opened'
  | 'premium_subscribed'
  | 'supercrush_bought'
  | 'report_submitted'
  | 'sos_triggered'
  | 'venue_event_created'
  | 'venue_event_updated'
  | 'venue_code_generated'
  | 'account_deleted';

interface QueuedEvent {
  name: AnalyticsEvent;
  props: Record<string, unknown>;
  at: string;
}

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const flush = async () => {
  flushTimer = null;
  if (!ANALYTICS_ENDPOINT || queue.length === 0) return;

  const batch = queue.splice(0, queue.length);

  try {
    // `keepalive` permite que el último lote salga aunque se cierre la pestaña.
    await fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ANON_KEY ? { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } : {}),
      },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
  } catch {
    // La analítica nunca debe romper la app ni reintentar de forma agresiva.
  }
};

/**
 * Registra un evento de producto.
 *
 * Sin `VITE_ANALYTICS_URL` sólo se traza en consola en desarrollo, así que el
 * código de la app puede llamar a `track()` sin condicionales por todas partes.
 */
export const track = (name: AnalyticsEvent, props: Record<string, unknown> = {}) => {
  if (import.meta.env.DEV) {
    console.debug('[analytics]', name, props);
    return;
  }

  if (!ANALYTICS_ENDPOINT) return;

  queue.push({ name, props, at: new Date().toISOString() });

  // Agrupamos para no hacer una petición por clic.
  if (!flushTimer) flushTimer = setTimeout(() => void flush(), 3000);
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}
