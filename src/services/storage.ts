import {
  AccountingSummary,
  AdminUser,
  Family,
  LocationData,
  Mandoub,
  Order,
  OrderStatus,
  OrderType,
  PackageType,
  RenewalRequest,
  RenewalStatus,
  StatisticsData,
  TimeSlot,
  UserRole,
} from '../types';
import {
  INITIAL_ADMINS,
  INITIAL_BLOCKED_PHONES,
  INITIAL_FAMILIES,
  INITIAL_MANDOUBS,
  INITIAL_ORDERS,
} from '../data/initialSeed';
import { sendBrowserNotification } from './notifications';
import {
  isSupabaseConfigured,
  fetchAllFromSupabase,
  pushAllToSupabase,
  fetchFamilyByPhoneFromSupabase,
  upsertFamilyToSupabase,
  deleteFamilyFromSupabase,
  updateFamilyLocationInSupabase,
  upsertMandoubToSupabase,
  deleteMandoubFromSupabase,
  updateMandoubLocationInSupabase,
  upsertOrderToSupabase,
  deleteOrderFromSupabase,
  upsertRenewalToSupabase,
  upsertAdminToSupabase,
  deleteAdminFromSupabase,
  upsertBlockedPhoneToSupabase,
  deleteBlockedPhoneFromSupabase,
  clearAllSupabaseTables,
  saveVersionConfigToSupabase,
  subscribeToSupabaseRealtime,
} from './supabase';
import { broadcastExternalPush } from './pushService';

const KEYS = {
  FAMILIES: 'khobza_families_v2',
  MANDOUBS: 'khobza_mandoubs_v2',
  ADMINS: 'khobza_admins_v2',
  ORDERS: 'khobza_orders_v2',
  BLOCKED_PHONES: 'khobza_blocked_phones_v2',
  SESSION: 'khobza_session_v2',
  RENEWALS: 'khobza_renewals_v2',
};

// Universal VLAN & Area Normalization Helper
export function normalizeVlanCode(code: string | undefined | null): string {
  if (!code) return '';
  return normalizeDigits(String(code))
    .trim()
    .toUpperCase()
    .replace(/[\s\-_/\\,.]+/g, '');
}

export function isVlanMatching(
  vlanA: string | undefined | null,
  vlanB: string | undefined | null
): boolean {
  if (!vlanA || !vlanB) return false;
  const rawA = normalizeDigits(String(vlanA)).trim().toLowerCase();
  const rawB = normalizeDigits(String(vlanB)).trim().toLowerCase();
  if (rawA === rawB) return true;

  // Remove whitespace and separators
  const cleanA = rawA.replace(/[\s\-_/\\,.]+/g, '');
  const cleanB = rawB.replace(/[\s\-_/\\,.]+/g, '');
  if (cleanA === cleanB) return true;

  // Extract digits for numeric matching (e.g. "101" vs "VLAN101" or "الكرادة 101")
  const digitsA = rawA.replace(/\D/g, '');
  const digitsB = rawB.replace(/\D/g, '');
  if (digitsA && digitsB) {
    if (digitsA === digitsB) return true;
    if (cleanA.endsWith(digitsB) || cleanB.endsWith(digitsA)) return true;
  }

  // Remove common prefixes
  const simplify = (s: string) =>
    s
      .replace(/^vlan/i, '')
      .replace(/^منطقة\s*/i, '')
      .replace(/^حي\s*/i, '')
      .replace(/^مكتب\s*/i, '')
      .replace(/[\s\-_/\\,.]+/g, '')
      .trim();

  const simpA = simplify(rawA);
  const simpB = simplify(rawB);
  if (simpA && simpB && simpA === simpB) return true;

  // Substring matching for descriptive area / vlan names
  if (simpA.length >= 3 && simpB.length >= 3) {
    if (simpA.includes(simpB) || simpB.includes(simpA)) return true;
  }
  if (cleanA.length >= 3 && cleanB.length >= 3) {
    if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
  }

  return false;
}

// Universal matcher for Orders and Renewal Requests to Mandoub
export function isOrderMatchedToMandoub(
  order: { vlanCode?: string; areaName?: string; mandoubId?: string; mandoubName?: string },
  mandoub: Mandoub,
  allMandoubs?: Mandoub[]
): boolean {
  if (!mandoub) return false;

  // 1. Explicit ID match
  if (order.mandoubId && order.mandoubId === mandoub.id) return true;

  // 2. Explicit name match
  if (order.mandoubName && mandoub.name && order.mandoubName.trim() === mandoub.name.trim()) return true;

  // 3. Single active mandoub in system -> receives all orders
  const activeMandoubs = (allMandoubs || getMandoubs()).filter((m) => !m.status || m.status === 'active');
  if (activeMandoubs.length <= 1) return true;

  // 4. VLAN Code match
  if (isVlanMatching(order.vlanCode, mandoub.vlanCode)) return true;

  // 5. Area Name match
  if (isVlanMatching(order.areaName, mandoub.areaName)) return true;

  // 6. Cross VLAN / Area match (e.g. order.vlanCode matches mandoub.areaName or order.areaName matches mandoub.vlanCode)
  if (isVlanMatching(order.vlanCode, mandoub.areaName)) return true;
  if (isVlanMatching(order.areaName, mandoub.vlanCode)) return true;

  // 7. If order is not explicitly assigned to another mandoub, allow active mandoubs in default/unassigned coverage
  if (!order.mandoubId && (!order.vlanCode || order.vlanCode === 'vlan1' || !mandoub.vlanCode)) {
    return true;
  }

  return false;
}

// Helper: safe JSON parse
function getStorage<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (err) {
    console.error(`Error reading ${key} from storage:`, err);
    return fallback;
  }
}

function mergeArraysById<T extends { id: string }>(arr1: T[], arr2: T[]): T[] {
  const map = new Map<string, T>();
  if (Array.isArray(arr1)) {
    for (const item of arr1) {
      if (item && item.id) map.set(item.id, item);
    }
  }
  if (Array.isArray(arr2)) {
    for (const item of arr2) {
      if (item && item.id) {
        const existing = map.get(item.id);
        if (existing) {
          const existingTime = (existing as any).updatedAt || (existing as any).createdAt || '';
          const itemTime = (item as any).updatedAt || (item as any).createdAt || '';
          
          const getStatusWeight = (st: string) => {
            if (st === 'completed_confirmed' || st === 'unpaid_confirmed') return 5;
            if (st === 'processing_unpaid') return 4;
            if (st === 'under_review') return 3;
            if (st === 'pending') return 1;
            return 0;
          };

          const existingWeight = getStatusWeight((existing as any).status || '');
          const itemWeight = getStatusWeight((item as any).status || '');

          if (itemWeight > existingWeight) {
            map.set(item.id, { ...existing, ...item });
          } else if (existingWeight > itemWeight) {
            map.set(item.id, { ...item, ...existing });
          } else if (itemTime >= existingTime) {
            map.set(item.id, { ...existing, ...item });
          } else {
            map.set(item.id, { ...item, ...existing });
          }
        } else {
          map.set(item.id, item);
        }
      }
    }
  }
  return Array.from(map.values());
}

export function normalizeDigits(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .trim();
}

export function normalizeIraqiPhone(raw: string): string {
  if (!raw) return '';
  let d = normalizeDigits(raw).replace(/\D/g, '');
  if (d.startsWith('00964')) d = d.slice(5);
  if (d.startsWith('964')) d = d.slice(3);
  if (d.length === 10 && d.startsWith('7')) d = '0' + d;
  return d;
}

let lastMutationTime = 0;

export async function pushToServer(action: 'merge' | 'overwrite' | 'admin_reset' = 'merge'): Promise<void> {
  try {
    lastMutationTime = Date.now();
    const families = getStorage(KEYS.FAMILIES, INITIAL_FAMILIES);
    const mandoubs = getStorage(KEYS.MANDOUBS, INITIAL_MANDOUBS);
    const admins = getStorage(KEYS.ADMINS, INITIAL_ADMINS);
    const orders = getStorage(KEYS.ORDERS, INITIAL_ORDERS);
    const renewals = getStorage(KEYS.RENEWALS, []);
    const blockedPhones = getStorage(KEYS.BLOCKED_PHONES, INITIAL_BLOCKED_PHONES);

    const payload = {
      action,
      families,
      mandoubs,
      admins,
      orders,
      renewals,
      blockedPhones,
    };

    // 1. Push to Supabase if configured
    if (isSupabaseConfigured()) {
      if (action === 'admin_reset') {
        clearAllSupabaseTables().catch(() => {});
      } else {
        pushAllToSupabase({ families, mandoubs, admins, orders, renewals, blockedPhones }).catch(() => {});
      }
    }

    // 2. Push to local Express DB
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    lastMutationTime = Date.now();
  } catch (err) {
    // Silent catch for offline or static environments
  }
}

