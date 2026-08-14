// Supabase Cloud Database & Realtime Synchronization Client for Khobza App
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Family, Mandoub, Order, RenewalRequest, AdminUser, AppVersionConfig } from '../types';

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
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// ----------------------------------------------------
// Supabase Sync & Persistence Helper Methods
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
      supabase.from('app_config').select('*').eq('id', 'version_config').single(),
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

// Model Mappers
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
    currentLocation: db.current_location,
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
    status: m.status,
    current_location: m.currentLocation,
    salary_type: m.salaryType,
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
    unpaidResolved: db.unpaid_resolved,
    deductedFromPackage: db.deducted_from_package,
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
    unpaid_amount: m.unpaidAmount,
    unpaid_resolved: m.unpaidResolved,
    deducted_from_package: m.deductedFromPackage,
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
    status: db.status,
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
