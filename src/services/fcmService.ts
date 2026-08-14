// Firebase Cloud Messaging (FCM) & Supabase Push Notification Service
// Provides real-time background push notifications for iOS Safari PWA & Android even when the app is closed.

import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { getSupabase } from './supabase';
import { playNotificationChimeSound, saveNotificationToHistory } from './notifications';
import { registerPushSubscription } from './pushService';

// Firebase Web Configuration from Environment
export const firebaseConfig = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || '',
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || '',
};

export const FCM_VAPID_KEY = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || '';

let messagingInstance: Messaging | null = null;

// Check if Firebase FCM is configured
export function isFcmConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId);
}

// Detect client platform
export function getDevicePlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) {
    return 'ios';
  }
  if (/android/i.test(userAgent)) {
    return 'android';
  }
  return 'desktop';
}

// Initialize FCM Messaging
export function getFcmMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (!isFcmConfigured()) return null;

  if (!messagingInstance) {
    try {
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      messagingInstance = getMessaging(app);
    } catch (err) {
      console.warn('Firebase Messaging init warning:', err);
      messagingInstance = null;
    }
  }
  return messagingInstance;
}

export interface FcmTokenRecord {
  token: string;
  userPhone?: string;
  role: 'family' | 'mandoub' | 'admin';
  vlanCode?: string;
  platform: 'ios' | 'android' | 'desktop';
  updatedAt: string;
}

// Request and Register FCM / Web Push Token
export async function registerFcmToken(
  userPhone?: string,
  role: 'family' | 'mandoub' | 'admin' = 'family',
  vlanCode?: string
): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    // 1. Request Browser Permission first
    if ('Notification' in window && Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission was not granted by user');
        return null;
      }
    }

    const platform = getDevicePlatform();
    let token: string | null = null;

    // 2. Try Firebase Cloud Messaging if configured
    const messaging = getFcmMessaging();
    if (messaging) {
      try {
        let swRegistration: ServiceWorkerRegistration | undefined = undefined;
        if ('serviceWorker' in navigator) {
          swRegistration = await navigator.serviceWorker.ready;
        }

        token = await getToken(messaging, {
          vapidKey: FCM_VAPID_KEY || undefined,
          serviceWorkerRegistration: swRegistration,
        });
      } catch (fcmErr) {
        console.warn('FCM getToken notice (falling back to standard Web Push):', fcmErr);
      }
    }

    // 3. Fallback: Register standard Web Push VAPID subscription
    await registerPushSubscription(userPhone, role, vlanCode).catch(() => {});

    if (token) {
      const record: FcmTokenRecord = {
        token,
        userPhone,
        role,
        vlanCode,
        platform,
        updatedAt: new Date().toISOString(),
      };

      // Save locally
      localStorage.setItem('khobza_fcm_token', token);

      // Save into Supabase fcm_tokens table
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('fcm_tokens').upsert(
          {
            token: record.token,
            user_phone: record.userPhone,
            role: record.role,
            vlan_code: record.vlanCode,
            platform: record.platform,
            updated_at: record.updatedAt,
          },
          { onConflict: 'token' }
        );
      }

      // Save to local backend
      try {
        await fetch('/api/fcm/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
      } catch (e) {}

      return token;
    }

    return null;
  } catch (err) {
    console.warn('registerFcmToken error:', err);
    return null;
  }
}

// Listen for Foreground FCM messages
export function setupForegroundFcmListener(onMessageCallback?: (payload: any) => void): () => void {
  const messaging = getFcmMessaging();
  if (!messaging) return () => {};

  try {
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[FCM Foreground Message Received]:', payload);

      const title = payload.notification?.title || payload.data?.title || 'إشعار من تطبيق الخبزة 🥖';
      const body = payload.notification?.body || payload.data?.body || '';

      playNotificationChimeSound(true);
      saveNotificationToHistory(title, body, {
        orderId: payload.data?.orderId,
        targetRole: (payload.data?.targetRole as any) || 'all',
      });

      if (onMessageCallback) {
        onMessageCallback(payload);
      }
    });

    return unsubscribe;
  } catch (e) {
    return () => {};
  }
}

// Send FCM Push notification via backend or Supabase Edge Function
export async function sendFcmNotification(payload: {
  title: string;
  body: string;
  targetPhone?: string;
  targetRole?: 'family' | 'mandoub' | 'admin' | 'all';
  vlanCode?: string;
  orderId?: string;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/fcm/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.warn('sendFcmNotification error:', err);
    return false;
  }
}