export async function syncWithServer(force = false): Promise<void> {
  // Rapid sync settling - wait 1500ms after a local mutation to allow pushToServer to settle unless forced
  if (!force && Date.now() - lastMutationTime < 1500) {
    return;
  }

  try {
    // Check Supabase first if configured
    if (isSupabaseConfigured()) {
      const supaData = await fetchAllFromSupabase();
      if (supaData) {
        let changed = false;
        if (Array.isArray(supaData.families)) {
          const current = localStorage.getItem(KEYS.FAMILIES);
          const next = JSON.stringify(supaData.families);
          if (current !== next) {
            localStorage.setItem(KEYS.FAMILIES, next);
            changed = true;
          }
        }
        if (Array.isArray(supaData.mandoubs)) {
          const current = localStorage.getItem(KEYS.MANDOUBS);
          const next = JSON.stringify(supaData.mandoubs);
          if (current !== next) {
            localStorage.setItem(KEYS.MANDOUBS, next);
            changed = true;
          }
        }
        if (Array.isArray(supaData.orders)) {
          const current = localStorage.getItem(KEYS.ORDERS);
          const next = JSON.stringify(supaData.orders);
          if (current !== next) {
            localStorage.setItem(KEYS.ORDERS, next);
            changed = true;
          }
        }
        if (Array.isArray(supaData.renewals)) {
          const current = localStorage.getItem(KEYS.RENEWALS);
          const next = JSON.stringify(supaData.renewals);
          if (current !== next) {
            localStorage.setItem(KEYS.RENEWALS, next);
            changed = true;
          }
        }
        if (Array.isArray(supaData.admins) && supaData.admins.length > 0) {
          const current = localStorage.getItem(KEYS.ADMINS);
          const next = JSON.stringify(supaData.admins);
          if (current !== next) {
            localStorage.setItem(KEYS.ADMINS, next);
            changed = true;
          }
        }
        if (Array.isArray(supaData.blockedPhones)) {
          const current = localStorage.getItem(KEYS.BLOCKED_PHONES);
          const next = JSON.stringify(supaData.blockedPhones);
          if (current !== next) {
            localStorage.setItem(KEYS.BLOCKED_PHONES, next);
            changed = true;
          }
        }
        if (changed) {
          window.dispatchEvent(new Event('khobza_data_change'));
        }
        return;
      }
    }

    // Sync with local backend with timestamp cache-buster
    const res = await fetch(`/api/db?t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data === 'object') {
      let changed = false;

      // Sync families (authoritative server list)
      if (Array.isArray(data.families)) {
        const serverStr = JSON.stringify(data.families);
        if (serverStr !== localStorage.getItem(KEYS.FAMILIES)) {
          localStorage.setItem(KEYS.FAMILIES, serverStr);
          changed = true;
        }
      }

      // Sync mandoubs (authoritative server list)
      if (Array.isArray(data.mandoubs)) {
        const serverStr = JSON.stringify(data.mandoubs);
        if (serverStr !== localStorage.getItem(KEYS.MANDOUBS)) {
          localStorage.setItem(KEYS.MANDOUBS, serverStr);
          changed = true;
        }
      }

      // Sync admins
      if (Array.isArray(data.admins) && data.admins.length > 0) {
        const serverStr = JSON.stringify(data.admins);
        if (serverStr !== localStorage.getItem(KEYS.ADMINS)) {
          localStorage.setItem(KEYS.ADMINS, serverStr);
          changed = true;
        }
      }

      // Sync orders (authoritative server list)
      if (Array.isArray(data.orders)) {
        const serverStr = JSON.stringify(data.orders);
        if (serverStr !== localStorage.getItem(KEYS.ORDERS)) {
          localStorage.setItem(KEYS.ORDERS, serverStr);
          changed = true;
        }
      }

      // Sync renewals
      if (Array.isArray(data.renewals)) {
        const serverStr = JSON.stringify(data.renewals);
        if (serverStr !== localStorage.getItem(KEYS.RENEWALS)) {
          localStorage.setItem(KEYS.RENEWALS, serverStr);
          changed = true;
        }
      }

      // Sync blocked phones
      if (Array.isArray(data.blockedPhones)) {
        const serverStr = JSON.stringify(data.blockedPhones);
        if (serverStr !== localStorage.getItem(KEYS.BLOCKED_PHONES)) {
          localStorage.setItem(KEYS.BLOCKED_PHONES, serverStr);
          changed = true;
        }
      }

      if (changed) {
        window.dispatchEvent(new Event('khobza_data_change'));
      }
    }
  } catch (err) {
    // Offline mode
  }
}

function setStorage<T>(key: string, value: T, action: 'merge' | 'overwrite' | 'admin_reset' = 'merge'): void {
  try {
    lastMutationTime = Date.now();
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event('khobza_data_change'));
    pushToServer(action);
  } catch (err) {
    console.error(`Error saving ${key} to storage:`, err);
  }
}

let autoSyncInterval: any = null;
let realtimeUnsubscribe: (() => void) | null = null;
let sseConnection: EventSource | null = null;

// Verify whether the currently active logged-in session is still valid in the cloud database
export function verifyCurrentActiveSession(): { valid: boolean; reason?: string } {
  const session = getSavedSession();
  if (session.role === 'guest') {
    return { valid: true };
  }

  if (session.role === 'customer') {
    const families = getFamilies();
    const fam = families.find((f) => f.phone === session.phone || (session.familyId && f.id === session.familyId));
    if (!fam) {
      clearSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('khobza_session_terminated', { detail: { reason: 'account_deleted' } }));
      }
      return { valid: false, reason: 'حساب العائلة غير مسجل أو تم حذفه من قبل الإدارة' };
    }
    if (fam.isBlocked) {
      clearSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('khobza_session_terminated', { detail: { reason: 'account_blocked' } }));
      }
      return { valid: false, reason: 'تم حظر حساب العائلة من قبل الإدارة' };
    }
    return { valid: true };
  }

  if (session.role === 'mandoub') {
    const mandoubs = getMandoubs();
    const mandoub = mandoubs.find((m) => m.id === session.mandoubId);
    if (!mandoub) {
      clearSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('khobza_session_terminated', { detail: { reason: 'account_deleted' } }));
      }
      return { valid: false, reason: 'حساب المندوب غير مسجل أو تم حذفه من قبل الإدارة' };
    }
    if (mandoub.status === 'disabled' || mandoub.status === 'inactive') {
      clearSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('khobza_session_terminated', { detail: { reason: 'account_disabled' } }));
      }
      return { valid: false, reason: 'تم تعطيل حساب المندوب من قبل الإدارة' };
    }
    return { valid: true };
  }

  if (session.role === 'admin') {
    const admins = getAdminAccounts();
    const admin = admins.find((a) => a.id === session.adminId);
    if (!admin && admins.length > 0 && session.adminId !== 'admin-main') {
      clearSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('khobza_session_terminated', { detail: { reason: 'account_deleted' } }));
      }
      return { valid: false, reason: 'حساب المشرف غير موجود' };
    }
    return { valid: true };
  }

  return { valid: true };
}

// Initialize data and sync with cloud backend
export function initializeAppData(): void {
  // Never populate client-side dummy accounts if key is missing; keep clean empty arrays
  if (localStorage.getItem(KEYS.FAMILIES) === null) {
    localStorage.setItem(KEYS.FAMILIES, JSON.stringify([]));
  }
  if (localStorage.getItem(KEYS.MANDOUBS) === null) {
    localStorage.setItem(KEYS.MANDOUBS, JSON.stringify([]));
  }
  if (localStorage.getItem(KEYS.ADMINS) === null) {
    localStorage.setItem(KEYS.ADMINS, JSON.stringify(INITIAL_ADMINS));
  }
  if (localStorage.getItem(KEYS.ORDERS) === null) {
    localStorage.setItem(KEYS.ORDERS, JSON.stringify([]));
  }
  if (localStorage.getItem(KEYS.BLOCKED_PHONES) === null) {
    localStorage.setItem(KEYS.BLOCKED_PHONES, JSON.stringify([]));
  }

  // Trigger sync with server database immediately
  syncWithServer(true);

  // Connect to SSE stream for zero-delay instant synchronization across all devices
  if (typeof window !== 'undefined' && 'EventSource' in window && !sseConnection) {
    try {
      const sse = new EventSource('/api/events');
      sseConnection = sse;
      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'DB_MUTATION' || data.type === 'NOTIFICATION_PUSH') {
            // Instant handling for Admin Reset
            if (data.action === 'admin_reset') {
              localStorage.setItem(KEYS.FAMILIES, JSON.stringify([]));
              localStorage.setItem(KEYS.MANDOUBS, JSON.stringify([]));
              localStorage.setItem(KEYS.ORDERS, JSON.stringify([]));
              localStorage.setItem(KEYS.RENEWALS, JSON.stringify([]));
              localStorage.setItem(KEYS.BLOCKED_PHONES, JSON.stringify([]));
              const currentSession = getSavedSession();
              if (currentSession.role !== 'admin') {
                clearSession();
                window.dispatchEvent(new CustomEvent('khobza_session_terminated', { detail: { reason: 'admin_reset' } }));
              }
              window.dispatchEvent(new Event('khobza_data_change'));
              return;
            }

            // Instant handling for Family Deletion
            if (data.entity === 'families' && data.action === 'delete') {
              const localFamilies = getFamilies().filter((f) => f.id !== data.id && f.phone !== data.phone);
              localStorage.setItem(KEYS.FAMILIES, JSON.stringify(localFamilies));
              const currentSession = getSavedSession();
              if (currentSession.role === 'customer') {
                if (data.id === currentSession.familyId || data.phone === currentSession.phone || !localFamilies.some(f => f.phone === currentSession.phone)) {
                  clearSession();
                  window.dispatchEvent(new CustomEvent('khobza_session_terminated', { detail: { reason: 'account_deleted' } }));
                }
              }
              window.dispatchEvent(new Event('khobza_data_change'));
            }

            // Instant handling for Mandoub Deletion
            if (data.entity === 'mandoubs' && data.action === 'delete') {
              const localMandoubs = getMandoubs().filter((m) => m.id !== data.id && m.username !== data.username);
              localStorage.setItem(KEYS.MANDOUBS, JSON.stringify(localMandoubs));
              const currentSession = getSavedSession();
              if (currentSession.role === 'mandoub') {
                if (data.id === currentSession.mandoubId || !localMandoubs.some(m => m.id === currentSession.mandoubId)) {
                  clearSession();
                  window.dispatchEvent(new CustomEvent('khobza_session_terminated', { detail: { reason: 'account_deleted' } }));
                }
              }
              window.dispatchEvent(new Event('khobza_data_change'));
            }

            // Apply immediate delta for save
            if (data.entity === 'families' && data.action === 'save' && data.family) {
              const localFamilies = getFamilies();
              const idx = localFamilies.findIndex((f) => f.id === data.family.id || f.phone === data.family.phone);
              if (idx >= 0) {
                localFamilies[idx] = { ...localFamilies[idx], ...data.family };
              } else {
                localFamilies.push(data.family);
              }
              localStorage.setItem(KEYS.FAMILIES, JSON.stringify(localFamilies));
              window.dispatchEvent(new Event('khobza_data_change'));
            } else if (data.entity === 'mandoubs' && data.action === 'save' && data.mandoub) {
              const localMandoubs = getMandoubs();
              const idx = localMandoubs.findIndex((m) => m.id === data.mandoub.id || m.username === data.mandoub.username);
              if (idx >= 0) {
                localMandoubs[idx] = { ...localMandoubs[idx], ...data.mandoub };
              } else {
                localMandoubs.push(data.mandoub);
              }
              localStorage.setItem(KEYS.MANDOUBS, JSON.stringify(localMandoubs));
              window.dispatchEvent(new Event('khobza_data_change'));
            } else if (data.entity === 'orders' && (data.action === 'save' || data.action === 'status_update') && data.order) {
              const localOrders = getOrders();
              const idx = localOrders.findIndex((o) => o.id === data.order.id);
              if (idx >= 0) {
                localOrders[idx] = { ...localOrders[idx], ...data.order };
              } else {
                localOrders.unshift(data.order);
              }
              localStorage.setItem(KEYS.ORDERS, JSON.stringify(localOrders));
              window.dispatchEvent(new Event('khobza_data_change'));
            } else if (data.entity === 'orders' && data.action === 'delete') {
              const localOrders = getOrders().filter((o) => o.id !== data.id);
              localStorage.setItem(KEYS.ORDERS, JSON.stringify(localOrders));
              window.dispatchEvent(new Event('khobza_data_change'));
            } else if (data.entity === 'renewals' && data.action === 'save' && data.renewal) {
              const localRenewals = getRenewalRequests();
              const idx = localRenewals.findIndex((r) => r.id === data.renewal.id);
              if (idx >= 0) {
                localRenewals[idx] = { ...localRenewals[idx], ...data.renewal };
              } else {
                localRenewals.unshift(data.renewal);
              }
              localStorage.setItem(KEYS.RENEWALS, JSON.stringify(localRenewals));
              window.dispatchEvent(new Event('khobza_data_change'));
            } else if (data.entity === 'renewals' && data.action === 'delete') {
              const localRenewals = getRenewalRequests().filter((r) => r.id !== data.id);
              localStorage.setItem(KEYS.RENEWALS, JSON.stringify(localRenewals));
              window.dispatchEvent(new Event('khobza_data_change'));
            }

            syncWithServer(true);
          }
        } catch (e) {}
      };
      sse.onerror = () => {
        // SSE handles reconnection automatically
      };
    } catch (e) {}
  }

  // Subscribe to Supabase realtime changes
  if (!realtimeUnsubscribe && isSupabaseConfigured()) {
    realtimeUnsubscribe = subscribeToSupabaseRealtime(() => {
      syncWithServer(true);
    });
  }

  if (!autoSyncInterval && typeof window !== 'undefined') {
    autoSyncInterval = setInterval(() => {
      syncWithServer();
      verifyCurrentActiveSession();
    }, 2000);
  }
}

// Reset ALL data (families, mandoubs, orders, renewals, history, blocked phones) except Admins
export async function resetDatabaseExceptAdmins(): Promise<void> {
  localStorage.setItem(KEYS.FAMILIES, JSON.stringify([]));
  localStorage.setItem(KEYS.MANDOUBS, JSON.stringify([]));
  localStorage.setItem(KEYS.RENEWALS, JSON.stringify([]));
  localStorage.setItem(KEYS.BLOCKED_PHONES, JSON.stringify([]));
  localStorage.setItem(KEYS.ORDERS, JSON.stringify([]));

  // Clear customer or mandoub session if active
  const session = getSavedSession();
  if (session.role !== 'admin') {
    clearSession();
  }

  // Clear Supabase tables directly
  if (isSupabaseConfigured()) {
    try {
      await clearAllSupabaseTables();
    } catch (err) {
      console.warn('Supabase tables clear warning:', err);
    }
  }

  // Notify backend with explicit admin_reset action
  if (typeof fetch !== 'undefined') {
    try {
      await fetch('/api/db/reset', { method: 'POST' });
    } catch (err) {
      console.warn('Server reset endpoint fetch warning:', err);
    }
  }

  pushToServer('admin_reset');
  window.dispatchEvent(new Event('khobza_data_change'));
}

// Safe Official Stable Checkpoint Definition v1.0.5
export const SAFE_CHECKPOINT_V105 = {
  restorePointName: 'نقطة الاسترجاع الآمنة السحابية المعتمدة v1.0.5',
  appName: 'Khobza Cloud Safe Checkpoint',
  version: '1.0.5',
  isOfficial: true,
  createdAt: new Date().toISOString(),
  admins: INITIAL_ADMINS,
  versionConfig: {
    currentVersion: '1.0.5',
    latestVersion: '1.0.5',
    isMandatory: false,
    releaseNotes: 'نقطة الاسترجاع السحابية الآمنة المعتمدة v1.0.5 - تفعيل استلام الإشعارات والتطبيق مغلق تماماً للمندوب والعائلة ومزامنة سحابية مستقرة.',
    releasedAt: new Date().toISOString(),
  },
};

// Restore Official Stable Checkpoint v1.0.5
export function restoreOfficialPointV105(): boolean {
  try {
    const checkpoint = {
      families: [],
      mandoubs: [],
      admins: getAdminAccounts().length > 0 ? getAdminAccounts() : INITIAL_ADMINS,
      orders: [],
      renewals: [],
      blockedPhones: [],
      versionConfig: SAFE_CHECKPOINT_V105.versionConfig,
    };

    localStorage.setItem(KEYS.FAMILIES, JSON.stringify(checkpoint.families));
    localStorage.setItem(KEYS.MANDOUBS, JSON.stringify(checkpoint.mandoubs));
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(checkpoint.orders));
    localStorage.setItem(KEYS.RENEWALS, JSON.stringify(checkpoint.renewals));
    localStorage.setItem(KEYS.BLOCKED_PHONES, JSON.stringify(checkpoint.blockedPhones));
    localStorage.setItem('khobza_version_config_v1', JSON.stringify(checkpoint.versionConfig));

    if (isSupabaseConfigured()) {
      clearAllSupabaseTables().catch(() => {});
      saveVersionConfigToSupabase(checkpoint.versionConfig).catch(() => {});
    }

    pushToServer('overwrite');
    if (typeof fetch !== 'undefined') {
      fetch('/api/db/restore-v105final', { method: 'POST' }).catch(() => {});
    }

    window.dispatchEvent(new Event('khobza_data_change'));
    window.dispatchEvent(new Event('khobza_version_change'));
    return true;
  } catch (err) {
    console.error('Failed to restore checkpoint v1.0.5:', err);
    return false;
  }
}

// Safe Official Stable Checkpoint Definition v1.0.4
export const SAFE_CHECKPOINT_V104 = {
  restorePointName: 'نقطة الاسترجاع الآمنة السحابية المعتمدة v1.0.4.final',
  appName: 'Khobza Cloud Safe Checkpoint',
  version: '1.0.4',
  isOfficial: true,
  createdAt: new Date().toISOString(),
  admins: INITIAL_ADMINS,
  versionConfig: {
    currentVersion: '1.0.4',
    latestVersion: '1.0.4',
    isMandatory: false,
    releaseNotes: 'نقطة الاسترجاع السحابية الآمنة المعتمدة v1.0.4.final - استقرار شامل لقاعدة بيانات Supabase، مطابقة الـ VLAN، وتحديثات المندوبين وحسابات الاشتراكات بدون أي خلل.',
    releasedAt: new Date().toISOString(),
  },
};

// Restore Official Stable Checkpoint v1.0.4.final
export function restoreOfficialPointV104Final(): boolean {
  try {
    const checkpoint = {
      families: [],
      mandoubs: [],
      admins: getAdminAccounts().length > 0 ? getAdminAccounts() : INITIAL_ADMINS,
      orders: [],
      renewals: [],
      blockedPhones: [],
      versionConfig: SAFE_CHECKPOINT_V104.versionConfig,
    };

    localStorage.setItem(KEYS.FAMILIES, JSON.stringify(checkpoint.families));
    localStorage.setItem(KEYS.MANDOUBS, JSON.stringify(checkpoint.mandoubs));
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(checkpoint.orders));
    localStorage.setItem(KEYS.RENEWALS, JSON.stringify(checkpoint.renewals));
    localStorage.setItem(KEYS.BLOCKED_PHONES, JSON.stringify(checkpoint.blockedPhones));
    localStorage.setItem('khobza_version_config_v1', JSON.stringify(checkpoint.versionConfig));

    if (isSupabaseConfigured()) {
      clearAllSupabaseTables().catch(() => {});
      saveVersionConfigToSupabase(checkpoint.versionConfig).catch(() => {});
    }

    pushToServer('overwrite');
    if (typeof fetch !== 'undefined') {
      fetch('/api/db/restore-v104final', { method: 'POST' }).catch(() => {});
    }

    window.dispatchEvent(new Event('khobza_data_change'));
    window.dispatchEvent(new Event('khobza_version_change'));
    return true;
  } catch (err) {
    console.error('Failed to restore checkpoint v1.0.4.final:', err);
    return false;
  }
}

export function restoreOfficialPointV104Screen(): boolean {
  return restoreOfficialPointV104Final();
}

// Export complete database backup as JSON (from local & cloud)
export function exportDatabaseJSON(): string {
  const data = {
    appName: 'Khobza App Cloud Backup',
    version: '2.1.0',
    exportedAt: new Date().toISOString(),
    families: getStorage(KEYS.FAMILIES, []),
    mandoubs: getStorage(KEYS.MANDOUBS, []),
    admins: getStorage(KEYS.ADMINS, []),
    orders: getStorage(KEYS.ORDERS, []),
    renewals: getStorage(KEYS.RENEWALS, []),
    blockedPhones: getStorage(KEYS.BLOCKED_PHONES, []),
    versionConfig: localStorage.getItem('khobza_version_config_v1'),
  };
  return JSON.stringify(data, null, 2);
}

// Import database backup from JSON and restore to local & Supabase Cloud
export function importDatabaseJSON(jsonStr: string): boolean {
  try {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== 'object') return false;

    const families = Array.isArray(data.families) ? data.families : [];
    const mandoubs = Array.isArray(data.mandoubs) ? data.mandoubs : [];
    const admins = Array.isArray(data.admins) && data.admins.length > 0 ? data.admins : getAdminAccounts();
    const orders = Array.isArray(data.orders) ? data.orders : [];
    const renewals = Array.isArray(data.renewals) ? data.renewals : [];
    const blockedPhones = Array.isArray(data.blockedPhones) ? data.blockedPhones : [];

    localStorage.setItem(KEYS.FAMILIES, JSON.stringify(families));
    localStorage.setItem(KEYS.MANDOUBS, JSON.stringify(mandoubs));
    localStorage.setItem(KEYS.ADMINS, JSON.stringify(admins));
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
    localStorage.setItem(KEYS.RENEWALS, JSON.stringify(renewals));
    localStorage.setItem(KEYS.BLOCKED_PHONES, JSON.stringify(blockedPhones));

    if (data.versionConfig) {
      localStorage.setItem(
        'khobza_version_config_v1',
        typeof data.versionConfig === 'string' ? data.versionConfig : JSON.stringify(data.versionConfig)
      );
    }

    // Push all imported tables directly to Supabase
    if (isSupabaseConfigured()) {
      pushAllToSupabase({
        families,
        mandoubs,
        admins,
        orders,
        renewals,
        blockedPhones,
        versionConfig: data.versionConfig,
      }).catch(() => {});
    }

    pushToServer('overwrite');
    window.dispatchEvent(new Event('khobza_data_change'));
    window.dispatchEvent(new Event('khobza_version_change'));
    return true;
  } catch (err) {
    console.error('Failed to import backup:', err);
    return false;
  }
}

// Reset data to seed (Admin tool)
export function resetToDefaultSeed(): void {
  localStorage.setItem(KEYS.FAMILIES, JSON.stringify(INITIAL_FAMILIES));
  localStorage.setItem(KEYS.MANDOUBS, JSON.stringify(INITIAL_MANDOUBS));
  localStorage.setItem(KEYS.ADMINS, JSON.stringify(INITIAL_ADMINS));
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(INITIAL_ORDERS));
  localStorage.setItem(KEYS.BLOCKED_PHONES, JSON.stringify(INITIAL_BLOCKED_PHONES));

  if (isSupabaseConfigured()) {
    pushAllToSupabase({
      families: INITIAL_FAMILIES,
      mandoubs: INITIAL_MANDOUBS,
      admins: INITIAL_ADMINS,
      orders: INITIAL_ORDERS,
      blockedPhones: INITIAL_BLOCKED_PHONES,
    }).catch(() => {});
  }

  pushToServer('overwrite');
  window.dispatchEvent(new Event('khobza_data_change'));
}

// --- Session Management ---
export interface SavedSession {
  role: UserRole;
  phone?: string;
  familyId?: string;
  mandoubId?: string;
  adminId?: string;
}

export function getSavedSession(): SavedSession {
  return getStorage<SavedSession>(KEYS.SESSION, { role: 'guest' });
}

export function saveSession(session: SavedSession): void {
  setStorage(KEYS.SESSION, session);
}

export function clearSession(): void {
  setStorage(KEYS.SESSION, { role: 'guest' });
}

// --- Blocked Phones ---
export function getBlockedPhones(): string[] {
  return getStorage<string[]>(KEYS.BLOCKED_PHONES, INITIAL_BLOCKED_PHONES);
}

export function isPhoneBlocked(phone: string): boolean {
  const cleanPhone = phone.trim();
  const blocked = getBlockedPhones();
  if (blocked.includes(cleanPhone)) return true;

  // Also check if family record is blocked
  const families = getFamilies();
  const fam = families.find((f) => f.phone === cleanPhone);
  return fam ? fam.isBlocked : false;
}

// --- Families ---
export function calculateDaysRemaining(activationDate: string): number {
  if (!activationDate) return 30;
  try {
    const cleanDateStr = String(activationDate).replace(/-/g, '/').replace('T', ' ').split(' ')[0];
    const start = new Date(cleanDateStr).getTime();
    if (isNaN(start)) return 30;
    const now = new Date().getTime();
    const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    if (isNaN(diffDays)) return 30;
    const remaining = 30 - diffDays;
    return remaining > 0 ? remaining : 0;
  } catch (e) {
    return 30;
  }
}

export function getFamilies(): Family[] {
  const list = getStorage<Family[]>(KEYS.FAMILIES, INITIAL_FAMILIES);
  return list.map((f) => {
    const computedDays = calculateDaysRemaining(f.activationDate);
    const updatedStatus =
      f.isBlocked
        ? f.subscriptionStatus
        : computedDays <= 0
        ? 'expired'
        : f.subscriptionStatus;
    return {
      ...f,
      daysRemaining: computedDays,
      subscriptionStatus: updatedStatus,
    };
  });
}

export function getFamilyByPhone(phone: string): Family | undefined {
  if (!phone) return undefined;
  const raw = String(phone).trim();
  const cleanPhone = normalizeDigits(raw);
  const normPhone = normalizeIraqiPhone(raw);
  const rawDigits = cleanPhone.replace(/\D/g, '');

  const families = getFamilies();
  return families.find((f) => {
    const fRaw = String(f.phone || '').trim();
    const fClean = normalizeDigits(fRaw);
    const fNorm = normalizeIraqiPhone(fRaw);
    const fDigits = fClean.replace(/\D/g, '');

    return (
      fRaw === raw ||
      fClean === cleanPhone ||
      (normPhone && fNorm && fNorm === normPhone) ||
      (rawDigits && fDigits && rawDigits === fDigits) ||
      (rawDigits && fDigits && (fDigits.endsWith(rawDigits) || rawDigits.endsWith(fDigits)))
    );
  });
}

// Async multi-source Family verification (Supabase -> Server API)
export async function verifyCustomerPhone(
  phone: string,
  currentLocation?: LocationData
): Promise<{ success: boolean; isBlocked?: boolean; family?: Family; message?: string }> {
  const raw = String(phone || '').trim();
  const cleanPhone = normalizeDigits(raw);
  const normPhone = normalizeIraqiPhone(raw);

  if (!cleanPhone) {
    return { success: false, message: 'يرجى إدخال رقم هاتف العائلة' };
  }

  // 1. Check if blocked in local storage
  if (isPhoneBlocked(cleanPhone) || (normPhone && isPhoneBlocked(normPhone))) {
    return {
      success: false,
      isBlocked: true,
      message: 'عذراً، هذا الرقم محظور من استخدام التطبيق. يرجى التواصل مع إدارة الخبزة.',
    };
  }

  // Sync latest cloud state in parallel
  await syncWithServer(true).catch(() => {});

  // 2. Direct Supabase Query (if configured)
  if (isSupabaseConfigured()) {
    try {
      const supaFamily = await fetchFamilyByPhoneFromSupabase(cleanPhone);
      if (supaFamily) {
        if (supaFamily.isBlocked) {
          return {
            success: false,
            isBlocked: true,
            message: 'عذراً، تم حظر هذا الحساب من قبل الإدارة. يرجى التواصل مع إدارة الخبزة.',
          };
        }
        if (currentLocation && (!supaFamily.location || !supaFamily.location.lat)) {
          supaFamily.location = currentLocation;
          upsertFamilyToSupabase(supaFamily).catch(() => {});
        }
        const localFamilies = getFamilies();
        const existingIdx = localFamilies.findIndex(
          (f) => f.id === supaFamily.id || f.phone === supaFamily.phone
        );
        if (existingIdx >= 0) {
          localFamilies[existingIdx] = { ...localFamilies[existingIdx], ...supaFamily };
        } else {
          localFamilies.push(supaFamily);
        }
        setStorage(KEYS.FAMILIES, localFamilies);
        return { success: true, family: supaFamily };
      }
    } catch (err) {
      console.warn('Supabase family verification query:', err);
    }
  }

  // 3. Central Server API Check (/api/auth/family)
  try {
    const res = await fetch('/api/auth/family', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone }),
    });

    const result = await res.json();
    if (res.ok && result.success && result.family) {
      const serverFam: Family = result.family;
      if (currentLocation && (!serverFam.location || !serverFam.location.lat)) {
        serverFam.location = currentLocation;
      }
      const localFamilies = getFamilies();
      const existingIdx = localFamilies.findIndex(
        (f) => f.id === serverFam.id || f.phone === serverFam.phone
      );
      if (existingIdx >= 0) {
        localFamilies[existingIdx] = { ...localFamilies[existingIdx], ...serverFam };
      } else {
        localFamilies.push(serverFam);
      }
      setStorage(KEYS.FAMILIES, localFamilies);
      return { success: true, family: serverFam };
    } else if (result.isBlocked) {
      return {
        success: false,
        isBlocked: true,
        message: result.message || 'عذراً، هذا الرقم محظور من استخدام التطبيق.',
      };
    } else if (res.status === 404 || result.success === false) {
      // Server explicitly confirms the family does NOT exist or was deleted!
      // Purge any stale record from local storage to prevent phantom logins
      const cleaned = getFamilies().filter((f) => f.phone !== cleanPhone && f.phone !== normPhone);
      setStorage(KEYS.FAMILIES, cleaned, 'overwrite');
      return {
        success: false,
        message: result.message || 'رقم الهاتف غير مسجل في قاعدة البيانات. يرجى التواصل مع إدارة الخبزة لتسجيل الاشتراك.',
      };
    }
  } catch (err) {
    console.warn('Server auth endpoint check error:', err);
  }

  // 4. If network is completely offline, verify against current synced list ONLY if network failed
  const localFam = getFamilyByPhone(cleanPhone);
  if (localFam) {
    if (localFam.isBlocked) {
      return {
        success: false,
        isBlocked: true,
        message: 'عذراً، تم حظر هذا الحساب من قبل الإدارة.',
      };
    }
    return { success: true, family: localFam };
  }

  return {
    success: false,
    message: 'رقم الهاتف غير مسجل في قاعدة البيانات أو تم حذفه من قبل الإدارة. يرجى مراجعة إدارة الخبزة.',
  };
}

export function saveFamily(familyData: Omit<Family, 'id' | 'daysRemaining'> & { id?: string }): Family {
  const list = getFamilies();
  const today = new Date().toISOString().split('T')[0];
  
  const pkgType: PackageType = familyData.packageType || 'saver';
  let totalAllowed = 15;
  let price = 10000;
  if (pkgType === 'medium') {
    totalAllowed = 25;
    price = 15000;
  } else if (pkgType === 'unlimited') {
    totalAllowed = -1;
    price = 20000;
  }

  let savedFamily: Family;

  if (familyData.id) {
    // Edit existing
    const days = calculateDaysRemaining(familyData.activationDate || today);
    let found = false;
    const updatedList = list.map((f) => {
      if (f.id === familyData.id || (familyData.phone && f.phone === familyData.phone)) {
        found = true;
        savedFamily = {
          ...f,
          ...familyData,
          id: f.id || familyData.id,
          packageType: pkgType,
          totalOrdersAllowed: familyData.totalOrdersAllowed ?? (f.totalOrdersAllowed ?? totalAllowed),
          remainingOrders: familyData.remainingOrders ?? (f.remainingOrders ?? (totalAllowed > 0 ? totalAllowed : -1)),
          packagePriceIQD: familyData.packagePriceIQD ?? (f.packagePriceIQD ?? price),
          daysRemaining: days,
        };
        return savedFamily;
      }
      return f;
    });

    if (!found) {
      savedFamily = {
        ...familyData,
        id: familyData.id,
        packageType: pkgType,
        totalOrdersAllowed: familyData.totalOrdersAllowed ?? totalAllowed,
        remainingOrders: familyData.remainingOrders ?? (totalAllowed > 0 ? totalAllowed : -1),
        packagePriceIQD: familyData.packagePriceIQD ?? price,
        activationDate: familyData.activationDate || today,
        daysRemaining: days,
      } as Family;
      updatedList.push(savedFamily);
    }

    setStorage(KEYS.FAMILIES, updatedList, 'overwrite');
    savedFamily = savedFamily || updatedList.find((f) => f.id === familyData.id)!;
  } else {
    // Create new
    const newId = `fam-${Date.now()}`;
    const days = calculateDaysRemaining(familyData.activationDate || today);
    const newFamily: Family = {
      ...familyData,
      id: newId,
      packageType: pkgType,
      totalOrdersAllowed: totalAllowed,
      remainingOrders: totalAllowed,
      packagePriceIQD: price,
      activationDate: familyData.activationDate || today,
      daysRemaining: days,
    };
    list.push(newFamily);
    setStorage(KEYS.FAMILIES, list, 'overwrite');
    savedFamily = newFamily;
  }

  // Push directly to atomic server endpoint
  if (typeof fetch !== 'undefined' && savedFamily) {
    fetch('/api/families/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedFamily),
    }).catch((err) => console.warn('Server family save error:', err));
  }

  // Push directly to Supabase
  if (isSupabaseConfigured() && savedFamily) {
    upsertFamilyToSupabase(savedFamily).catch(() => {});
  }

  return savedFamily;
}

// --- Renewal Requests ---
export function getRenewalRequests(): RenewalRequest[] {
  return getStorage<RenewalRequest[]>(KEYS.RENEWALS, []);
}

export function createRenewalRequest(params: {
  family: Family;
  requestedPackage: PackageType;
}): RenewalRequest {
  const list = getRenewalRequests();
  const id = `REN-${Math.floor(100000 + Math.random() * 900000)}`;

  let packageName = 'باقة توفير';
  let price = 10000;
  let count = 15;

  if (params.requestedPackage === 'medium') {
    packageName = 'الباقة المتوسطة';
    price = 15000;
    count = 25;
  } else if (params.requestedPackage === 'unlimited') {
    packageName = 'الباقة المفتوحة';
    price = 20000;
    count = -1;
  }

  const mandoubs = getMandoubs();
  const matchedMandoub = mandoubs.find(
    (m) =>
      isVlanMatching(m.vlanCode, params.family.vlanCode) &&
      (!m.status || m.status === 'active')
  );
  const activeMandoubs = mandoubs.filter((m) => !m.status || m.status === 'active');
  const fallbackMandoub = !matchedMandoub && activeMandoubs.length === 1 ? activeMandoubs[0] : undefined;
  const assignedMandoub = matchedMandoub || fallbackMandoub;

  const req: RenewalRequest = {
    id,
    familyId: params.family.id,
    familyName: params.family.fullName,
    familyPhone: params.family.phone,
    vlanCode: params.family.vlanCode,
    areaName: params.family.areaName,
    mandoubId: assignedMandoub?.id,
    mandoubName: assignedMandoub?.name,
    requestedPackage: params.requestedPackage,
    packageName,
    packagePriceIQD: price,
    ordersCount: count,
    status: 'pending_mandoub',
    createdAt: new Date().toISOString(),
  };

  list.unshift(req);
  setStorage(KEYS.RENEWALS, list, 'overwrite');

  if (typeof fetch !== 'undefined') {
    fetch('/api/renewals/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }).catch((err) => console.warn('Server renewal save error:', err));
  }

  if (isSupabaseConfigured()) {
    upsertRenewalToSupabase(req).catch(() => {});
  }

  sendBrowserNotification(
    'طلب تجديد اشتراك جديد 🔄',
    `أرسلت عائلة ${params.family.fullName} طلب تجديد لـ (${packageName}) بمبلغ ${price.toLocaleString()} د.ع`,
    { targetRole: 'mandoub', force: true }
  );

  broadcastExternalPush({
    title: 'طلب تجديد اشتراك جديد 🔄',
    body: `أرسلت عائلة ${params.family.fullName} طلب تجديد لـ (${packageName}) بمبلغ ${price.toLocaleString()} د.ع`,
    targetRole: 'mandoub',
    vlanCode: params.family.vlanCode,
    orderId: req.id,
  });

  return req;
}

export function confirmRenewalRequestByMandoub(
  requestId: string,
  mandoub: Mandoub
): void {
  const requests = getRenewalRequests();
  const req = requests.find((r) => r.id === requestId);
  if (!req) return;

  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  // 1. Update request status
  let updatedReq: RenewalRequest | undefined;
  const updatedRequests = requests.map((r) => {
    if (r.id === requestId) {
      updatedReq = {
        ...r,
        status: 'confirmed' as const,
        mandoubId: mandoub.id,
        mandoubName: mandoub.name,
        confirmedAt: now,
      };
      return updatedReq;
    }
    return r;
  });
  setStorage(KEYS.RENEWALS, updatedRequests, 'overwrite');

  if (typeof fetch !== 'undefined' && updatedReq) {
    fetch('/api/renewals/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedReq),
    }).catch(() => {});
  }

  if (isSupabaseConfigured() && updatedReq) {
    upsertRenewalToSupabase(updatedReq).catch(() => {});
  }

  // 2. Update Family Package & Subscription Status
  const families = getFamilies();
  let updatedFam: Family | undefined;
  const updatedFamilies = families.map((f) => {
    if (f.id === req.familyId || f.phone === req.familyPhone) {
      updatedFam = {
        ...f,
        packageType: req.requestedPackage,
        remainingOrders: req.ordersCount,
        totalOrdersAllowed: req.ordersCount,
        packagePriceIQD: req.packagePriceIQD,
        subscriptionStatus: 'active' as const,
        activationDate: today,
        daysRemaining: 30,
      };
      return updatedFam;
    }
    return f;
  });
  setStorage(KEYS.FAMILIES, updatedFamilies, 'overwrite');

  if (typeof fetch !== 'undefined' && updatedFam) {
    fetch('/api/families/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFam),
    }).catch(() => {});
  }

  if (isSupabaseConfigured() && updatedFam) {
    upsertFamilyToSupabase(updatedFam).catch(() => {});
  }

  sendBrowserNotification(
    'تأكيد تجديد الاشتراك 🌟',
    `تم تأكيد تجديد اشتراك عائلة ${req.familyName} بنجاح لدى المندوب ${mandoub.name}`
  );
}

export function rejectRenewalRequestByMandoub(
  requestId: string,
  mandoub: Mandoub,
  reason: string
): void {
  const requests = getRenewalRequests();
  let updatedReq: RenewalRequest | undefined;
  const updatedRequests = requests.map((r) => {
    if (r.id === requestId) {
      updatedReq = {
        ...r,
        status: 'rejected_mandoub' as const,
        mandoubId: mandoub.id,
        mandoubName: mandoub.name,
        rejectionReason: reason || 'تم رفض التجديد من قبل المندوب',
      };
      return updatedReq;
    }
    return r;
  });
  setStorage(KEYS.RENEWALS, updatedRequests, 'overwrite');
  if (typeof fetch !== 'undefined' && updatedReq) {
    fetch('/api/renewals/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedReq),
    }).catch(() => {});
  }
  if (isSupabaseConfigured() && updatedReq) {
    upsertRenewalToSupabase(updatedReq).catch(() => {});
  }
}

export function rejectRenewalRequestByAdmin(requestId: string, reason: string): void {
  const requests = getRenewalRequests();
  let updatedReq: RenewalRequest | undefined;
  const updatedRequests = requests.map((r) => {
    if (r.id === requestId) {
      updatedReq = {
        ...r,
        status: 'rejected_admin' as const,
        rejectionReason: reason || 'تم رفض التجديد من قبل الأدمن',
      };
      return updatedReq;
    }
    return r;
  });
  setStorage(KEYS.RENEWALS, updatedRequests, 'overwrite');
  if (typeof fetch !== 'undefined' && updatedReq) {
    fetch('/api/renewals/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedReq),
    }).catch(() => {});
  }
  if (isSupabaseConfigured() && updatedReq) {
    upsertRenewalToSupabase(updatedReq).catch(() => {});
  }
}

export function renewFamilySubscription(familyId: string): void {
  const list = getFamilies();
  const today = new Date().toISOString().split('T')[0];
  let updatedFam: Family | undefined;
  const updatedList = list.map((f) => {
    if (f.id === familyId) {
      updatedFam = {
        ...f,
        activationDate: today,
        subscriptionStatus: 'active' as const,
        daysRemaining: 30,
      };
      return updatedFam;
    }
    return f;
  });
  setStorage(KEYS.FAMILIES, updatedList, 'overwrite');
  if (typeof fetch !== 'undefined' && updatedFam) {
    fetch('/api/families/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFam),
    }).catch(() => {});
  }
  if (isSupabaseConfigured() && updatedFam) {
    upsertFamilyToSupabase(updatedFam).catch(() => {});
  }
}

export function toggleBlockFamily(familyId: string, shouldBlock: boolean): void {
  const list = getFamilies();
  const fam = list.find((f) => f.id === familyId);
  if (!fam) return;

  let updatedFam: Family | undefined;
  const updatedList = list.map((f) => {
    if (f.id === familyId) {
      updatedFam = { ...f, isBlocked: shouldBlock };
      return updatedFam;
    }
    return f;
  });
  setStorage(KEYS.FAMILIES, updatedList, 'overwrite');

  if (typeof fetch !== 'undefined') {
    fetch('/api/blocked-phones/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: fam.phone, block: shouldBlock }),
    }).catch(() => {});
    if (updatedFam) {
      fetch('/api/families/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFam),
      }).catch(() => {});
    }
  }

  if (isSupabaseConfigured() && updatedFam) {
    upsertFamilyToSupabase(updatedFam).catch(() => {});
  }

  // Sync to blocked phones list
  let blocked = getBlockedPhones();
  if (shouldBlock) {
    if (!blocked.includes(fam.phone)) {
      blocked.push(fam.phone);
      if (isSupabaseConfigured()) {
        upsertBlockedPhoneToSupabase(fam.phone).catch(() => {});
      }
    }
  } else {
    blocked = blocked.filter((p) => p !== fam.phone);
    if (isSupabaseConfigured()) {
      deleteBlockedPhoneFromSupabase(fam.phone).catch(() => {});
    }
  }
  setStorage(KEYS.BLOCKED_PHONES, blocked, 'overwrite');
}

export function updateFamilyLocation(familyId: string, location: LocationData): void {
  const list = getFamilies();
  let updatedFam: Family | undefined;
  const updated = list.map((f) => {
    if (f.id === familyId) {
      updatedFam = { ...f, location };
      return updatedFam;
    }
    return f;
  });
  setStorage(KEYS.FAMILIES, updated, 'overwrite');
  if (typeof fetch !== 'undefined' && updatedFam) {
    fetch('/api/families/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFam),
    }).catch(() => {});
  }
  if (isSupabaseConfigured()) {
    updateFamilyLocationInSupabase(familyId, location).catch(() => {});
  }
}

export function deleteFamily(familyId: string): void {
  const currentFamilies = getFamilies();
  const targetFam = currentFamilies.find((f) => f.id === familyId);
  const list = currentFamilies.filter((f) => f.id !== familyId);
  setStorage(KEYS.FAMILIES, list, 'overwrite');

  // If current session is this deleted family, terminate immediately
  const session = getSavedSession();
  if (session.role === 'customer' && (session.familyId === familyId || (targetFam && session.phone === targetFam.phone))) {
    clearSession();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('khobza_session_terminated', { detail: { reason: 'account_deleted' } }));
    }
  }

  if (typeof fetch !== 'undefined') {
    fetch('/api/families/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: familyId, phone: targetFam?.phone }),
    }).catch(() => {});
  }
  if (isSupabaseConfigured()) {
    deleteFamilyFromSupabase(familyId).catch(() => {});
  }
}

// --- Mandoubs ---
export function getMandoubs(): Mandoub[] {
  const list = getStorage<Mandoub[]>(KEYS.MANDOUBS, INITIAL_MANDOUBS);
  return list.map((m) => {
    if (!m.currentLocation) {
      return {
        ...m,
        status: m.status || 'active',
        currentLocation: {
          lat: 33.3128,
          lng: 44.3615,
          addressText: `موقع المندوب المباشر في منطقة ${m.areaName || 'بغداد'}`,
        },
      };
    }
    return { ...m, status: m.status || 'active' };
  });
}

export function getMandoubById(id: string): Mandoub | undefined {
  return getMandoubs().find((m) => m.id === id);
}

export function authenticateMandoub(identifier: string, pass: string): Mandoub | undefined {
  const rawId = String(identifier || '').trim();
  const cleanId = normalizeDigits(rawId).toLowerCase();
  const idDigits = cleanId.replace(/\D/g, '');
  const rawPass = String(pass || '').trim();
  const cleanPass = normalizeDigits(rawPass);

  const mandoubs = getMandoubs();
  return mandoubs.find((m) => {
    const mUser = normalizeDigits(m.username || '').toLowerCase();
    const mName = normalizeDigits(m.name || '').toLowerCase();
    const mPhone = normalizeDigits(m.phone || '').replace(/\D/g, '');
    const mVlan = normalizeDigits(m.vlanCode || '').toLowerCase();

    const userMatch =
      mUser === cleanId ||
      mUser === rawId.toLowerCase() ||
      (mPhone && idDigits && mPhone === idDigits) ||
      (mPhone && (cleanId === mPhone || rawId === m.phone)) ||
      mName === cleanId ||
      mName === rawId.toLowerCase() ||
      mVlan === cleanId ||
      mVlan === rawId.toLowerCase();

    const mPass = String(m.password || '').trim();
    const mPassClean = normalizeDigits(mPass);
    const passMatch = mPass === rawPass || mPassClean === cleanPass || mPass === cleanPass;

    return userMatch && passMatch;
  });
}

export function saveMandoub(data: Omit<Mandoub, 'id'> & { id?: string }): Mandoub {
  const list = getMandoubs();
  let saved: Mandoub;
  if (data.id) {
    let found = false;
    const updated = list.map((m) => {
      if (m.id === data.id || (data.username && m.username === data.username)) {
        found = true;
        saved = { ...m, ...data, id: m.id || data.id };
        return saved;
      }
      return m;
    });
    if (!found) {
      saved = {
        ...data,
        id: data.id,
        status: data.status || 'active',
      } as Mandoub;
      updated.push(saved);
    }
    setStorage(KEYS.MANDOUBS, updated, 'overwrite');
    saved = saved || updated.find((m) => m.id === data.id)!;
  } else {
    const newMandoub: Mandoub = {
      ...data,
      id: `mandoub-${Date.now()}`,
      status: data.status || 'active',
    };
    list.push(newMandoub);
    setStorage(KEYS.MANDOUBS, list, 'overwrite');
    saved = newMandoub;
  }

  // Push directly to atomic server endpoint
  if (typeof fetch !== 'undefined' && saved) {
    fetch('/api/mandoubs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saved),
    }).catch((err) => console.warn('Server mandoub save error:', err));
  }

  // Push directly to Supabase
  if (isSupabaseConfigured() && saved) {
    upsertMandoubToSupabase(saved).catch(() => {});
  }

  return saved;
}

export function deleteMandoub(id: string): void {
  const currentMandoubs = getMandoubs();
  const targetMandoub = currentMandoubs.find((m) => m.id === id);
  const list = currentMandoubs.filter((m) => m.id !== id);
  setStorage(KEYS.MANDOUBS, list, 'overwrite');

  // If current session is this deleted mandoub, terminate immediately
  const session = getSavedSession();
  if (session.role === 'mandoub' && (session.mandoubId === id || (targetMandoub && session.mandoubId === targetMandoub.id))) {
    clearSession();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('khobza_session_terminated', { detail: { reason: 'account_deleted' } }));
    }
  }

  if (typeof fetch !== 'undefined') {
    fetch('/api/mandoubs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, username: targetMandoub?.username }),
    }).catch(() => {});
  }
  if (isSupabaseConfigured()) {
    deleteMandoubFromSupabase(id).catch(() => {});
  }
}

export function updateMandoubLocation(mandoubId: string, lat: number, lng: number, addressText?: string): void {
  const list = getMandoubs();
  const loc: LocationData = {
    lat,
    lng,
    addressText: addressText || `موقع تحديث المندوب (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
  };
  let updatedMandoub: Mandoub | undefined;
  const updated = list.map((m) => {
    if (m.id === mandoubId) {
      updatedMandoub = {
        ...m,
        currentLocation: loc,
      };
      return updatedMandoub;
    }
    return m;
  });
  setStorage(KEYS.MANDOUBS, updated, 'overwrite');
  if (typeof fetch !== 'undefined' && updatedMandoub) {
    fetch('/api/mandoubs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedMandoub),
    }).catch(() => {});
  }
  if (isSupabaseConfigured()) {
    updateMandoubLocationInSupabase(mandoubId, loc).catch(() => {});
  }
}

// --- Admin Accounts ---
export function getAdminAccounts(): AdminUser[] {
  return getStorage<AdminUser[]>(KEYS.ADMINS, INITIAL_ADMINS);
}

export function authenticateAdmin(identifier: string, pass: string): AdminUser | undefined {
  const rawId = String(identifier || '').trim();
  const cleanId = normalizeDigits(rawId).toLowerCase();
  const rawPass = String(pass || '').trim();
  const cleanPass = normalizeDigits(rawPass);

  const admins = getAdminAccounts();
  return admins.find((a) => {
    const aUser = normalizeDigits(a.username || '').toLowerCase();
    const aName = normalizeDigits(a.fullName || '').toLowerCase();
    const aPass = String(a.password || '').trim();
    const aPassClean = normalizeDigits(aPass);

    const userMatch =
      aUser === cleanId ||
      aUser === rawId.toLowerCase() ||
      aName === cleanId ||
      aName === rawId.toLowerCase();

    const passMatch = aPass === rawPass || aPassClean === cleanPass || aPass === cleanPass;

    return userMatch && passMatch;
  });
}

// Comprehensive asynchronous login that queries server backend directly
export async function loginStaff(
  identifier: string,
  pass: string
): Promise<{
  success: boolean;
  role?: UserRole;
  user?: Mandoub | AdminUser;
  error?: string;
}> {
  const rawId = String(identifier || '').trim();
  const rawPass = String(pass || '').trim();

  if (!rawId || !rawPass) {
    return { success: false, error: 'يرجى إدخال اسم المستخدم وكلمة السر' };
  }

  // 1. Force instant cloud sync with server
  try {
    await syncWithServer(true);
  } catch (err) {
    // continue
  }

  // 2. Query direct /api/auth/staff server endpoint as the single source of truth
  try {
    const response = await fetch('/api/auth/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: rawId, password: rawPass }),
    });

    const result = await response.json();
    if (response.ok && result.success && result.user) {
      if (result.role === 'admin') {
        const adminUser = result.user as AdminUser;
        const currentAdmins = getAdminAccounts();
        if (!currentAdmins.some((a) => a.id === adminUser.id)) {
          setStorage(KEYS.ADMINS, [...currentAdmins, adminUser], 'overwrite');
        }
        saveSession({ role: 'admin', adminId: adminUser.id });
        return { success: true, role: 'admin', user: adminUser };
      } else if (result.role === 'mandoub') {
        const mandoubUser = result.user as Mandoub;
        const currentMandoubs = getMandoubs();
        if (!currentMandoubs.some((m) => m.id === mandoubUser.id)) {
          setStorage(KEYS.MANDOUBS, [...currentMandoubs, mandoubUser], 'overwrite');
        }
        saveSession({ role: 'mandoub', mandoubId: mandoubUser.id });
        return { success: true, role: 'mandoub', user: mandoubUser };
      }
    } else if (response.status === 401 || response.status === 404 || response.status === 403 || result.success === false) {
      // Clean local cache of any matching mandoub to prevent stale retention
      const cleanId = normalizeDigits(rawId).toLowerCase();
      const cleaned = getMandoubs().filter((m) => normalizeDigits(m.username || '').toLowerCase() !== cleanId && normalizeDigits(m.phone || '').replace(/\D/g, '') !== cleanId);
      setStorage(KEYS.MANDOUBS, cleaned, 'overwrite');
      return { success: false, error: result.message || 'اسم المستخدم أو كلمة السر غير صحيحة أو تم حذف الحساب من قبل الإدارة' };
    }
  } catch (err) {
    console.warn('Direct server auth fetch warning:', err);
  }

  // 3. Fallback only if offline network: Admin offline access check
  const admin = authenticateAdmin(rawId, rawPass);
  if (admin) {
    saveSession({ role: 'admin', adminId: admin.id });
    return { success: true, role: 'admin', user: admin };
  }

  return {
    success: false,
    error: 'اسم المستخدم أو كلمة السر غير صحيحة أو تم حذف الحساب من قبل الإدارة. يرجى مراجعة إدارة النظام.',
  };
}

