// Firebase Cloud Messaging Service Worker for Khobza App
// Runs in background on Android & iOS (PWA / Web) even when app is fully closed

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Standard Firebase config - will be populated from client or environment
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "khobza-app.firebaseapp.com",
  projectId: "khobza-app",
  storageBucket: "khobza-app.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

try {
  if (firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
  const messaging = firebase.messaging();

  // Background Push Handler for FCM messages when app is closed
  messaging.onBackgroundMessage((payload) => {
    console.log('[FCM Service Worker] Received background message: ', payload);

    const notificationTitle = payload.notification?.title || payload.data?.title || 'تطبيق الخبزة 🥖';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || 'لديك إشعار جديد في تطبيق الخبزة',
      icon: '/icon-192.png',
      badge: '/favicon.png',
      vibrate: [500, 200, 500, 200, 500, 200, 800],
      tag: payload.data?.tag || 'khobza-fcm-' + Date.now(),
      renotify: true,
      requireInteraction: true,
      data: {
        url: payload.data?.url || '/',
        orderId: payload.data?.orderId,
        targetRole: payload.data?.targetRole,
        timestamp: Date.now(),
      },
      actions: [
        { action: 'open_app', title: 'فتح تطبيق الخبزة' },
        { action: 'close', title: 'إغلاق' },
      ],
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (e) {
  console.warn('[FCM Service Worker] Init notice:', e);
}

// Global Push fallback for standard Web Push & Supabase Edge Functions
self.addEventListener('push', (event) => {
  let title = 'تطبيق الخبزة 🥖';
  let body = 'لديك إشعار جديد';
  let data = { url: '/' };

  if (event.data) {
    try {
      const json = event.data.json();
      if (json.notification) {
        title = json.notification.title || title;
        body = json.notification.body || body;
      } else if (json.title) {
        title = json.title;
        body = json.body || body;
      }
      if (json.data) data = { ...data, ...json.data };
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  const options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/favicon.png',
    vibrate: [500, 200, 500, 200, 500, 200, 800],
    renotify: true,
    requireInteraction: true,
    data: data,
    actions: [
      { action: 'open_app', title: 'فتح التطبيق' },
      { action: 'close', title: 'إغلاق' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle Notification Click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'KHOBZA_NOTIFICATION_CLICKED',
            title: event.notification.title,
            body: event.notification.body,
            data: event.notification.data,
          });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
