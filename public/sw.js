/*
 * Service worker — Phase 8A.
 *
 * Full Web Push implementation replacing the Phase 0 stub. Three handlers:
 *
 *   install   — skip the 'installed → waiting' state so the new SW takes
 *               over immediately; matches STACK.md § "Form submission during
 *               deploy" expectation that the latest worker is live.
 *   activate  — claim all open clients so existing tabs start receiving
 *               events from this worker without a hard reload.
 *   push      — parse the JSON payload sent by the server dispatcher
 *               (src/server/notifications/push.ts), show an OS-level
 *               notification.
 *   notificationclick — when the admin taps the notification, focus an
 *               existing Showalter admin tab if one is open; otherwise
 *               open a new one at the URL baked into the notification
 *               data (defaults to /admin/notifications).
 *
 * Payload contract (must stay in sync with the dispatcher):
 *   { title: string, body: string, url: string }
 *
 * The worker never reads the DB, never talks to the server beyond the
 * push-service → SW channel, and never caches assets — Phase 12 PWA
 * offline caching is explicitly out of scope here.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // Defensive parse: malformed / empty payloads still produce a neutral
  // "New activity" notification rather than silently dropping the event.
  let payload = { title: 'New activity', body: '', url: '/admin/notifications' };
  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.title === 'string' && parsed.title.length > 0) {
          payload.title = parsed.title;
        }
        if (typeof parsed.body === 'string') {
          payload.body = parsed.body;
        }
        if (typeof parsed.url === 'string' && parsed.url.length > 0) {
          payload.url = parsed.url;
        }
      }
    } catch (_err) {
      // Non-JSON push (rare — web-push always sends JSON per our dispatcher,
      // but handlers are specced to tolerate arbitrary bytes). Fall back to
      // the raw text as the body.
      try {
        payload.body = event.data.text();
      } catch (_innerErr) {
        // Ignore — keep the defaults.
      }
    }
  }

  const options = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.url },
    // `tag` collapses rapid-fire duplicates of the same alert into one
    // OS notification (e.g. two booking submissions land within seconds).
    tag: 'showalter-admin',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/admin/notifications';

  event.waitUntil(
    (async () => {
      // Include uncontrolled clients so freshly-opened tabs are reachable
      // without a round-trip through window.open.
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Prefer focusing an existing admin tab — Sawyer usually has it open.
      for (const client of allClients) {
        const url = new URL(client.url);
        if (url.pathname.startsWith('/admin')) {
          try {
            if ('navigate' in client && typeof client.navigate === 'function') {
              // Navigate the existing tab to the notification's URL first,
              // then focus. Falls back to focus-only if navigation throws
              // (cross-origin guard, etc.).
              try {
                await client.navigate(targetUrl);
              } catch (_err) {
                // ignore
              }
            }
            return client.focus();
          } catch (_err) {
            // Fallthrough — try the next client or open a new window.
          }
        }
      }

      // No existing admin tab — open a fresh window at the target URL.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