export function saveAdminAccount(data: Omit<AdminUser, 'id'> & { id?: string }): AdminUser {
  const list = getAdminAccounts();
  let savedAdmin: AdminUser;
  if (data.id) {
    const updated = list.map((a) => {
      if (a.id === data.id) {
        savedAdmin = { ...a, ...data };
        return savedAdmin;
      }
      return a;
    });
    setStorage(KEYS.ADMINS, updated, 'overwrite');
    savedAdmin = updated.find((a) => a.id === data.id)!;
  } else {
    const newAdmin: AdminUser = {
      ...data,
      id: `admin-${Date.now()}`,
    };
    list.push(newAdmin);
    setStorage(KEYS.ADMINS, list, 'overwrite');
    savedAdmin = newAdmin;
  }

  if (typeof fetch !== 'undefined' && savedAdmin) {
    fetch('/api/admins/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedAdmin),
    }).catch(() => {});
  }

  if (isSupabaseConfigured() && savedAdmin) {
    upsertAdminToSupabase(savedAdmin).catch(() => {});
  }

  return savedAdmin;
}

export function deleteAdminAccount(adminId: string): void {
  const list = getAdminAccounts().filter((a) => a.id !== adminId);
  setStorage(KEYS.ADMINS, list, 'overwrite');
  if (typeof fetch !== 'undefined') {
    fetch('/api/admins/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: adminId }),
    }).catch(() => {});
  }
  if (isSupabaseConfigured()) {
    deleteAdminFromSupabase(adminId).catch(() => {});
  }
}

