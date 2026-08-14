// Supabase Cloud Database & Realtime Synchronization Client for Khobza App
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Family, Mandoub, Order, RenewalRequest, AdminUser, AppVersionConfig, LocationData } from '../types';

// Environment variables or fallback config
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseInstance && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    } catch (err) {
      console.warn('Supabase initialization warning:', err);
      supabaseInstance = null;
    }
  }
  return supabaseInstance;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('your-project'));
}

export function getSupabaseConfigInfo(): { url: string; hasKey: boolean; isConfigured: boolean } {
  return {
    url: SUPABASE_URL || '',
    hasKey: Boolean(SUPABASE_ANON_KEY),
    isConfigured: isSupabaseConfigured(),
  };
}

// ----------------------------------------------------
// Complete Ready-to-Run SQL Schema for Supabase
// ----------------------------------------------------
export const SUPABASE_SCHEMA_SQL = `-- =========================================================================
-- KHOBZA APP - SUPABASE CLOUD DATABASE SCHEMA (ALL TABLES & RLS POLICIES)
-- الصق هذا الكود كاملاً في قسم (SQL Editor) في لوحة تحكم Supabase واضغط Run
-- =========================================================================

-- 1. جدول العوائل والمشتركين (Families Table)
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  full_name TEXT NOT NULL,
  vlan_code TEXT NOT NULL,
  area_name TEXT NOT NULL,
  package_type TEXT DEFAULT 'saver',
  days_remaining INTEGER DEFAULT 30,
  remaining_orders INTEGER DEFAULT 15,
  total_orders_allowed INTEGER DEFAULT 15,
  package_price_iqd NUMERIC DEFAULT 10000,
  subscription_status TEXT DEFAULT 'active',
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  activation_date TEXT,
  is_blocked BOOLEAN DEFAULT FALSE,
  bakery_name TEXT,
  location JSONB,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_families_phone ON families(phone);
CREATE INDEX IF NOT EXISTS idx_families_vlan ON families(vlan_code);

-- 2. جدول المندوبين والكادر (Mandoubs Table)
CREATE TABLE IF NOT EXISTS mandoubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  vlan_code TEXT NOT NULL,
  area_name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  current_location JSONB,
  salary_type TEXT DEFAULT 'percentage',
  fixed_salary_amount NUMERIC DEFAULT 0,
  commission_percentage NUMERIC DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mandoubs_username ON mandoubs(username);
CREATE INDEX IF NOT EXISTS idx_mandoubs_phone ON mandoubs(phone);
CREATE INDEX IF NOT EXISTS idx_mandoubs_vlan ON mandoubs(vlan_code);

-- 3. جدول مسؤولي ومشرفي النظام (Admins Table)
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول الطلبات المباشرة والتوصيل (Orders Table)
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  family_name TEXT NOT NULL,
  family_phone TEXT NOT NULL,
  vlan_code TEXT NOT NULL,
  area_name TEXT NOT NULL,
  bakery_name TEXT,
  location JSONB,
  order_type TEXT DEFAULT 'loaf',
  quantity INTEGER NOT NULL,
  price_amount NUMERIC,
  unit_text TEXT DEFAULT 'خبزة',
  time_slot TEXT DEFAULT 'morning',
  time_slot_text TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  mandoub_id TEXT,
  mandoub_name TEXT,
  customer_confirmed_at TIMESTAMPTZ,
  admin_note TEXT,
  unpaid_amount NUMERIC DEFAULT 0,
  unpaid_resolved BOOLEAN DEFAULT FALSE,
  deducted_from_package BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_orders_family ON orders(family_id);
CREATE INDEX IF NOT EXISTS idx_orders_mandoub ON orders(mandoub_id);
CREATE INDEX IF NOT EXISTS idx_orders_vlan ON orders(vlan_code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- 5. جدول طلبات تجديد الاشتراكات (Renewals Table)
CREATE TABLE IF NOT EXISTS renewals (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  family_name TEXT NOT NULL,
  family_phone TEXT NOT NULL,
  vlan_code TEXT NOT NULL,
  area_name TEXT NOT NULL,
  requested_package TEXT NOT NULL,
  package_name TEXT NOT NULL,
  package_price_iqd NUMERIC NOT NULL,
  orders_count INTEGER DEFAULT 15,
  status TEXT DEFAULT 'pending_mandoub',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  mandoub_id TEXT,
  mandoub_name TEXT,
  rejection_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_renewals_status ON renewals(status);
CREATE INDEX IF NOT EXISTS idx_renewals_vlan ON renewals(vlan_code);

-- 6. جدول الأرقام المحظورة (Blocked Phones Table)
CREATE TABLE IF NOT EXISTS blocked_phones (
  phone TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. جدول إعدادات وإصدارات التطبيق (App Config Table)
CREATE TABLE IF NOT EXISTS app_config (
  id TEXT PRIMARY KEY,
  config_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. جدول توكنات الإشعارات (FCM Tokens Table)
CREATE TABLE IF NOT EXISTS fcm_tokens (
  token TEXT PRIMARY KEY,
  phone TEXT,
  role TEXT,
  vlan_code TEXT,
  platform TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- تفعيل سياسات الأمان RLS (Row Level Security) والسماح بالقراءة والكتابة
-- =========================================================================
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandoubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access to families" ON families;
CREATE POLICY "Public access to families" ON families FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to mandoubs" ON mandoubs;
CREATE POLICY "Public access to mandoubs" ON mandoubs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to admins" ON admins;
CREATE POLICY "Public access to admins" ON admins FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to orders" ON orders;
CREATE POLICY "Public access to orders" ON orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to renewals" ON renewals;
CREATE POLICY "Public access to renewals" ON renewals FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to blocked_phones" ON blocked_phones;
CREATE POLICY "Public access to blocked_phones" ON blocked_phones FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to app_config" ON app_config;
CREATE POLICY "Public access to app_config" ON app_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to fcm_tokens" ON fcm_tokens;
CREATE POLICY "Public access to fcm_tokens" ON fcm_tokens FOR ALL USING (true) WITH CHECK (true);

-- إدخال حساب الأدمن الافتراضي إذا كان الجدول فارغاً
INSERT INTO admins (id, username, password, full_name)
VALUES ('admin-1', 'admin123', 'admin123', 'المدير العام (الأدمن الرئيس)')
ON CONFLICT (id) DO NOTHING;
`;

