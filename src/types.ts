export type UserRole = 'guest' | 'customer' | 'mandoub' | 'admin';

export type SubscriptionStatus = 'active' | 'inactive' | 'expired';

export type PackageType = 'saver' | 'medium' | 'unlimited';

export interface LocationData {
  lat: number;
  lng: number;
  addressText?: string;
}

export interface Family {
  id: string;
  fullName: string; // الاسم الثلاثي
  phone: string; // رقم هاتف العائلة
  location: LocationData; // الموقع الدقيق
  vlanCode: string; // رمز VLAN للمنطقة
  areaName?: string; // اسم المنطقة
  bakeryName?: string; // اسم المخبز
  subscriptionStatus: SubscriptionStatus; // حالة الاشتراك
  activationDate: string; // تاريخ التفعيل (YYYY-MM-DD)
  daysRemaining: number; // عدد الأيام المتبقية (30 يوم)
  isBlocked: boolean; // حظر العائلة
  notes?: string;
  packageType?: PackageType; // نوع الباقة (توفير / متوسطة / مفتوحة)
  remainingOrders?: number; // عدد الطلبات المتبقية في الباقة
  totalOrdersAllowed?: number; // إجمالي عدد الطلبات المسموحة
  packagePriceIQD?: number; // سعر الباقة بالدينار العراقي
}

export interface Mandoub {
  id: string;
  name: string; // اسم المندوب
  username: string; // اسم المستخدم
  password: string; // كلمة السر
  vlanCode: string; // رمز VLAN للمنطقة
  areaName: string; // اسم المنطقة
  status: 'active' | 'inactive' | 'disabled';
  phone?: string;
  currentLocation?: LocationData;
  salaryType?: 'fixed' | 'percentage'; // نوع الراتب (ثابت / نسبة مئوية)
  fixedSalaryAmount?: number; // الراتب الثابت بالدينار (مثال: 500,000)
  commissionPercentage?: number; // نسبة العمولات والنسبة المتغيرة (مثال: 15%)
}

export type RenewalStatus = 'pending_mandoub' | 'confirmed' | 'rejected_mandoub' | 'rejected_admin';

export interface RenewalRequest {
  id: string; // e.g. REN-9821
  familyId: string;
  familyName: string;
  familyPhone: string;
  vlanCode: string;
  areaName: string;
  mandoubId?: string;
  mandoubName?: string;
  requestedPackage: PackageType;
  packageName: string; // "باقة توفير" | "الباقة المتوسطة" | "الباقة المفتوحة"
  packagePriceIQD: number; // 10000 | 15000 | 20000
  ordersCount: number; // 15 | 25 | -1 (مفتوح)
  status: RenewalStatus;
  confirmedMandoubName?: string;
  rejectionReason?: string;
  createdAt: string; // ISO string
  confirmedAt?: string;
}

export interface AdminUser {
  id: string;
  username: string; // اسم المستخدم (default: admin123)
  password: string; // كلمة السر (default: admin123)
  fullName: string;
}

export type OrderType = 'kg' | 'loaf' | 'amount';
export type TimeSlot = 'morning' | 'afternoon' | 'evening';

export type OrderStatus =
  | 'pending' // جديد (في قائمة المندوب)
  | 'under_review' // قيد المراجعة (المندوب أكمَل وينتظر تأكيد الزبون)
  | 'completed_confirmed' // مكتمل ومؤكد (أرشيف)
  | 'processing_unpaid' // قيد المعالجة (طلب المندوب تحويله لغير مسدد بانتظار الأدمن)
  | 'unpaid_confirmed' // غير مسدد (مؤكد من الأدمن)
  | 'rejected_unpaid_returned'; // مرفوض من الأدمن ويعود للمندوب مع ملاحظة

export interface Order {
  id: string; // رقم خاص بالطلب (e.g. KH-982410)
  familyId: string;
  familyName: string;
  familyPhone: string;
  location: LocationData;
  vlanCode: string;
  areaName: string;
  bakeryName?: string;
  orderType: OrderType;
  priceAmount?: number; // المبلغ المادي بالدينار في حال كان الطلب مقابل مبلغ مادي
  quantity: number;
  unitText: string; // "كيلو" | "كيلوات" | "خبزة"
  timeSlot: TimeSlot;
  timeSlotText: string; // "صباحاً (٩-١١)" | "ظهراً (٣-٦)" | "ليلاً (٨-١٠)"
  status: OrderStatus;
  mandoubId?: string;
  mandoubName?: string;
  createdAt: string; // ISO string
  updatedAt: string;
  adminNote?: string; // ملاحظة الأدمن عند رفض الغير مسدد
  customerConfirmedAt?: string;
  unpaidAmount?: number; // مبلغ الدين غير المسدد بالدينار
  unpaidResolved?: boolean; // تم التسديد في نافذة الحسابات
  deductedFromPackage?: boolean; // هل تم خصمه من رصيد الباقة عند الاكتمل/عدم التسديد
}

export interface StatisticsData {
  totalOrders: number;
  totalFamilies: number;
  incompleteOrders: number;
  unpaidOrders: number;
  blockedFamilies: number;
  expiredFamilies: number;
  mandoubStats: {
    mandoubId: string;
    mandoubName: string;
    vlanCode: string;
    areaName: string;
    incompleteCount: number;
    completedCount: number;
    currentLocation?: LocationData;
  }[];
}

export interface AppVersionConfig {
  currentVersion: string; // e.g. "1.0.0"
  latestVersion: string; // e.g. "1.0.0" or "1.1.0"
  isMandatory: boolean; // if true, forces user to update
  releaseNotes: string; // "تحديث أمني وتحسينات في الأداء"
  releasedAt: string;
}

export interface AccountingSummary {
  totalCustomersCount: number;
  last30DaysCustomersCount: number;
  subscriptionFeeIQD: number; // 10,000 IQD
  mandoubPercentage: number; // 25%
  netProfitPerCustomerIQD: number; // 7,500 IQD
  totalNetProfitIQD: number; // Total net profit
  mandoubSalaries: {
    mandoubId: string;
    mandoubName: string;
    vlanCode: string;
    areaName: string;
    vlanCustomersCount: number;
    salaryIQD: number; // 25% * (customers in VLAN * 10,000 IQD) = 2,500 * customers
  }[];
}