// --- Orders ---
export function getOrders(): Order[] {
  return getStorage<Order[]>(KEYS.ORDERS, INITIAL_ORDERS);
}

export function generateUniqueOrderId(): string {
  const existingOrders = getOrders();
  let id = '';
  let exists = true;
  while (exists) {
    const randNum = Math.floor(100000 + Math.random() * 900000);
    id = `KH-${randNum}`;
    exists = existingOrders.some((o) => o.id === id);
  }
  return id;
}

export function createOrder(params: {
  family: Family;
  orderType: OrderType;
  quantity: number;
  timeSlot: TimeSlot;
  priceAmount?: number;
}): Order {
  const list = getOrders();
  const id = generateUniqueOrderId();

  let unitText = 'خبزة';
  let computedQty = params.quantity;
  let priceAmount = params.priceAmount;

  if (params.orderType === 'kg') {
    unitText = computedQty === 1 ? 'كيلو' : 'كيلوات';
  } else if (params.orderType === 'amount') {
    priceAmount = priceAmount || 1000;
    computedQty = Math.round((priceAmount / 1000) * 6);
    unitText = `خبزة (مقابل ${priceAmount.toLocaleString()} د.ع)`;
  }

  let timeSlotText = '';
  switch (params.timeSlot) {
    case 'morning':
      timeSlotText = 'صباحاً (٩-١١)';
      break;
    case 'afternoon':
      timeSlotText = 'ظهراً (٣-٦)';
      break;
    case 'evening':
      timeSlotText = 'ليلاً (٨-١٠)';
      break;
  }

  const mandoubs = getMandoubs();
  const activeMandoubs = mandoubs.filter((m) => !m.status || m.status === 'active');
  const matchedMandoub = activeMandoubs.find((m) =>
    isOrderMatchedToMandoub(
      { vlanCode: params.family.vlanCode, areaName: params.family.areaName },
      m,
      activeMandoubs
    )
  );
  const fallbackMandoub = !matchedMandoub && activeMandoubs.length === 1 ? activeMandoubs[0] : undefined;
  const assignedMandoub = matchedMandoub || fallbackMandoub;

  const now = new Date().toISOString();
  const newOrder: Order = {
    id,
    familyId: params.family.id,
    familyName: params.family.fullName,
    familyPhone: params.family.phone,
    location: params.family.location,
    vlanCode: params.family.vlanCode,
    areaName: params.family.areaName,
    bakeryName: params.family.bakeryName || 'مخبز الخبزة الرئيسي',
    mandoubId: assignedMandoub?.id,
    mandoubName: assignedMandoub?.name,
    orderType: params.orderType,
    priceAmount,
    quantity: computedQty,
    unitText,
    timeSlot: params.timeSlot,
    timeSlotText,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  list.unshift(newOrder);
  setStorage(KEYS.ORDERS, list, 'merge');

  if (typeof fetch !== 'undefined') {
    fetch('/api/orders/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder),
    }).catch((err) => console.warn('Server order save error:', err));
  }

  if (isSupabaseConfigured()) {
    upsertOrderToSupabase(newOrder).catch(() => {});
  }

  sendBrowserNotification(
    'طلب خبز جديد وصل للمندوب! 🥖🔔',
    `وصل طلب خبز جديد (${newOrder.quantity} ${newOrder.unitText}) لعائلة ${newOrder.familyName}`,
    { orderId: newOrder.id, targetRole: 'mandoub', vlanCode: newOrder.vlanCode }
  );

  return newOrder;
}

