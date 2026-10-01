import * as Sentry from '@sentry/react';
import type { PostHog } from 'posthog-js';

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

/**
 * PostHog (analítica de producto). Sin `VITE_POSTHOG_KEY` no se carga. Va al
 * servidor de la UE y **sin cookies ni almacenamiento** (`persistence:
 * 'memory'`): no guarda nada en el dispositivo, por eso no hace falta aviso de
 * cookies. Sin grabación de sesiones (hay chats y fotos) ni captura de campos.
 */
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://eu.i.posthog.com';
let posthog: PostHog | null = null;
/** Lo que llega antes de que PostHog termine de cargar. */
const pendientesPosthog: ((ph: PostHog) => void)[] = [];
const conPosthog = (accion: (ph: PostHog) => void) => {
  if (!POSTHOG_KEY || import.meta.env.DEV) return;
  if (posthog) accion(posthog);
  else pendientesPosthog.push(accion);
};

const initPosthog = () => {
  if (!POSTHOG_KEY || import.meta.env.DEV) return;
  // Aparte del fichero principal: sólo se descarga si está configurado.
  void import('posthog-js').then(({ default: ph }) => {
    ph.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      persistence: 'memory',
      person_profiles: 'identified_only',
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: { dom_event_allowlist: ['click', 'submit'], element_allowlist: ['a', 'button', 'form'] },
      disable_session_recording: true,
      mask_all_text: false,
      mask_all_element_attributes: false,
      sanitize_properties: (props) => {
        for (const k of ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer']) {
          if (typeof props[k] === 'string') props[k] = (props[k] as string).replace(SENSITIVE_PARAMS, '$1$2=***');
        }
        return props;
      },
    });
    posthog = ph;
    for (const accion of pendientesPosthog.splice(0)) accion(ph);
  });
};

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
  initPosthog();
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
  // En PostHog, sólo el id del perfil y el papel: ni nombre, ni correo.
  conPosthog((ph) => (profileId ? ph.identify(profileId, { role: role ?? 'user' }) : ph.reset()));
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
  | 'account_deleted'
  | 'tickets_checkout'
  | 'event_rated'
  | 'page_view';

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
  conPosthog((ph) =>
    name === 'page_view'
      ? ph.capture('$pageview', { ...props, $current_url: window.location.origin + String(props.path ?? '') })
      : ph.capture(name, props),
  );
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
