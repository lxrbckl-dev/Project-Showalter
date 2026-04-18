/*
 * Service worker stub — Phase 0.
 *
 * Registration only. No fetch handlers, no push handlers, no caching. Full
 * Web Push logic (push + notificationclick events, VAPID subscription) lands
 * in Phase 8 per STACK.md § Notifications for Sawyer.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
