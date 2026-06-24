/**
 * SharePay Service Worker
 * Strategy: Cache-First for static assets, Network-First for API/Firebase calls
 * Version bump CACHE_NAME whenever static assets change.
 */

const CACHE_NAME    = 'sharepay-v1.0.0';
const OFFLINE_PAGE  = '/index.html';

/** Static shell – always cached on install */
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/member.html',
  '/admin.html',
  '/dashboard.js',
  '/create-group.html',
  '/expense-list.html',
  '/settlement.html',
  '/settings.html',
  '/css/main.css',
  '/css/admin.css',
  '/css/member.css',
  '/css/responsive.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/admin.js',
  '/js/member.js',
  '/js/dashboard.js',
  '/js/expenses.js',
  '/js/notifications.js',
  '/assets/logo/logo.svg',
  '/manifest.json',
];

/** URL patterns that should never be cached (always go to network) */
const NEVER_CACHE = [
  /firestore\.googleapis\.com/,
  /firebase\.googleapis\.com/,
  /identitytoolkit\.googleapis\.com/,
  /securetoken\.googleapis\.com/,
  /googleapis\.com\/identitytoolkit/,
];

// ─────────────────────────────────────────────
// INSTALL — pre-cache static shell
// ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching static shell');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.error('[SW] Pre-cache failed:', err))
  );
});

// ─────────────────────────────────────────────
// ACTIVATE — purge old caches
// ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating…');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─────────────────────────────────────────────
// FETCH — routing logic
// ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET and cross-origin except same-origin assets
  if (request.method !== 'GET') return;

  // 2. Never cache Firebase / Google API calls
  if (NEVER_CACHE.some((pattern) => pattern.test(request.url))) {
    event.respondWith(fetch(request));
    return;
  }

  // 3. Cache-first for static assets (same origin)
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 4. Network-first for anything else (CDN fonts, etc.)
  event.respondWith(networkFirst(request));
});

// ─────────────────────────────────────────────
// Strategies
// ─────────────────────────────────────────────

/** Cache-first: serve from cache, fall back to network, update cache */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_PAGE);
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/** Network-first: try network, fall back to cache */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ─────────────────────────────────────────────
// PUSH NOTIFICATIONS
// ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'SharePay', body: 'You have a new notification.' };
  try { data = event.data.json(); } catch { /* plain text */ }

  const options = {
    body:    data.body    || 'Check SharePay for updates.',
    icon:    data.icon    || '/assets/logo/logo.svg',
    badge:   data.badge   || '/assets/logo/logo.svg',
    tag:     data.tag     || 'sharepay-notification',
    data:    data.url     || '/',
    actions: [
      { action: 'view',    title: '👁️ View' },
      { action: 'dismiss', title: '✕ Dismiss' },
    ],
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'SharePay', options)
  );
});

// ─────────────────────────────────────────────
// NOTIFICATION CLICK
// ─────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ─────────────────────────────────────────────
// BACKGROUND SYNC (offline queue)
// ─────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-expenses') {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  // In production: read IndexedDB offline queue and replay to Firebase
  console.log('[SW] Background sync: replaying offline expense queue…');
  // const db = await openIDB();
  // const pending = await db.getAll('offline-queue');
  // for (const item of pending) { await fetch(...); await db.delete('offline-queue', item.id); }
}
