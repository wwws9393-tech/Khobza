const CACHE_NAME = 'khobza-pwa-cache-v12';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Khobza PWA: Clearing old cache bucket:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Network-First strategy for HTML and JS/CSS assets to prevent stale version issues
self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/api/') ||
    !event.request.url.startsWith('http')
  ) {
    return;
  }

  // Network-First for HTML navigation and JS/CSS
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            try {
              cache.put(event.request, responseToCache);
            } catch (e) {}
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if offline
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// ==============================================================================
// 1. Web Push Event Listener: Wakes up phone even when app is COMPLETELY CLOSED
// ==============================================================================
self.addEventListener('push', (event) => {
  let title = 'تطبيق الخبزة الذكي 🥖';
  let body = 'لديك إشعار جديد من تطبيق الخبزة';
  let options = {
    icon: '/icon-192.png',
    badge: '/favicon.png',
    vibrate: [500, 200, 500, 200, 500, 200, 800],
    renotify: true,
    requireInteraction: true,
    data: {
      url: '/',
      timestamp: Date.now(),
    },
    actions: [
      { action: 'open_app', title: 'فتح التطبيق 🥖' },
      { action: 'close', title: 'إغلاق' },
    ],
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload.notification) {
        if (payload.notification.title) title = payload.notification.title;
        if (payload.notification.body) body = payload.notification.body;
        if (payload.notification.icon) options.icon = payload.notification.icon;
        if (payload.notification.badge) options.badge = payload.notification.badge;
      }
      if (payload.title) title = payload.title;
      if (payload.body) body = payload.body;
      if (payload.icon) options.icon = payload.icon;
      if (payload.badge) options.badge = payload.badge;
      if (payload.tag) options.tag = payload.tag;
      if (payload.data) options.data = { ...options.data, ...payload.data };
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  options.body = body;

  event.waitUntil(self.registration.showNotification(title, options));
});

// ==============================================================================
// 2. Notification Click Handler: Opens app or brings it to foreground
// ==============================================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const data = event.notification.data || {};
  let targetUrl = new URL(data.url || '/', self.location.origin);
  if (data.orderId) {
    targetUrl.searchParams.set('open_order', data.orderId);
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'KHOBZA_NOTIFICATION_CLICKED',
            title: event.notification.title,
            body: event.notification.body,
            data: data,
          });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl.href);
      }
    })
  );
});

// ==============================================================================
// 3. Message Event Listener (from active tabs or client scripts)
// ==============================================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, options } = event.data;
    self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/favicon.png',
      vibrate: [500, 200, 500, 200, 500, 200, 800],
      data: {
        title,
        body,
        url: '/',
        ...options,
      },
      tag: 'khobza-notif-' + Date.now(),
      renotify: true,
      requireInteraction: true,
    });
  }
});