// Test connection and return status of each table
export async function testSupabaseConnectionDetailed(): Promise<{
  connected: boolean;
  message: string;
  tables: Record<string, boolean>;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      connected: false,
      message: 'لم يتم تكوين متغيرات VITE_SUPABASE_URL أو VITE_SUPABASE_ANON_KEY بعد.',
      tables: {},
    };
  }

  const tableNames = ['families', 'mandoubs', 'admins', 'orders', 'renewals', 'blocked_phones', 'app_config'];
  const results: Record<string, boolean> = {};
  let overallSuccess = true;

  try {
    for (const name of tableNames) {
      try {
        const { error } = await supabase.from(name).select('count', { count: 'exact', head: true });
        results[name] = !error;
        if (error) overallSuccess = false;
      } catch {
        results[name] = false;
        overallSuccess = false;
      }
    }

    return {
      connected: overallSuccess,
      message: overallSuccess
        ? 'تم الاتصال بقاعدة بيانات Supabase بنجاح! جميع الجداول مهيأة وتعمل.'
        : 'تم الاتصال بـ Supabase ولكن بعض الجداول غير منشأة بعد. يرجى تشغيل كود SQL في Supabase SQL Editor.',
      tables: results,
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `خطأ في الاتصال بـ Supabase: ${err?.message || 'تعذر الوصول'}`,
      tables: results,
    };
  }
}

