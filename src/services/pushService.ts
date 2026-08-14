// Web Push & Background Mobile Push Notification Service
// Allows notifications to reach families and mandoubs even when the application is closed
import { getSupabase } from './supabase';
import { getSavedSession } from './storage';

// Public VAPID Key for Web Push (standard web push protocol)
export const VAPID_PUBLIC_KEY =
  'BCXN9G6zY6vV9X6L4zN0L2K7qJ4aB9Z3cQ5tY8wU1rE3pS6mA8dF2gH5jK7lN0vC4xZ8mQ1wE3rT5yU7iO9pL';

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  userPhone?: string;
  role: 'family' | 'mandoub' | 'admin';
  vlanCode?: string;
}

// Convert VAPID public key string to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function fetchVapidPublicKey(): Promise<string> {
  try {
    const res = await fetch('/api/push/vapid-public-key');
    if (res.ok) {
      const data = await res.json();
      if (data && data.publicKey) {
        return data.publicKey;
      }
    }
  } catch (e) {}
  return VAPID_PUBLIC_KEY;
}

// Register service worker and subscribe to real Web Push
export async function registerPushSubscription(
  userPhone?: string,
  role: 'family' | 'mandoub' | 'admin' = 'family',
  vlanCode?: string
): Promise<PushSubscriptionRecord | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported in this browser environment');
    return null;
  }

  try {
    // Check and request notification permission if not yet granted
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (e) {}
    }

    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      console.warn('Notification permission not granted for push subscription');
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    const activeVapidKey = await fetchVapidPublicKey();

    if (!subscription) {
      // Subscribe to Push
      try {
        const convertedKey = urlBase64ToUint8Array(activeVapidKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey,
        });
      } catch (subErr) {
        // Fallback without applicationServerKey if standard push server supports it
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
        }).catch(() => null);
      }
    }

    if (!subscription) {
      console.warn('Could not acquire PushSubscription from browser PushManager');
      return null;
    }

    const key = subscription.getKey ? subscription.getKey('p256dh') : null;
    const auth = subscription.getKey ? subscription.getKey('auth') : null;

    const p256dhStr = key ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(key)))) : '';
    const authStr = auth ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(auth)))) : '';

    const record: PushSubscriptionRecord = {
      endpoint: subscription.endpoint,
      p256dh: p256dhStr,
      auth: authStr,
      userPhone,
      role,
      vlanCode,
    };

    // Save locally
    localStorage.setItem('khobza_push_subscription', JSON.stringify(record));

    // Save to Supabase push_subscriptions table if connected
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from('push_subscriptions').upsert(
        {
          endpoint: record.endpoint,
          p256dh: record.p256dh,
          auth: record.auth,
          user_phone: record.userPhone,
          role: record.role,
          vlan_code: record.vlanCode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );
    }

    // Also push to local server endpoint
    try {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch (e) {}

    return record;
  } catch (err) {
    console.warn('Failed to register push subscription:', err);
    return null;
  }
}

// Broadcast external Push Notification to target roles / phones
export async function broadcastExternalPush(payload: {
  title: string;
  body: string;
  targetRole?: 'family' | 'mandoub' | 'admin' | 'all';
  targetPhone?: string;
  vlanCode?: string;
  orderId?: string;
}): Promise<void> {
  try {
    // 1. Send via local server endpoint
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});

    // 2. Direct Service Worker PostMessage wake-up ONLY if recipient matches this device
    const session = getSavedSession();
    const isTargetMatch =
      !payload.targetRole ||
      payload.targetRole === 'all' ||
      (payload.targetRole === 'mandoub' && session.role === 'mandoub') ||
      (payload.targetRole === 'family' && session.role === 'customer') ||
      (payload.targetRole === 'admin' && session.role === 'admin');

    if (isTargetMatch && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        title: payload.title,
        body: payload.body,
        options: {
          orderId: payload.orderId,
          targetRole: payload.targetRole,
        },
      });
    }
  } catch (err) {
    console.warn('broadcastExternalPush error:', err);
  }
}