export function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  extra?: {
    mandoubId?: string;
    mandoubName?: string;
    adminNote?: string;
    unpaidResolved?: boolean;
    unpaidAmount?: number;
  }
): Order | undefined {
  const list = getOrders();
  const now = new Date().toISOString();

  let updatedOrder: Order | undefined;

  const updatedList = list.map((o) => {
    if (o.id === orderId) {
      updatedOrder = {
        ...o,
        status: newStatus,
        updatedAt: now,
        ...(extra?.mandoubId && { mandoubId: extra.mandoubId }),
        ...(extra?.mandoubName && { mandoubName: extra.mandoubName }),
        ...(extra?.adminNote !== undefined && { adminNote: extra.adminNote }),
        ...(extra?.unpaidResolved !== undefined && { unpaidResolved: extra.unpaidResolved }),
        ...(extra?.unpaidAmount !== undefined && { unpaidAmount: extra.unpaidAmount }),
        ...(newStatus === 'completed_confirmed' && { customerConfirmedAt: now }),
      };
      return updatedOrder;
    }
    return o;
  });

  // Check if this status transition requires deducting from family package remaining orders
  if (
    updatedOrder &&
    !updatedOrder.deductedFromPackage &&
    (newStatus === 'completed_confirmed' || newStatus === 'unpaid_confirmed')
  ) {
    updatedOrder.deductedFromPackage = true;

    // Deduct remaining orders count for non-unlimited family package
    const families = getFamilies();
    const targetOrder = updatedOrder;
    const fam = families.find(
      (f) => f.id === targetOrder.familyId || f.phone === targetOrder.familyPhone
    );

    if (fam && fam.packageType !== 'unlimited') {
      const currentRemaining = typeof fam.remainingOrders === 'number' ? fam.remainingOrders : 15;
      const newRemaining = Math.max(0, currentRemaining - 1);
      let updatedFam: Family | undefined;
      const updatedFamilies = families.map((f) => {
        if (f.id === fam.id) {
          updatedFam = {
            ...f,
            remainingOrders: newRemaining,
            subscriptionStatus: newRemaining <= 0 ? ('expired' as const) : f.subscriptionStatus,
          };
          return updatedFam;
        }
        return f;
      });
      localStorage.setItem(KEYS.FAMILIES, JSON.stringify(updatedFamilies));
      if (typeof fetch !== 'undefined' && updatedFam) {
        fetch('/api/families/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedFam),
        }).catch(() => {});
      }
      if (isSupabaseConfigured() && updatedFam) {
        upsertFamilyToSupabase(updatedFam).catch(() => {});
      }
    }
  }

  // Atomically update local storage
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(updatedList));
  lastMutationTime = Date.now();
  window.dispatchEvent(new Event('khobza_data_change'));

  if (typeof fetch !== 'undefined' && updatedOrder) {
    fetch('/api/orders/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: orderId,
        status: newStatus,
        updates: {
          ...(extra?.mandoubId && { mandoubId: extra.mandoubId }),
          ...(extra?.mandoubName && { mandoubName: extra.mandoubName }),
          ...(extra?.adminNote !== undefined && { adminNote: extra.adminNote }),
          ...(extra?.unpaidResolved !== undefined && { unpaidResolved: extra.unpaidResolved }),
          ...(extra?.unpaidAmount !== undefined && { unpaidAmount: extra.unpaidAmount }),
          ...(newStatus === 'completed_confirmed' && { customerConfirmedAt: now }),
        },
      }),
    }).catch((err) => console.warn('Server order status error:', err));
  }

  if (isSupabaseConfigured() && updatedOrder) {
    upsertOrderToSupabase(updatedOrder).catch(() => {});
  }

  if (updatedOrder) {
    if (newStatus === 'under_review') {
      sendBrowserNotification(
        '🎉 وصل الخبز إلى منزلكم!',
        `قام المندوب بتوصيل طلب الخبز (${updatedOrder.quantity} ${updatedOrder.unitText}). يرجى تأكيد الاستلام الآن!`,
        { orderId: updatedOrder.id, targetRole: 'family', targetPhone: updatedOrder.familyPhone }
      );
      broadcastExternalPush({
        title: '🎉 وصل الخبز إلى منزلكم!',
        body: `قام المندوب بتوصيل طلب الخبز (${updatedOrder.quantity} ${updatedOrder.unitText}). يرجى تأكيد الاستلام الآن!`,
        targetRole: 'family',
        targetPhone: updatedOrder.familyPhone,
        orderId: updatedOrder.id,
      });
    } else if (newStatus === 'completed_confirmed') {
      sendBrowserNotification(
        '✅ تم تأكيد استلام الطلب',
        `تم تأكيد استلام الطلب (${updatedOrder.quantity} ${updatedOrder.unitText}) بنجاح من قبل العائلة.`,
        { orderId: updatedOrder.id, targetRole: 'mandoub', vlanCode: updatedOrder.vlanCode }
      );
      broadcastExternalPush({
        title: '✅ تم تأكيد استلام الطلب',
        body: `تم تأكيد استلام الطلب (${updatedOrder.quantity} ${updatedOrder.unitText}) بنجاح من قبل العائلة.`,
        targetRole: 'mandoub',
        vlanCode: updatedOrder.vlanCode,
        orderId: updatedOrder.id,
      });
    } else if (newStatus === 'processing_unpaid' || newStatus === 'unpaid_confirmed') {
      sendBrowserNotification(
        'تنبيه: طلب غير مسدد ⚠️',
        `تم تسجيل بلاغ عدم تسديد للطلب ${updatedOrder.id} (${updatedOrder.familyName}).`,
        { orderId: updatedOrder.id, targetRole: 'all' }
      );
    }
  }

  return updatedOrder;
}