// ----------------------------------------------------
// Direct Single Family Methods
// ----------------------------------------------------
export async function fetchFamilyByPhoneFromSupabase(cleanPhone: string): Promise<Family | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data: exact } = await supabase.from('families').select('*').eq('phone', cleanPhone).limit(1);
    if (exact && exact.length > 0) {
      return mapDbFamilyToModel(exact[0]);
    }

    if (cleanPhone.startsWith('0')) {
      const noZero = cleanPhone.slice(1);
      const { data: nz } = await supabase.from('families').select('*').eq('phone', noZero).limit(1);
      if (nz && nz.length > 0) return mapDbFamilyToModel(nz[0]);
    }

    if (!cleanPhone.startsWith('0')) {
      const withZero = '0' + cleanPhone;
      const { data: wz } = await supabase.from('families').select('*').eq('phone', withZero).limit(1);
      if (wz && wz.length > 0) return mapDbFamilyToModel(wz[0]);
    }

    const { data: all } = await supabase.from('families').select('*');
    if (all && Array.isArray(all)) {
      const match = all.find((f: any) => {
        const p1 = String(f.phone || '').replace(/\D/g, '');
        const p2 = cleanPhone.replace(/\D/g, '');
        return p1 === p2 || p1.endsWith(p2) || p2.endsWith(p1);
      });
      if (match) return mapDbFamilyToModel(match);
    }
  } catch (err) {
    console.warn('Supabase family lookup error:', err);
  }
  return null;
}

export async function upsertFamilyToSupabase(family: Family): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const dbRow = mapModelFamilyToDb(family);
    const { error } = await supabase.from('families').upsert(dbRow, { onConflict: 'id' });
    return !error;
  } catch (err) {
    console.error('Error saving family to Supabase:', err);
    return false;
  }
}

export async function deleteFamilyFromSupabase(familyId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('families').delete().eq('id', familyId);
    return !error;
  } catch (err) {
    console.error('Error deleting family from Supabase:', err);
    return false;
  }
}

export async function updateFamilyLocationInSupabase(familyId: string, location: LocationData): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('families').update({ location, updated_at: new Date().toISOString() }).eq('id', familyId);
    return !error;
  } catch (err) {
    return false;
  }
}

// ----------------------------------------------------
// Direct Mandoub Methods
// ----------------------------------------------------
export async function upsertMandoubToSupabase(mandoub: Mandoub): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const dbRow = mapModelMandoubToDb(mandoub);
    const { error } = await supabase.from('mandoubs').upsert(dbRow, { onConflict: 'id' });
    return !error;
  } catch (err) {
    console.error('Error saving mandoub to Supabase:', err);
    return false;
  }
}

export async function deleteMandoubFromSupabase(mandoubId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('mandoubs').delete().eq('id', mandoubId);
    return !error;
  } catch (err) {
    console.error('Error deleting mandoub from Supabase:', err);
    return false;
  }
}

export async function updateMandoubLocationInSupabase(mandoubId: string, location: LocationData): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('mandoubs').update({ current_location: location, updated_at: new Date().toISOString() }).eq('id', mandoubId);
    return !error;
  } catch (err) {
    return false;
  }
}

// ----------------------------------------------------
// Direct Order Methods
// ----------------------------------------------------
export async function upsertOrderToSupabase(order: Order): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const dbRow = mapModelOrderToDb(order);
    const { error } = await supabase.from('orders').upsert(dbRow, { onConflict: 'id' });
    return !error;
  } catch (err) {
    console.error('Error saving order to Supabase:', err);
    return false;
  }
}

export async function deleteOrderFromSupabase(orderId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    return !error;
  } catch (err) {
    console.error('Error deleting order from Supabase:', err);
    return false;
  }
}

// ----------------------------------------------------
// Direct Renewal Methods
// ----------------------------------------------------
export async function upsertRenewalToSupabase(renewal: RenewalRequest): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const dbRow = mapModelRenewalToDb(renewal);
    const { error } = await supabase.from('renewals').upsert(dbRow, { onConflict: 'id' });
    return !error;
  } catch (err) {
    console.error('Error saving renewal to Supabase:', err);
    return false;
  }
}

// ----------------------------------------------------
// Direct Admin Methods
// ----------------------------------------------------
export async function upsertAdminToSupabase(admin: AdminUser): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const dbRow = mapModelAdminToDb(admin);
    const { error } = await supabase.from('admins').upsert(dbRow, { onConflict: 'id' });
    return !error;
  } catch (err) {
    return false;
  }
}

export async function deleteAdminFromSupabase(adminId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('admins').delete().eq('id', adminId);
    return !error;
  } catch (err) {
    return false;
  }
}

// ----------------------------------------------------
// Blocked Phones & App Config
// ----------------------------------------------------
export async function upsertBlockedPhoneToSupabase(phone: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('blocked_phones').upsert({ phone, created_at: new Date().toISOString() });
    return !error;
  } catch {
    return false;
  }
}

