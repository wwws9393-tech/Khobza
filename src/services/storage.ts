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
          
          // Helper status weights for orders
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
      pushAllToSupabase({ families, mandoubs, admins, orders, renewals, blockedPhones }).catch(() => {});
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
  // Rapid sync settling - wait 2000ms after a local mutation to allow pushToServer to settle unless forced
  if (!force && Date.now() - lastMutationTime < 2000) {
    return;
  }

  try {
    // Check Supabase first if configured
    if (isSupabaseConfigured()) {
      const supaData = await fetchAllFromSupabase();
      if (supaData) {
        let changed = false;
        if (supaData.families) {
          localStorage.setItem(KEYS.FAMILIES, JSON.stringify(supaData.families));
          changed = true;
        }
        if (supaData.mandoubs) {
          localStorage.setItem(KEYS.MANDOUBS, JSON.stringify(supaData.mandoubs));
          changed = true;
        }
        if (supaData.orders) {
          localStorage.setItem(KEYS.ORDERS, JSON.stringify(supaData.orders));
          changed = true;
        }
        if (supaData.renewals) {
          localStorage.setItem(KEYS.RENEWALS, JSON.stringify(supaData.renewals));
          changed = true;
        }
        if (supaData.admins && supaData.admins.length > 0) {
          localStorage.setItem(KEYS.ADMINS, JSON.stringify(supaData.admins));
          changed = true;
        }
        if (supaData.blockedPhones) {
          localStorage.setItem(KEYS.BLOCKED_PHONES, JSON.stringify(supaData.blockedPhones));
          changed = true;
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

      // Sync families
      if (Array.isArray(data.families)) {
        const localFamilies = getStorage<Family[]>(KEYS.FAMILIES, []);
        // Merge without losing locally added families
        const mergedFamilies = mergeArraysById(localFamilies, data.families);
        const mergedStr = JSON.stringify(mergedFamilies);
        if (mergedStr !== localStorage.getItem(KEYS.FAMILIES)) {
          localStorage.setItem(KEYS.FAMILIES, mergedStr);
          changed = true;
        }
      }

      // Sync mandoubs
      if (Array.isArray(data.mandoubs)) {
        const localMandoubs = getStorage<Mandoub[]>(KEYS.MANDOUBS, []);
        const mergedMandoubs = mergeArraysById(localMandoubs, data.mandoubs);
        const mergedStr = JSON.stringify(mergedMandoubs);
        if (mergedStr !== localStorage.getItem(KEYS.MANDOUBS)) {
          localStorage.setItem(KEYS.MANDOUBS, mergedStr);
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

      // Sync orders
      if (Array.isArray(data.orders)) {
        const localOrders = getStorage<Order[]>(KEYS.ORDERS, []);
        const mergedOrders = mergeArraysById(localOrders, data.orders);
        const mergedStr = JSON.stringify(mergedOrders);
        if (mergedStr !== localStorage.getItem(KEYS.ORDERS)) {
          localStorage.setItem(KEYS.ORDERS, mergedStr);
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

// Initialize seed data if empty and sync with cloud backend
export function initializeAppData(): void {
  // Safe local initialization without sending destructive empty overwrite to server
  if (localStorage.getItem(KEYS.FAMILIES) === null) {
    localStorage.setItem(KEYS.FAMILIES, JSON.stringify(INITIAL_FAMILIES));
  }
  if (localStorage.getItem(KEYS.MANDOUBS) === null) {
    localStorage.setItem(KEYS.MANDOUBS, JSON.stringify(INITIAL_MANDOUBS));
  }
  if (localStorage.getItem(KEYS.ADMINS) === null) {
    localStorage.setItem(KEYS.ADMINS, JSON.stringify(INITIAL_ADMINS));
  }
  if (localStorage.getItem(KEYS.ORDERS) === null) {
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(INITIAL_ORDERS));
  }
  if (localStorage.getItem(KEYS.BLOCKED_PHONES) === null) {
    localStorage.setItem(KEYS.BLOCKED_PHONES, JSON.stringify(INITIAL_BLOCKED_PHONES));
  }

  // Trigger sync with server database immediately
  syncWithServer();

  if (!autoSyncInterval && typeof window !== 'undefined') {
    autoSyncInterval = setInterval(() => {
      syncWithServer();
    }, 2500);
  }
}

// Reset ALL data (families, mandoubs, orders, renewals, history) except Admins
export function resetDatabaseExceptAdmins(): void {
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

  // Notify backend with explicit admin_reset action
  if (typeof fetch !== 'undefined') {
    fetch('/api/db/reset', { method: 'POST' }).catch(() => {});
  }

  pushToServer('admin_reset');

  window.dispatchEvent(new Event('khobza_data_change'));
}


// Restore Official Stable Checkpoint v1.0.4.final
export function restoreOfficialPointV104Final(): boolean {
  try {
    const checkpoint = {
      restorePointName: 'v1.0.4.final',
      appName: 'Khobza Official Final Restore Point',
      version: '1.0.4',
      createdAt: new Date().toISOString(),
      families: [],
      mandoubs: [],
      admins: getAdminAccounts(),
      orders: [],
      renewals: [],
      blockedPhones: [],
      versionConfig: {
        currentVersion: '1.0.4',
        latestVersion: '1.0.4',
        isMandatory: false,
        releaseNotes: 'الإصدار الرسمي النهائى المستقر وآمن v1.0.4.final - تم تحديث واستقرار نظام إدارة الخبزة وتصفيات الحسابات واللوحة الذكية',
        releasedAt: new Date().toISOString(),
      },
    };

    localStorage.setItem(KEYS.FAMILIES, JSON.stringify(checkpoint.families));
    localStorage.setItem(KEYS.MANDOUBS, JSON.stringify(checkpoint.mandoubs));
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(checkpoint.orders));
    localStorage.setItem(KEYS.RENEWALS, JSON.stringify(checkpoint.renewals));
    localStorage.setItem(KEYS.BLOCKED_PHONES, JSON.stringify(checkpoint.blockedPhones));
    localStorage.setItem(
      'khobza_version_config_v1',
      JSON.stringify(checkpoint.versionConfig)
    );

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

// Restore Official Stable Checkpoint v1.0.4.screen
export function restoreOfficialPointV104Screen(): boolean {
  return restoreOfficialPointV104Final();
}

// Export complete database backup as JSON
export function exportDatabaseJSON(): string {
  const data = {
    appName: 'Khobza App Backup',
    version: '2.0.0',
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

// Import database backup from JSON
export function importDatabaseJSON(jsonStr: string): boolean {
  try {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== 'object') return false;

    if (Array.isArray(data.families)) {
      localStorage.setItem(KEYS.FAMILIES, JSON.stringify(data.families));
    }
    if (Array.isArray(data.mandoubs)) {
      localStorage.setItem(KEYS.MANDOUBS, JSON.stringify(data.mandoubs));
    }
    if (Array.isArray(data.admins) && data.admins.length > 0) {
      localStorage.setItem(KEYS.ADMINS, JSON.stringify(data.admins));
    }
    if (Array.isArray(data.orders)) {
      localStorage.setItem(KEYS.ORDERS, JSON.stringify(data.orders));
    }
    if (Array.isArray(data.renewals)) {
      localStorage.setItem(KEYS.RENEWALS, JSON.stringify(data.renewals));
    }
    if (Array.isArray(data.blockedPhones)) {
      localStorage.setItem(KEYS.BLOCKED_PHONES, JSON.stringify(data.blockedPhones));
    }
    if (data.versionConfig) {
      localStorage.setItem(
        'khobza_version_config_v1',
        typeof data.versionConfig === 'string' ? data.versionConfig : JSON.stringify(data.versionConfig)
      );
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
  window.dispatchEvent(new Event('khobza_data_change'));
}

// --- Session Management ---
export interface SavedSession {
  role: UserRole;
  phone?: string;
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
    // Format YYYY-MM-DD or ISO string to YYYY/MM/DD for cross-platform Safari iOS compatibility
    const cleanDateStr = String(activationDate).replace(/-/g, '/').replace('T', ' ').split(' ')[0];
    const start = new Date(cleanDateStr).getTime();
    if (isNaN(start)) return 30; // Guard against NaN on iOS Safari
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
  // Auto update days remaining
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
  const cleanPhone = phone.trim();
  const families = getFamilies();
  return families.find((f) => f.phone === cleanPhone);
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

  if (familyData.id) {
    // Edit existing
    const days = calculateDaysRemaining(familyData.activationDate || today);
    const updatedList = list.map((f) =>
      f.id === familyData.id
        ? {
            ...f,
            ...familyData,
            packageType: pkgType,
            totalOrdersAllowed: familyData.totalOrdersAllowed ?? totalAllowed,
            remainingOrders: familyData.remainingOrders ?? (totalAllowed > 0 ? totalAllowed : -1),
            packagePriceIQD: familyData.packagePriceIQD ?? price,
            daysRemaining: days,
          }
        : f
    );
    setStorage(KEYS.FAMILIES, updatedList);
    return updatedList.find((f) => f.id === familyData.id)!;
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
    setStorage(KEYS.FAMILIES, list);
    return newFamily;
  }
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
  const matchedMandoub = mandoubs.find((m) => m.vlanCode === params.family.vlanCode);

  const req: RenewalRequest = {
    id,
    familyId: params.family.id,
    familyName: params.family.fullName,
    familyPhone: params.family.phone,
    vlanCode: params.family.vlanCode,
    areaName: params.family.areaName,
    mandoubId: matchedMandoub?.id,
    mandoubName: matchedMandoub?.name,
    requestedPackage: params.requestedPackage,
    packageName,
    packagePriceIQD: price,
    ordersCount: count,
    status: 'pending_mandoub',
    createdAt: new Date().toISOString(),
  };

  list.unshift(req);
  setStorage(KEYS.RENEWALS, list);

  sendBrowserNotification(
    'طلب تجديد اشتراك جديد 🔄',
    `أرسلت عائلة ${params.family.fullName} طلب تجديد لـ (${packageName}) بمبلغ ${price.toLocaleString()} د.ع`,
    { targetRole: 'mandoub' }
  );

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
  const updatedRequests = requests.map((r) =>
    r.id === requestId
      ? {
          ...r,
          status: 'confirmed' as const,
          mandoubId: mandoub.id,
          mandoubName: mandoub.name,
          confirmedAt: now,
        }
      : r
  );
  setStorage(KEYS.RENEWALS, updatedRequests);

  // 2. Update Family Package & Subscription Status
  const families = getFamilies();
  const updatedFamilies = families.map((f) => {
    if (f.id === req.familyId || f.phone === req.familyPhone) {
      return {
        ...f,
        packageType: req.requestedPackage,
        remainingOrders: req.ordersCount,
        totalOrdersAllowed: req.ordersCount,
        packagePriceIQD: req.packagePriceIQD,
        subscriptionStatus: 'active' as const,
        activationDate: today,
        daysRemaining: 30,
      };
    }
    return f;
  });
  setStorage(KEYS.FAMILIES, updatedFamilies);

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
  const updatedRequests = requests.map((r) =>
    r.id === requestId
      ? {
          ...r,
          status: 'rejected_mandoub' as const,
          mandoubId: mandoub.id,
          mandoubName: mandoub.name,
          rejectionReason: reason || 'تم رفض التجديد من قبل المندوب',
        }
      : r
  );
  setStorage(KEYS.RENEWALS, updatedRequests);
}

export function rejectRenewalRequestByAdmin(requestId: string, reason: string): void {
  const requests = getRenewalRequests();
  const updatedRequests = requests.map((r) =>
    r.id === requestId
      ? {
          ...r,
          status: 'rejected_admin' as const,
          rejectionReason: reason || 'تم رفض التجديد من قبل الأدمن',
        }
      : r
  );
  setStorage(KEYS.RENEWALS, updatedRequests);
}

export function renewFamilySubscription(familyId: string): void {
  const list = getFamilies();
  const today = new Date().toISOString().split('T')[0];
  const updatedList = list.map((f) =>
    f.id === familyId
      ? {
          ...f,
          activationDate: today,
          subscriptionStatus: 'active' as const,
          daysRemaining: 30,
        }
      : f
  );
  setStorage(KEYS.FAMILIES, updatedList);
}

export function toggleBlockFamily(familyId: string, shouldBlock: boolean): void {
  const list = getFamilies();
  const fam = list.find((f) => f.id === familyId);
  if (!fam) return;

  const updatedList = list.map((f) =>
    f.id === familyId ? { ...f, isBlocked: shouldBlock } : f
  );
  setStorage(KEYS.FAMILIES, updatedList);

  // Sync to blocked phones list
  let blocked = getBlockedPhones();
  if (shouldBlock) {
    if (!blocked.includes(fam.phone)) {
      blocked.push(fam.phone);
    }
  } else {
    blocked = blocked.filter((p) => p !== fam.phone);
  }
  setStorage(KEYS.BLOCKED_PHONES, blocked);
}

export function updateFamilyLocation(familyId: string, location: LocationData): void {
  const list = getFamilies();
  const updated = list.map((f) => (f.id === familyId ? { ...f, location } : f));
  setStorage(KEYS.FAMILIES, updated);
}

export function deleteFamily(familyId: string): void {
  const list = getFamilies().filter((f) => f.id !== familyId);
  setStorage(KEYS.FAMILIES, list, 'overwrite');
}

// --- Mandoubs ---
export function getMandoubs(): Mandoub[] {
  const list = getStorage<Mandoub[]>(KEYS.MANDOUBS, INITIAL_MANDOUBS);
  return list.map((m) => {
    if (!m.currentLocation) {
      return {
        ...m,
        currentLocation: {
          lat: 33.3128,
          lng: 44.3615,
          addressText: `موقع المندوب المباشر في منطقة ${m.areaName || 'بغداد'}`,
        },
      };
    }
    return m;
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
  if (data.id) {
    const updated = list.map((m) => (m.id === data.id ? { ...m, ...data } : m));
    setStorage(KEYS.MANDOUBS, updated, 'overwrite');
    return updated.find((m) => m.id === data.id)!;
  } else {
    const newMandoub: Mandoub = {
      ...data,
      id: `mandoub-${Date.now()}`,
    };
    list.push(newMandoub);
    setStorage(KEYS.MANDOUBS, list, 'overwrite');
    return newMandoub;
  }
}

export function deleteMandoub(id: string): void {
  const list = getMandoubs().filter((m) => m.id !== id);
  setStorage(KEYS.MANDOUBS, list, 'overwrite');
}

export function updateMandoubLocation(mandoubId: string, lat: number, lng: number, addressText?: string): void {
  const list = getMandoubs();
  const updated = list.map((m) =>
    m.id === mandoubId
      ? {
          ...m,
          currentLocation: {
            lat,
            lng,
            addressText: addressText || `موقع تحديث المندوب (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          },
        }
      : m
  );
  setStorage(KEYS.MANDOUBS, updated);
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

// Comprehensive asynchronous login that syncs with cloud and queries server if needed
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

  // 2. Check Admin locally
  const admin = authenticateAdmin(rawId, rawPass);
  if (admin) {
    saveSession({ role: 'admin', adminId: admin.id });
    return { success: true, role: 'admin', user: admin };
  }

  // 3. Check Mandoub locally
  const mandoub = authenticateMandoub(rawId, rawPass);
  if (mandoub) {
    if (mandoub.status === 'disabled' || mandoub.status === 'inactive') {
      return {
        success: false,
        error: 'عذراً، تم تعطيل حساب المندوب هذا من قبل الإدارة. يرجى التواصل مع مسؤول النظام.',
      };
    }
    saveSession({ role: 'mandoub', mandoubId: mandoub.id });
    return { success: true, role: 'mandoub', user: mandoub };
  }

  // 4. Fallback: Query direct /api/auth/staff server endpoint in case local storage was behind
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
          setStorage(KEYS.ADMINS, [...currentAdmins, adminUser]);
        }
        saveSession({ role: 'admin', adminId: adminUser.id });
        return { success: true, role: 'admin', user: adminUser };
      } else if (result.role === 'mandoub') {
        const mandoubUser = result.user as Mandoub;
        const currentMandoubs = getMandoubs();
        if (!currentMandoubs.some((m) => m.id === mandoubUser.id)) {
          setStorage(KEYS.MANDOUBS, [...currentMandoubs, mandoubUser]);
        }
        saveSession({ role: 'mandoub', mandoubId: mandoubUser.id });
        return { success: true, role: 'mandoub', user: mandoubUser };
      }
    } else if (result.message) {
      return { success: false, error: result.message };
    }
  } catch (err) {
    console.warn('Direct server auth fetch warning:', err);
  }

  // 5. Detect if username was correct but password wrong in local state
  const cleanId = normalizeDigits(rawId).toLowerCase();
  const idDigits = cleanId.replace(/\D/g, '');
  const allMandoubs = getMandoubs();
  const foundMandoubWrongPass = allMandoubs.find((m) => {
    const mUser = normalizeDigits(m.username || '').toLowerCase();
    const mPhone = normalizeDigits(m.phone || '').replace(/\D/g, '');
    return mUser === cleanId || (mPhone && idDigits && mPhone === idDigits);
  });

  if (foundMandoubWrongPass) {
    return {
      success: false,
      error: 'كلمة السر غير صحيحة. يرجى التأكد من كتابة كلمة السر بدقة',
    };
  }

  return {
    success: false,
    error: 'اسم المستخدم أو كلمة السر غير صحيحة. يرجى مراجعة الإدارة للتأكد من الحساب.',
  };
}

export function saveAdminAccount(data: Omit<AdminUser, 'id'> & { id?: string }): AdminUser {
  const list = getAdminAccounts();
  if (data.id) {
    const updated = list.map((a) => (a.id === data.id ? { ...a, ...data } : a));
    setStorage(KEYS.ADMINS, updated);
    return updated.find((a) => a.id === data.id)!;
  } else {
    const newAdmin: AdminUser = {
      ...data,
      id: `admin-${Date.now()}`,
    };
    list.push(newAdmin);
    setStorage(KEYS.ADMINS, list);
    return newAdmin;
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
    const randNum = Math.floor(100000 + Math.random() * 900000); // 6 digit number
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
  setStorage(KEYS.ORDERS, list);

  sendBrowserNotification(
    'طلب خبز جديد وصل للمندوب! 🥖🔔',
    `وصل طلب خبز جديد (${newOrder.quantity} ${newOrder.unitText}) لعائلة ${newOrder.familyName}`,
    { orderId: newOrder.id, targetRole: 'mandoub' }
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
      const updatedFamilies = families.map((f) =>
        f.id === fam.id
          ? {
              ...f,
              remainingOrders: newRemaining,
              subscriptionStatus: newRemaining <= 0 ? ('expired' as const) : f.subscriptionStatus,
            }
          : f
      );
      localStorage.setItem(KEYS.FAMILIES, JSON.stringify(updatedFamilies));
    }
  }

  // Atomically update local storage before pushing to prevent race conditions
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(updatedList));
  lastMutationTime = Date.now();
  window.dispatchEvent(new Event('khobza_data_change'));
  pushToServer('overwrite');

  if (updatedOrder) {
    if (newStatus === 'under_review') {
      sendBrowserNotification(
        '🎉 وصل الخبز إلى منزلكم!',
        `قام المندوب بتوصيل طلب الخبز (${updatedOrder.quantity} ${updatedOrder.unitText}). يرجى تأكيد الاستلام الآن!`,
        { orderId: updatedOrder.id, targetRole: 'family', force: true }
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
        { orderId: updatedOrder.id, targetRole: 'mandoub', force: true }
      );
      broadcastExternalPush({
        title: '✅ تم تأكيد استلام الطلب',
        body: `تم تأكيد استلام الطلب (${updatedOrder.quantity} ${updatedOrder.unitText}) بنجاح من قبل العائلة.`,
        targetRole: 'mandoub',
        orderId: updatedOrder.id,
      });
    } else if (newStatus === 'processing_unpaid' || newStatus === 'unpaid_confirmed') {
      sendBrowserNotification(
        'تنبيه: طلب غير مسدد ⚠️',
        `تم تسجيل بلاغ عدم تسديد للطلب ${updatedOrder.id} (${updatedOrder.familyName}).`,
        { orderId: updatedOrder.id, targetRole: 'all', force: true }
      );
    }
  }

  return updatedOrder;
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
    const mandoubOrders = orders.filter((o) => o.vlanCode === m.vlanCode);
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

  // Calculate gross revenue from active families and confirmed renewals
  activeFamilies.forEach((f) => {
    totalGrossRevenue += f.packagePriceIQD || 10000;
  });

  const mandoubSalaries = mandoubs.map((m) => {
    const vlanCustomers = activeFamilies.filter((f) => f.vlanCode === m.vlanCode);
    const count = vlanCustomers.length;

    // Total package cash collected by this Mandoub
    const vlanRenewals = renewals.filter(
      (r) => r.vlanCode === m.vlanCode || r.mandoubId === m.id
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