export function deleteOrder(orderId: string): void {
  const list = getOrders().filter((o) => o.id !== orderId);
  setStorage(KEYS.ORDERS, list, 'overwrite');
  if (typeof fetch !== 'undefined') {
    fetch('/api/orders/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orderId }),
    }).catch(() => {});
  }
  if (isSupabaseConfigured()) {
    deleteOrderFromSupabase(orderId).catch(() => {});
  }
}

// Customer confirms receipt with direct persistence and immediate callback
export function confirmOrderReceipt(orderId: string): Order | undefined {
  return updateOrderStatus(orderId, 'completed_confirmed');
}

// --- Statistics & Accounting ---
export function calculateStatistics(): StatisticsData {
  const orders = getOrders();
  const families = getFamilies();
  const mandoubs = getMandoubs();
  const blockedPhones = getBlockedPhones();

  const totalOrders = orders.length;
  const totalFamilies = families.length;

  const incompleteOrders = orders.filter((o) =>
    ['pending', 'under_review', 'processing_unpaid'].includes(o.status)
  ).length;

  const unpaidOrders = orders.filter((o) =>
    ['processing_unpaid', 'unpaid_confirmed'].includes(o.status) && !o.unpaidResolved
  ).length;

  const blockedFamiliesCount = families.filter((f) => f.isBlocked || blockedPhones.includes(f.phone)).length;

  const expiredFamiliesCount = families.filter((f) => f.subscriptionStatus === 'expired' || f.daysRemaining <= 0).length;

  const mandoubStats = mandoubs.map((m) => {
    const mandoubVlan = normalizeVlanCode(m.vlanCode);
    const mandoubOrders = orders.filter(
      (o) => normalizeVlanCode(o.vlanCode) === mandoubVlan || o.mandoubId === m.id
    );
    const incomplete = mandoubOrders.filter((o) =>
      ['pending', 'under_review', 'processing_unpaid'].includes(o.status)
    ).length;
    const completed = mandoubOrders.filter((o) => o.status === 'completed_confirmed').length;

    return {
      mandoubId: m.id,
      mandoubName: m.name,
      vlanCode: m.vlanCode,
      areaName: m.areaName,
      incompleteCount: incomplete,
      completedCount: completed,
      currentLocation: m.currentLocation,
    };
  });

  return {
    totalOrders,
    totalFamilies,
    incompleteOrders,
    unpaidOrders,
    blockedFamilies: blockedFamiliesCount,
    expiredFamilies: expiredFamiliesCount,
    mandoubStats,
  };
}