export async function deleteBlockedPhoneFromSupabase(phone: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('blocked_phones').delete().eq('phone', phone);
    return !error;
  } catch {
    return false;
  }
}

export async function saveVersionConfigToSupabase(config: AppVersionConfig): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('app_config').upsert({
      id: 'version_config',
      config_json: config,
      updated_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// Complete Database Clear / Wipe
// ----------------------------------------------------
export async function clearAllSupabaseTables(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    await Promise.allSettled([
      supabase.from('families').delete().neq('id', '___NEVER_MATCH___'),
      supabase.from('mandoubs').delete().neq('id', '___NEVER_MATCH___'),
      supabase.from('orders').delete().neq('id', '___NEVER_MATCH___'),
      supabase.from('renewals').delete().neq('id', '___NEVER_MATCH___'),
      supabase.from('blocked_phones').delete().neq('phone', '___NEVER_MATCH___'),
    ]);
    return true;
  } catch (err) {
    console.error('Error clearing Supabase tables:', err);
    return false;
  }
}

// ----------------------------------------------------
// Fetch All & Push All Bulk Methods
// ----------------------------------------------------
export async function fetchAllFromSupabase(): Promise<{
  families: Family[] | null;
  mandoubs: Mandoub[] | null;
  admins: AdminUser[] | null;
  orders: Order[] | null;
  renewals: RenewalRequest[] | null;
  blockedPhones: string[] | null;
  versionConfig: AppVersionConfig | null;
} | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const [
      familiesRes,
      mandoubsRes,
      adminsRes,
      ordersRes,
      renewalsRes,
      blockedRes,
      configRes,
    ] = await Promise.all([
      supabase.from('families').select('*'),
      supabase.from('mandoubs').select('*'),
      supabase.from('admins').select('*'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('renewals').select('*').order('created_at', { ascending: false }),
      supabase.from('blocked_phones').select('phone'),
      supabase.from('app_config').select('*').eq('id', 'version_config').maybeSingle(),
    ]);

    return {
      families: familiesRes.data ? familiesRes.data.map(mapDbFamilyToModel) : null,
      mandoubs: mandoubsRes.data ? mandoubsRes.data.map(mapDbMandoubToModel) : null,
      admins: adminsRes.data ? adminsRes.data.map(mapDbAdminToModel) : null,
      orders: ordersRes.data ? ordersRes.data.map(mapDbOrderToModel) : null,
      renewals: renewalsRes.data ? renewalsRes.data.map(mapDbRenewalToModel) : null,
      blockedPhones: blockedRes.data ? blockedRes.data.map((r: any) => r.phone) : null,
      versionConfig: configRes.data ? (configRes.data.config_json as AppVersionConfig) : null,
    };
  } catch (err) {
    console.error('Error fetching from Supabase:', err);
    return null;
  }
}

export async function pushAllToSupabase(data: {
  families?: Family[];
  mandoubs?: Mandoub[];
  admins?: AdminUser[];
  orders?: Order[];
  renewals?: RenewalRequest[];
  blockedPhones?: string[];
  versionConfig?: AppVersionConfig;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const promises: Promise<any>[] = [];

    if (data.families && data.families.length > 0) {
      const dbFamilies = data.families.map(mapModelFamilyToDb);
      promises.push(Promise.resolve(supabase.from('families').upsert(dbFamilies, { onConflict: 'id' })));
    }

    if (data.mandoubs && data.mandoubs.length > 0) {
      const dbMandoubs = data.mandoubs.map(mapModelMandoubToDb);
      promises.push(Promise.resolve(supabase.from('mandoubs').upsert(dbMandoubs, { onConflict: 'id' })));
    }

    if (data.orders && data.orders.length > 0) {
      const dbOrders = data.orders.map(mapModelOrderToDb);
      promises.push(Promise.resolve(supabase.from('orders').upsert(dbOrders, { onConflict: 'id' })));
    }

    if (data.renewals && data.renewals.length > 0) {
      const dbRenewals = data.renewals.map(mapModelRenewalToDb);
      promises.push(Promise.resolve(supabase.from('renewals').upsert(dbRenewals, { onConflict: 'id' })));
    }

    if (data.admins && data.admins.length > 0) {
      const dbAdmins = data.admins.map(mapModelAdminToDb);
      promises.push(Promise.resolve(supabase.from('admins').upsert(dbAdmins, { onConflict: 'id' })));
    }

    if (data.blockedPhones && data.blockedPhones.length > 0) {
      const dbBlocked = data.blockedPhones.map((p) => ({ phone: p, created_at: new Date().toISOString() }));
      promises.push(Promise.resolve(supabase.from('blocked_phones').upsert(dbBlocked, { onConflict: 'phone' })));
    }

    if (data.versionConfig) {
      promises.push(
        Promise.resolve(
          supabase.from('app_config').upsert({
            id: 'version_config',
            config_json: data.versionConfig,
            updated_at: new Date().toISOString(),
          })
        )
      );
    }

    await Promise.all(promises);
    return true;
  } catch (err) {
    console.error('Error pushing to Supabase:', err);
    return false;
  }
}

