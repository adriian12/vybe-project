/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// ============================================================================
// Caché de la shell
// ============================================================================

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// ============================================================================
// Notificaciones push
//
// Sin esto el bucle del producto se rompe: un match del que te enteras al día
// siguiente no sirve de nada en una app que sólo funciona mientras estás en el
// evento.
// ============================================================================

interface PushPayload {
  title: string;
  body: string;
  /** Ruta a la que navegar al tocar la notificación. */
  url?: string;
  /** Agrupa notificaciones del mismo hilo (una por conversación). */
  tag?: string;
  icon?: string;
  renotify?: boolean;
}

const DEFAULT_ICON = '/icons/icon-192.png';

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: 'Vybe', body: event.data.text() };
  }

  // `renotify` y `vibrate` existen en los navegadores pero no en los tipos DOM
  // de TypeScript, de ahí el ensanchado del objeto de opciones.
  const options: NotificationOptions = {
    body: payload.body,
    icon: payload.icon ?? DEFAULT_ICON,
    badge: DEFAULT_ICON,
    tag: payload.tag,
    data: { url: payload.url ?? '/' },
    ...({ renotify: payload.renotify ?? true, vibrate: [80, 40, 80] } as Record<string, unknown>),
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data?.url as string | undefined) ?? '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Si la app ya está abierta, la enfocamos en vez de abrir otra pestaña.
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'NAVIGATE', url: target });
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});

// El navegador puede rotar la suscripción; avisamos a la app para que la
// vuelva a registrar en el servidor la próxima vez que se abra.
// `pushsubscriptionchange` no está tipado en lib.dom.
self.addEventListener('pushsubscriptionchange', ((event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach((client) => client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
    })(),
  );
}) as EventListener);
