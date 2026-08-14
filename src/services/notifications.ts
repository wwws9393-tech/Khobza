// Browser Native System Notification Service with Web Audio Sound Chime for Khobza App
import { getSavedSession } from './storage';
import { sendCloudflarePush } from './cloudflarePushService';

// Web Audio API Synthesizer for Loud Mobile Notification Chime Sound
let lastChimePlayedTime = 0;

export function playNotificationChimeSound(force: boolean = false): void {
  try {
    const nowTime = Date.now();
    // Debounce chime so it doesn't overlap or spam if multiple calls occur within 1.5 seconds
    if (nowTime - lastChimePlayedTime < 1500 && !force) {
      return;
    }
    lastChimePlayedTime = nowTime;

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
    // Deduplicate history entry if same order was logged in last 10 seconds
    const isDup = history.some(
      (h) => (options?.orderId && h.orderId === options.orderId) || (h.title === title && Date.now() - h.timestamp < 10000)
    );
    if (!isDup) {
      history.unshift(item);
      localStorage.setItem('khobza_notifications_history', JSON.stringify(history.slice(0, 30)));
    }
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

// In-memory deduplication cache to prevent repeating identical notifications
const recentlyDispatchedAlerts = new Map<string, number>();

export function sendBrowserNotification(
  title: string,
  body: string,
  options?: {
    orderId?: string;
    targetRole?: 'mandoub' | 'family' | 'admin' | 'all';
    targetPhone?: string;
    vlanCode?: string;
    force?: boolean;
    skipPush?: boolean;
  }
): void {
  const dedupKey = options?.orderId ? `order_${options.orderId}` : `${title}_${body}`;
  const lastSent = recentlyDispatchedAlerts.get(dedupKey);
  const now = Date.now();

  // If identical notification was sent within 15 seconds, suppress duplicate
  if (lastSent && now - lastSent < 15000 && !options?.force) {
    return;
  }
  recentlyDispatchedAlerts.set(dedupKey, now);

  // Check target role and targetPhone against active session to avoid alerting wrong user locally
  let isTargetMatch = false;
  try {
    const session = getSavedSession();
    if (!options?.targetRole || options.targetRole === 'all') {
      isTargetMatch = true;
    } else if (options.targetRole === 'mandoub' && session.role === 'mandoub') {
      isTargetMatch = true;
    } else if (options.targetRole === 'family' && session.role === 'customer') {
      if (options.targetPhone && session.phone) {
        const p1 = session.phone.replace(/\D/g, '');
        const p2 = options.targetPhone.replace(/\D/g, '');
        isTargetMatch = !p1 || !p2 || p1 === p2 || p1.endsWith(p2) || p2.endsWith(p1);
      } else {
        isTargetMatch = true;
      }
    } else if (options.targetRole === 'admin' && session.role === 'admin') {
      isTargetMatch = true;
    }

    if (!isTargetMatch) {
      // Dispatch remote push notification to reach the intended recipient's device
      if (!options?.skipPush) {
        sendCloudflarePush({
          title,
          body,
          targetRole: options?.targetRole,
          targetPhone: options?.targetPhone,
          orderId: options?.orderId,
        }).catch(() => {});
      }
      // Suppress local sound, vibration, notification tray, and local alert on this device
      return;
    }
  } catch (err) {}

  // Save notification to history
  const savedNotif = saveNotificationToHistory(title, body, options);

  // Vibrate mobile phone hardware once
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([500, 200, 500, 200, 600]);
    } catch (e) {}
  }

  // Play audio chime once
  playNotificationChimeSound(false);

  // In-app alert event for live toast / badge
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('khobza_new_order_alert', {
          detail: { title, body, orderId: options?.orderId, notifId: savedNotif.id },
        })
      );
    } catch (e) {}
  }

  // Unified Single Cloudflare Push Gateway dispatch
  if (!options?.skipPush) {
    try {
      sendCloudflarePush({
        title,
        body,
        targetRole: options?.targetRole,
        orderId: options?.orderId,
      }).catch(() => {});
    } catch (e) {}
  }

  // Single OS Notification Tray Banner (PWA / Mobile browser)
  try {
    if (!('Notification' in window)) return;

    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIos = /iPad|iPhone|iPod/.test(userAgent) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const notifTag = options?.orderId ? `khobza-order-${options.orderId}` : 'khobza-unified-alert';

    const dispatchNotif = (reg?: ServiceWorkerRegistration) => {
      const notifOptions: any = {
        body,
        icon: '/apple-touch-icon.png',
        badge: '/apple-touch-icon.png',
        tag: notifTag,
        renotify: true,
        requireInteraction: false,
        data: {
          title,
          body,
          url: '/',
          notifId: savedNotif.id,
          orderId: options?.orderId,
        },
      };

      if (!isIos) {
        notifOptions.vibrate = [500, 200, 500, 200, 600];
      }

      if (reg && reg.showNotification) {
        try {
          reg.showNotification(title, notifOptions);
        } catch (e) {
          createWindowNotification(title, body, notifTag);
        }
      } else {
        createWindowNotification(title, body, notifTag);
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
    }
  } catch (err) {
    console.warn('Failed to dispatch native browser notification:', err);
  }
}

function createWindowNotification(
  title: string,
  body: string,
  tag: string
): void {
  try {
    const notification = new Notification(title, {
      body,
      icon: '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png',
      tag,
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