// ----------------------------------------------------
// Realtime Subscription Helper
// ----------------------------------------------------
export function subscribeToSupabaseRealtime(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  try {
    const channel = supabase
      .channel('public-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'families' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mandoubs' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'renewals' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, () => {
        onChange();
        window.dispatchEvent(new Event('khobza_version_change'));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('Realtime subscription warning:', err);
    return () => {};
  }
}

// ----------------------------------------------------
// Model Mappers
// ----------------------------------------------------
function mapDbFamilyToModel(db: any): Family {
  return {
    id: db.id,
    phone: db.phone,
    fullName: db.full_name,
    vlanCode: db.vlan_code,
    areaName: db.area_name,
    packageType: db.package_type || 'saver',
    activationDate: db.activation_date || db.registered_at || new Date().toISOString().split('T')[0],
    daysRemaining: typeof db.days_remaining === 'number' ? db.days_remaining : 30,
    remainingOrders: db.remaining_orders,
    totalOrdersAllowed: typeof db.total_orders_allowed === 'number' ? db.total_orders_allowed : (db.package_type === 'medium' ? 25 : db.package_type === 'unlimited' ? -1 : 15),
    packagePriceIQD: typeof db.package_price_iqd === 'number' ? db.package_price_iqd : (db.package_type === 'medium' ? 15000 : db.package_type === 'unlimited' ? 20000 : 10000),
    subscriptionStatus: db.subscription_status || 'active',
    isBlocked: Boolean(db.is_blocked),
    bakeryName: db.bakery_name,
    location: db.location || { lat: 33.3152, lng: 44.3661 },
    notes: db.notes,
  };
}

function mapModelFamilyToDb(m: Family): any {
  return {
    id: m.id,
    phone: m.phone,
    full_name: m.fullName,
    vlan_code: m.vlanCode,
    area_name: m.areaName,
    package_type: m.packageType,
    days_remaining: m.daysRemaining,
    remaining_orders: m.remainingOrders,
    total_orders_allowed: m.totalOrdersAllowed,
    package_price_iqd: m.packagePriceIQD,
    subscription_status: m.subscriptionStatus,
    registered_at: m.activationDate || new Date().toISOString(),
    activation_date: m.activationDate,
    is_blocked: m.isBlocked,
    bakery_name: m.bakeryName,
    location: m.location,
    notes: m.notes,
    updated_at: new Date().toISOString(),
  };
}

function mapDbMandoubToModel(db: any): Mandoub {
  return {
    id: db.id,
    name: db.name,
    phone: db.phone,
    username: db.username,
    password: db.password,
    vlanCode: db.vlan_code,
    areaName: db.area_name,
    status: db.status || 'active',
    currentLocation: db.current_location || { lat: 33.3128, lng: 44.3615, addressText: `موقع المندوب في ${db.area_name || 'المنطقة'}` },
    salaryType: db.salary_type || 'percentage',
    fixedSalaryAmount: db.fixed_salary_amount,
    commissionPercentage: db.commission_percentage,
  };
}

function mapModelMandoubToDb(m: Mandoub): any {
  return {
    id: m.id,
    name: m.name,
    phone: m.phone,
    username: m.username,
    password: m.password,
    vlan_code: m.vlanCode,
    area_name: m.areaName,
    status: m.status || 'active',
    current_location: m.currentLocation,
    salary_type: m.salaryType || 'percentage',
    fixed_salary_amount: m.fixedSalaryAmount,
    commission_percentage: m.commissionPercentage,
    updated_at: new Date().toISOString(),
  };
}

function mapDbAdminToModel(db: any): AdminUser {
  return {
    id: db.id,
    username: db.username,
    password: db.password,
    fullName: db.full_name,
  };
}

function mapModelAdminToDb(m: AdminUser): any {
  return {
    id: m.id,
    username: m.username,
    password: m.password,
    full_name: m.fullName,
    updated_at: new Date().toISOString(),
  };
}

function mapDbOrderToModel(db: any): Order {
  return {
    id: db.id,
    familyId: db.family_id,
    familyName: db.family_name,
    familyPhone: db.family_phone,
    vlanCode: db.vlan_code,
    areaName: db.area_name,
    bakeryName: db.bakery_name || 'مخبز الخبزة الرئيسي',
    location: db.location || { lat: 33.3152, lng: 44.3661 },
    orderType: db.order_type || 'loaf',
    quantity: db.quantity,
    priceAmount: db.price_amount,
    unitText: db.unit_text || 'خبزة',
    timeSlot: db.time_slot || 'morning',
    timeSlotText: db.time_slot_text || '',
    status: db.status || 'pending',
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    mandoubId: db.mandoub_id,
    mandoubName: db.mandoub_name,
    customerConfirmedAt: db.customer_confirmed_at,
    adminNote: db.admin_note,
    unpaidAmount: db.unpaid_amount,
    unpaidResolved: Boolean(db.unpaid_resolved),
    deductedFromPackage: Boolean(db.deducted_from_package),
  };
}

function mapModelOrderToDb(m: Order): any {
  return {
    id: m.id,
    family_id: m.familyId,
    family_name: m.familyName,
    family_phone: m.familyPhone,
    vlan_code: m.vlanCode,
    area_name: m.areaName,
    bakery_name: m.bakeryName,
    location: m.location,
    order_type: m.orderType,
    quantity: m.quantity,
    price_amount: m.priceAmount,
    unit_text: m.unitText,
    time_slot: m.timeSlot,
    time_slot_text: m.timeSlotText,
    status: m.status,
    created_at: m.createdAt,
    updated_at: m.updatedAt || new Date().toISOString(),
    mandoub_id: m.mandoubId,
    mandoub_name: m.mandoubName,
    customer_confirmed_at: m.customerConfirmedAt,
    admin_note: m.adminNote,
    unpaid_amount: m.unpaidAmount || 0,
    unpaid_resolved: m.unpaidResolved || false,
    deducted_from_package: m.deductedFromPackage || false,
  };
}

function mapDbRenewalToModel(db: any): RenewalRequest {
  return {
    id: db.id,
    familyId: db.family_id,
    familyName: db.family_name,
    familyPhone: db.family_phone,
    vlanCode: db.vlan_code,
    areaName: db.area_name,
    requestedPackage: db.requested_package,
    packageName: db.package_name,
    packagePriceIQD: db.package_price_iqd,
    ordersCount: db.orders_count || 15,
    status: db.status || 'pending_mandoub',
    createdAt: db.created_at,
    confirmedAt: db.confirmed_at,
    mandoubId: db.mandoub_id,
    mandoubName: db.mandoub_name,
    rejectionReason: db.rejection_reason,
  };
}

function mapModelRenewalToDb(m: RenewalRequest): any {
  return {
    id: m.id,
    family_id: m.familyId,
    family_name: m.familyName,
    family_phone: m.familyPhone,
    vlan_code: m.vlanCode,
    area_name: m.areaName,
    requested_package: m.requestedPackage,
    package_name: m.packageName,
    package_price_iqd: m.packagePriceIQD,
    orders_count: m.ordersCount,
    status: m.status,
    created_at: m.createdAt,
    confirmed_at: m.confirmedAt,
    mandoub_id: m.mandoubId,
    mandoub_name: m.mandoubName,
    rejection_reason: m.rejectionReason,
    updated_at: new Date().toISOString(),
  };
}

