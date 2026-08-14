// Browser Native System Notification Service with Web Audio Sound Chime for Khobza App
import { getSavedSession } from './storage';
import { broadcastExternalPush } from './pushService';
import { sendFcmNotification } from './fcmService';
import { sendCloudflarePush } from './cloudflarePushService';

// Web Audio API Synthesizer for Loud Mobile Notification Chime Sound (Background only)
export function playNotificationChimeSound(force: boolean = false): void {
  try {
    // Only play chime sound if forced or if app is in background/hidden
    const isAppHidden = typeof document !== 'undefined' && (document.hidden || document.visibilityState !== 'visible');
    if (!force && !isAppHidden) {
      return;
    }

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // First Tone: High crisp bell (880 Hz - A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.6, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second Tone: Higher harmony bell (1760 Hz - A6) starting slightly delayed
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1760, now + 0.12);
    gain2.gain.setValueAtTime(0.8, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);

    // Third Tone: Warm base chime (523.25 Hz - C5)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(523.25, now + 0.12);
    gain3.gain.setValueAtTime(0.4, now + 0.12);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.12);
    osc3.stop(now + 0.7);
  } catch (err) {
    console.warn('Could not play notification audio chime:', err);
  }
}

export interface StoredNotification {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  orderId?: string;
  targetRole?: 'mandoub' | 'family' | 'admin' | 'all';
}

export function saveNotificationToHistory(
  title: string,
  body: string,
  options?: { orderId?: string; targetRole?: 'mandoub' | 'family' | 'admin' | 'all' }
): StoredNotification {
  const item: StoredNotification = {
    id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    title,
    body,
    timestamp: Date.now(),
    read: false,
    orderId: options?.orderId,
    targetRole: options?.targetRole || 'all',
  };

  try {
    // Save into history
    const existingHistoryStr = localStorage.getItem('khobza_notifications_history') || '[]';
    const history: StoredNotification[] = JSON.parse(existingHistoryStr);
    history.unshift(item);
    // Keep last 30 notifications
    localStorage.setItem('khobza_notifications_history', JSON.stringify(history.slice(0, 30)));
  } catch (e) {
    console.warn('Failed to save notification history:', e);
  }

  return item;
}

export function requestNotificationPermission(): Promise<PermissionState | 'default'> {
  return new Promise((resolve) => {
    try {
      if (!('Notification' in window)) {
        resolve('denied');
        return;
      }
      if (Notification.permission === 'granted') {
        resolve('granted');
        return;
      }

      const p = Notification.requestPermission((permission) => {
        resolve(permission as any);
      });

      if (p && typeof p.then === 'function') {
        p.then((permission) => {
          resolve(permission as any);
        }).catch(() => resolve('denied'));
      }
    } catch (err) {
      console.warn('Notification permission error:', err);
      resolve('denied');
    }
  });
}

export function sendBrowserNotification(
  title: string,
  body: string,
  options?: { orderId?: string; targetRole?: 'mandoub' | 'family' | 'admin' | 'all'; force?: boolean }
): void {
  // Always save notification to in-app history log
  const savedNotif = saveNotificationToHistory(title, body, options);

  // Check target role against active session role to avoid alerting wrong user (unless force is true)
  try {
    const session = getSavedSession();
    const isTargetMatch =
      !options?.targetRole ||
      options.targetRole === 'all' ||
      options.force === true ||
      (options.targetRole === 'mandoub' && session.role === 'mandoub') ||
      (options.targetRole === 'family' && session.role === 'customer') ||
      (options.targetRole === 'admin' && session.role === 'admin');

    if (!isTargetMatch) {
      return;
    }
  } catch (err) {}

  // Vibrate mobile phone hardware if supported (Android & compatible devices)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 800]);
    } catch (e) {}
  }

  // Play audio chime sound for Mandoub / family / admin on both Android & iOS
  playNotificationChimeSound(true);

  // Also dispatch in-app custom event for live modal/toast notifications
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('khobza_new_order_alert', {
          detail: { title, body, orderId: options?.orderId, notifId: savedNotif.id },
        })
      );
    } catch (e) {}
  }

  // Dispatch to external Cloudflare Edge, FCM & WebPush when app might be closed in background
  try {
    broadcastExternalPush({
      title,
      body,
      targetRole: options?.targetRole,
      orderId: options?.orderId,
    }).catch(() => {});
    sendFcmNotification({
      title,
      body,
      targetRole: options?.targetRole,
      orderId: options?.orderId,
    }).catch(() => {});
    sendCloudflarePush({
      title,
      body,
      targetRole: options?.targetRole,
      orderId: options?.orderId,
    }).catch(() => {});
  } catch (e) {}

  // Dispatch Native OS Mobile System Tray Notification (Android & iOS PWA Safari)
  try {
    if (!('Notification' in window)) return;

    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIos = /iPad|iPhone|iPod/.test(userAgent) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const dispatchNotif = (reg?: ServiceWorkerRegistration) => {
      const notifOptions: any = {
        body,
        icon: '/apple-touch-icon.png',
        badge: '/apple-touch-icon.png',
        tag: 'khobza-notif-' + savedNotif.id,
        renotify: true,
        requireInteraction: true,
        data: {
          title,
          body,
          url: '/',
          notifId: savedNotif.id,
          orderId: options?.orderId,
        },
      };

      // Omit vibrate array on iOS Safari to prevent TypeError constructor crash
      if (!isIos) {
        notifOptions.vibrate = [500, 200, 500, 200, 500, 200, 800];
      }

      if (reg && reg.showNotification) {
        try {
          reg.showNotification(title, notifOptions);
        } catch (e) {
          createWindowNotification(title, body, savedNotif);
        }
      } else {
        createWindowNotification(title, body, savedNotif);
      }
    };

    if (Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => dispatchNotif(reg))
          .catch(() => dispatchNotif());
      } else {
        dispatchNotif();
      }
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready
              .then((reg) => dispatchNotif(reg))
              .catch(() => dispatchNotif());
          } else {
            dispatchNotif();
          }
        }
      });
    }
  } catch (err) {
    console.warn('Failed to dispatch native browser notification:', err);
  }
}

function createWindowNotification(
  title: string,
  body: string,
  savedNotif: StoredNotification
): void {
  try {
    const notification = new Notification(title, {
      body,
      icon: '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png',
      tag: 'khobza-notif-' + savedNotif.id,
    });

    notification.onclick = () => {
      try {
        window.focus();
        notification.close();
      } catch (e) {}
    };
  } catch (err) {
    console.warn('window.Notification fallback failed:', err);
  }
}

// Global listener for notification clicked from phone system tray or URL query params
if (typeof window !== 'undefined') {
  // 1. Service Worker postMessage listener
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'KHOBZA_NOTIFICATION_CLICKED') {
        window.focus();
      }
    });
  }

  // 2. Check URL search params when app opens after tapping phone notification
  try {
    const params = new URLSearchParams(window.location.search);
    const title = params.get('notif_title');
    const body = params.get('notif_body');
    if (title || body) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (e) {}
}


