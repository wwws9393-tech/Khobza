// Cloudflare Worker Push Gateway Integration Service
// Delivers fast, globally distributed push notifications to phones via Cloudflare Workers
// Guarantees reliable wakeup and notification display even when the app is completely closed

import { getSupabase } from './supabase';

export interface CloudflarePushPayload {
  title: string;
  body: string;
  targetRole?: 'family' | 'mandoub' | 'admin' | 'all';
  targetPhone?: string;
  orderId?: string;
  vlanCode?: string;
  url?: string;
  badge?: string;
  icon?: string;
}

// Read optional configured Cloudflare Worker URL or fallback to internal proxy
export function getCloudflareWorkerUrl(): string {
  if (typeof window !== 'undefined' && (window as any).__CLOUDFLARE_WORKER_URL__) {
    return (window as any).__CLOUDFLARE_WORKER_URL__;
  }
  const envUrl = (import.meta as any).env?.VITE_CLOUDFLARE_PUSH_WORKER_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim();
  }
  const saved = typeof window !== 'undefined' ? localStorage.getItem('khobza_cf_worker_url') : null;
  return saved || '/api/cloudflare/push';
}

// Send push notification directly through Cloudflare Edge Worker
export async function sendCloudflarePush(payload: CloudflarePushPayload): Promise<boolean> {
  const workerUrl = getCloudflareWorkerUrl();

  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Khobza-Source': 'Khobza-Client-PWA',
      },
      body: JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
        app: 'khobza-delivery',
      }),
    });

    if (response.ok) {
      console.log('⚡ [Cloudflare Push] Dispatched successfully via Edge Worker:', workerUrl);
      return true;
    } else {
      console.warn('⚠️ [Cloudflare Push] Worker responded with status:', response.status);
    }
  } catch (err) {
    console.warn('⚠️ [Cloudflare Push] Direct edge call failed, attempting backend fallback:', err);
  }

  // Fallback to internal server endpoint which forwards to subscribers
  try {
    const fallbackRes = await fetch('/api/cloudflare/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return fallbackRes.ok;
  } catch (e) {
    return false;
  }
}

// Save Cloudflare Worker URL in user settings
export function setCustomCloudflareWorkerUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (url && url.trim().length > 0) {
      localStorage.setItem('khobza_cf_worker_url', url.trim());
    } else {
      localStorage.removeItem('khobza_cf_worker_url');
    }
  }
}