export function calculateAccounting(): AccountingSummary {
  const families = getFamilies();
  const mandoubs = getMandoubs().filter((m) => m.status === 'active');
  const renewals = getRenewalRequests().filter((r) => r.status === 'confirmed');

  const activeFamilies = families.filter((f) => f.subscriptionStatus === 'active' && !f.isBlocked);
  const totalCustomersCount = families.length;
  const last30DaysCustomersCount = activeFamilies.length;

  const subscriptionFeeIQD = 10000;
  let totalGrossRevenue = 0;

  activeFamilies.forEach((f) => {
    totalGrossRevenue += f.packagePriceIQD || 10000;
  });

  const mandoubSalaries = mandoubs.map((m) => {
    const mandoubVlan = normalizeVlanCode(m.vlanCode);
    const vlanCustomers = activeFamilies.filter((f) => normalizeVlanCode(f.vlanCode) === mandoubVlan);
    const count = vlanCustomers.length;

    const vlanRenewals = renewals.filter(
      (r) => normalizeVlanCode(r.vlanCode) === mandoubVlan || r.mandoubId === m.id
    );
    const collectedPackageCashIQD = vlanRenewals.reduce((sum, r) => sum + (r.packagePriceIQD || 0), 0);

    let salaryIQD = 0;
    if (m.salaryType === 'fixed') {
      salaryIQD = m.fixedSalaryAmount || 500000;
    } else {
      const percentage = m.commissionPercentage ?? 25;
      const vlanRevenue = vlanCustomers.reduce((sum, f) => sum + (f.packagePriceIQD || 10000), 0);
      salaryIQD = (vlanRevenue * percentage) / 100;
    }

    return {
      mandoubId: m.id,
      mandoubName: m.name,
      vlanCode: m.vlanCode,
      areaName: m.areaName,
      vlanCustomersCount: count,
      salaryIQD,
      salaryType: m.salaryType || 'percentage',
      fixedSalaryAmount: m.fixedSalaryAmount,
      commissionPercentage: m.commissionPercentage,
      collectedPackageCashIQD,
    };
  });

  const totalSalaries = mandoubSalaries.reduce((sum, s) => sum + s.salaryIQD, 0);
  const totalNetProfitIQD = Math.max(0, totalGrossRevenue - totalSalaries);

  return {
    totalCustomersCount,
    last30DaysCustomersCount,
    subscriptionFeeIQD,
    mandoubPercentage: 25,
    netProfitPerCustomerIQD: 7500,
    totalNetProfitIQD,
    mandoubSalaries,
  };
}

