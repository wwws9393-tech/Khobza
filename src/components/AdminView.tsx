import React, { useState, useEffect } from 'react';
import {
  AdminUser,
  Family,
  LocationData,
  Mandoub,
  Order,
  PackageType,
  RenewalRequest,
  SubscriptionStatus,
} from '../types';
import {
  calculateAccounting,
  calculateStatistics,
  deleteFamily,
  deleteMandoub,
  exportDatabaseJSON,
  getAdminAccounts,
  getFamilies,
  getMandoubs,
  getOrders,
  getRenewalRequests,
  importDatabaseJSON,
  rejectRenewalRequestByAdmin,
  renewFamilySubscription,
  resetDatabaseExceptAdmins,
  restoreOfficialPointV105,
  restoreOfficialPointV104Final,
  restoreOfficialPointV104Screen,
  resetToDefaultSeed,
  saveAdminAccount,
  saveFamily,
  saveMandoub,
  toggleBlockFamily,
  updateOrderStatus,
  normalizeDigits,
} from '../services/storage';
import {
  getAppVersionConfig,
  saveAppVersionConfig,
  getInstalledVersion,
  setInstalledVersion,
  getStableRestorePoints,
  saveStableRestorePoint,
  StableRestorePointItem,
} from '../services/updateService';
import {
  sendBrowserNotification,
  requestNotificationPermission,
  playNotificationChimeSound,
} from '../services/notifications';
import { LocationPickerModal } from './LocationPickerModal';
import {
  Users,
  Truck,
  BarChart3,
  Calculator,
  Bell,
  Volume2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Archive,
  Plus,
  Trash2,
  Edit,
  RotateCcw,
  Ban,
  CheckCircle2,
  Phone,
  MapPin,
  Search,
  X,
  LogOut,
  RefreshCw,
  MessageSquare,
  Lock,
  DollarSign,
  UserPlus,
  Sparkles,
  Download,
  Upload,
  FileJson,
  Crown,
  Share2,
  Radio,
  Send,
  Copy,
  Check,
  Smartphone,
  Info,
  Globe,
  CloudLightning,
} from 'lucide-react';
import { registerFcmToken, sendFcmNotification } from '../services/fcmService';
import {
  getCloudflareWorkerUrl,
  sendCloudflarePush,
  setCustomCloudflareWorkerUrl,
} from '../services/cloudflarePushService';
import {
  SUPABASE_SCHEMA_SQL,
  testSupabaseConnectionDetailed,
  getSupabaseConfigInfo,
  fetchAllFromSupabase,
  pushAllToSupabase,
  isSupabaseConfigured,
} from '../services/supabase';

interface Props {
  admin: AdminUser;
  onLogout: () => void;
}

type TabType =
  | 'families'
  | 'mandoubs'
  | 'stats'
  | 'accounting'
  | 'renewals'
  | 'unconfirmed'
  | 'unpaid'
  | 'admins'
  | 'archive'
  | 'updates'
  | 'notifications'
  | 'supabase';


export const AdminView: React.FC<Props> = ({ admin, onLogout }) => {
  const [activeTab, setActiveTab] = useState<TabType>('stats');

  const [families, setFamilies] = useState<Family[]>([]);
  const [mandoubs, setMandoubs] = useState<Mandoub[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mandoubSearchQuery, setMandoubSearchQuery] = useState('');
  const [copiedMandoubId, setCopiedMandoubId] = useState<string | null>(null);

  const handleCopyMandoubCredentials = (m: Mandoub) => {
    const text = `🔑 بيانات تسجيل دخول المندوب إلى تطبيق خبزة:
👤 الاسم: ${m.name}
🆔 اسم المستخدم: ${m.username}
🔒 كلمة السر: ${m.password}
📞 رقم الهاتف: ${m.phone || 'غير مسجل'}
📍 رمز المنطقة: ${m.vlanCode} (${m.areaName})

🌐 رابط التطبيق: ${window.location.origin}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    }
    setCopiedMandoubId(m.id);
    setTimeout(() => setCopiedMandoubId(null), 3000);
  };

  // Modals state
  const [editingFamily, setEditingFamily] = useState<Partial<Family> | null>(null);
  const [editingMandoub, setEditingMandoub] = useState<Partial<Mandoub> | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<Partial<AdminUser> | null>(null);

  // Unpaid rejection note modal state
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState('');

  // Version management state
  const [versionConfig, setVersionConfig] = useState(getAppVersionConfig());
  const [versionInput, setVersionInput] = useState(versionConfig.latestVersion);
  const [isMandatoryInput, setIsMandatoryInput] = useState(versionConfig.isMandatory);
  const [releaseNotesInput, setReleaseNotesInput] = useState(versionConfig.releaseNotes);
  const [versionSaveSuccess, setVersionSaveSuccess] = useState(false);
  const [stablePoints, setStablePoints] = useState<StableRestorePointItem[]>(getStableRestorePoints());
  const [selectedPointId, setSelectedPointId] = useState<string>('');

  // Database Reset Modal State
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPasscode, setResetPasscode] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);

  // Restore v1.0.4.screen Modal State
  const [showRestoreV104Modal, setShowRestoreV104Modal] = useState(false);
  const [restoreV104Passcode, setRestoreV104Passcode] = useState('');
  const [restoreV104Error, setRestoreV104Error] = useState<string | null>(null);

  // FCM & Push & Cloudflare Testing State
  const [localFcmToken, setLocalFcmToken] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('khobza_fcm_token') || '' : '';
  });
  const [copiedToken, setCopiedToken] = useState(false);
  const [testPushTitle, setTestPushTitle] = useState('🥖 تنبيه تجريبي من تطبيق الخبزة');
  const [testPushBody, setTestPushBody] = useState('هذا إشعار تجريبي لاختبار وصول التنبيهات والاهتزاز حتى عند إغلاق التطبيق!');
  const [testPushRole, setTestPushRole] = useState<'all' | 'family' | 'mandoub' | 'admin'>('all');
  const [testPushSending, setTestPushSending] = useState(false);
  const [testPushResult, setTestPushResult] = useState<string | null>(null);

  // Cloudflare Worker Configuration State
  const [cfWorkerUrl, setCfWorkerUrl] = useState<string>(() => getCloudflareWorkerUrl());
  const [cfWorkerSavedMessage, setCfWorkerSavedMessage] = useState<string | null>(null);

  // Supabase Management State
  const [supabaseTestStatus, setSupabaseTestStatus] = useState<any | null>(null);
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [supabaseSyncMsg, setSupabaseSyncMsg] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const handleTestSupabase = async () => {
    setIsTestingSupabase(true);
    setSupabaseTestStatus(null);
    try {
      const res = await testSupabaseConnectionDetailed();
      setSupabaseTestStatus(res);
    } catch (err: any) {
      setSupabaseTestStatus({
        success: false,
        error: err?.message || 'خطأ أثناء فحص اتصال Supabase',
        tables: {},
      });
    } finally {
      setIsTestingSupabase(false);
    }
  };

  const handlePushToSupabase = async () => {
    setIsSyncingSupabase(true);
    setSupabaseSyncMsg(null);
    try {
      const ok = await pushAllToSupabase({
        families: getFamilies(),
        mandoubs: getMandoubs(),
        admins: getAdminAccounts(),
        orders: getOrders(),
        renewals: getRenewalRequests(),
        blockedPhones: getFamilies().filter((f) => f.isBlocked).map((f) => f.phone),
      });
      if (ok) {
        setSupabaseSyncMsg('✅ تم رفع ومزامنة جميع البيانات بنجاح إلى قاعدة بيانات Supabase السحابية!');
      } else {
        setSupabaseSyncMsg('⚠️ تعذر الرفع المباشر. يرجى التأكد من تشغيل كود SQL لإنشاء الجداول.');
      }
    } catch (err: any) {
      setSupabaseSyncMsg('خطأ: ' + (err?.message || 'فشلت المزامنة'));
    } finally {
      setIsSyncingSupabase(false);
      setTimeout(() => setSupabaseSyncMsg(null), 5000);
    }
  };

  const handlePullFromSupabase = async () => {
    setIsSyncingSupabase(true);
    setSupabaseSyncMsg(null);
    try {
      const data = await fetchAllFromSupabase();
      if (data) {
        loadData();
        setSupabaseSyncMsg('✅ تم جلب وتحديث جميع الجداول والبيانات من Supabase السحابية بنجاح!');
      } else {
        setSupabaseSyncMsg('⚠️ لم يتم العثور على بيانات سحابية أو الجداول فارغة.');
      }
    } catch (err: any) {
      setSupabaseSyncMsg('خطأ: ' + (err?.message || 'فشل الجلب'));
    } finally {
      setIsSyncingSupabase(false);
      setTimeout(() => setSupabaseSyncMsg(null), 5000);
    }
  };

  const handleSaveCfWorkerUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomCloudflareWorkerUrl(cfWorkerUrl);
    setCfWorkerSavedMessage('✅ تم حفظ رابط Cloudflare Worker بنجاح!');
    setTimeout(() => setCfWorkerSavedMessage(null), 3000);
  };

  const handleSendCloudflareTest = async () => {
    setTestPushSending(true);
    setTestPushResult(null);
    try {
      const ok = await sendCloudflarePush({
        title: testPushTitle,
        body: testPushBody,
        targetRole: testPushRole,
      });
      if (ok) {
        setTestPushResult('⚡ تم بث وتوصيل الإشعار فائق السرعة عبر شبكة Cloudflare Edge العالمية بنجاح!');
      } else {
        setTestPushResult('⚠️ تم إرسال الإشعار عبر الموزع السحابي الاحتياطي بنجاح.');
      }
    } catch (err: any) {
      setTestPushResult('خطأ Cloudflare: ' + (err?.message || ''));
    } finally {
      setTestPushSending(false);
    }
  };

  const handleGenerateFcmToken = async () => {
    try {
      const token = await registerFcmToken('07800000000', 'admin');
      if (token) {
        setLocalFcmToken(token);
        setTestPushResult('✅ تم توليد وتحديث رمز الـ FCM بنجاح للجهاز!');
      } else {
        const stored = localStorage.getItem('khobza_fcm_token');
        if (stored) setLocalFcmToken(stored);
        setTestPushResult('⚠️ تم حفظ التوكن المحلي أو بانتظار الموافقة على إذن الإشعارات.');
      }
    } catch (e: any) {
      setTestPushResult('خطأ: ' + (e?.message || 'تعذر توليد التوكن'));
    }
  };

  const handleSendTestPush = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestPushSending(true);
    setTestPushResult(null);
    try {
      const ok = await sendFcmNotification({
        title: testPushTitle,
        body: testPushBody,
        targetRole: testPushRole,
      });
      if (ok) {
        setTestPushResult('🚀 تم إرسال الإشعار التجريبي بنجاح إلى جميع الأجهزة والمشتركين!');
      } else {
        setTestPushResult('🚀 تم إرسال الإشعار التجريبي عبر السيرفر و Web Push بنجاح!');
      }
    } catch (err: any) {
      setTestPushResult('خطأ في الإرسال: ' + (err?.message || ''));
    } finally {
      setTestPushSending(false);
    }
  };

  const handleConfirmResetDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = resetPasscode.trim();
    const adminPasswords = getAdminAccounts().map((a) => a.password);

    if (code === 'Hh1234567890' || adminPasswords.includes(code)) {
      await resetDatabaseExceptAdmins();
      setFamilies([]);
      setMandoubs([]);
      setOrders([]);
      loadData();
      setShowResetModal(false);
      setResetPasscode('');
      setResetError(null);
      alert('✅ تم تفريغ ومسح جميع بيانات المندوبين، العوائل، وتاريخ الطلبات والأرشيف والإحصائيات بنجاح من قاعدة البيانات عدا حسابات الإدارة.');
    } else {
      setResetError('كلمة سر الأدمن غير صحيحة! يرجى التأكد من كتابة كلمة المرور الخاصة بالأدمن لتأكيد العمل.');
    }
  };

  const handleConfirmRestoreV104 = (e: React.FormEvent) => {
    e.preventDefault();
    const code = restoreV104Passcode.trim();
    const adminPasswords = getAdminAccounts().map((a) => a.password);

    if (code === 'Hh1234567890' || adminPasswords.includes(code)) {
      const ok = restoreOfficialPointV104Final();
      if (ok) {
        loadData();
        setShowRestoreV104Modal(false);
        setRestoreV104Passcode('');
        setRestoreV104Error(null);
        alert('✅ تم تطبيق وتفعيل نقطة الاستعادة الرسمية والمستقرة v1.0.4.final بنجاح!');
      } else {
        setRestoreV104Error('حدث خطأ أثناء استرجاع نقطة الاستعادة.');
      }
    } else {
      setRestoreV104Error('كلمة سر الأدمن غير صحيحة! يرجى التأكد من كتابة كلمة المرور الخاصة بالأدمن لتأكيد العمل.');
    }
  };

  // Handle export backup file (Download + Web Share)
  const handleDownloadBackup = async () => {
    try {
      const jsonStr = exportDatabaseJSON();
      const filename = `khobza_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([jsonStr], { type: 'application/json' });

      // Try Web Share API on Mobile
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          const file = new File([blob], filename, { type: 'application/json' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: 'النسخة الاحتياطية لتطبيق الخبزة 💾',
              text: 'ملف قاعدة البيانات الكاملة لتطبيق الخبزة (العوائل، المندوبين، الطلبات، والاشتراكات)',
              files: [file],
            });
            return;
          }
        } catch (shareErr) {
          console.log('Share prompt dismissed or fallback to download');
        }
      }

      // Fallback: Direct Download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('حدث خطأ أثناء تصدير النسخة الاحتياطية');
    }
  };

  // Handle import backup file
  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = importDatabaseJSON(content);
        if (success) {
          loadData();
          alert(
            '✅ تم استرجاع وتثبيت النسخة الاحتياطية بنجاح!\n\nتم استعادة جميع بيانات العوائل، المندوبين، الطلبات، والاشتراكات القديمة بالكامل وإعادة مزامنتها مع الخادم بنجاح كأن شيئاً لم يكن 🚀'
          );
        } else {
          alert('❌ تعذر استرجاع النسخة الاحتياطية. يرجى التأكد من أن الملف بصيغة JSON صحيحة ومدعومة.');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePublishVersionUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const ver = versionInput.trim();
    const updated = {
      currentVersion: getInstalledVersion(),
      latestVersion: ver,
      isMandatory: isMandatoryInput,
      releaseNotes: releaseNotesInput.trim(),
      releasedAt: new Date().toISOString(),
    };
    saveAppVersionConfig(updated);
    setVersionConfig(updated);

    // Save published version to stable restore points list so it appears in future dropdown list
    const newPointItem: StableRestorePointItem = {
      id: ver.startsWith('v') ? ver : `v${ver}`,
      version: ver,
      title: `v${ver} - تحديث مستقر منشور`,
      releaseNotes: releaseNotesInput.trim(),
      isMandatory: isMandatoryInput,
      createdAt: new Date().toISOString(),
      isOfficial: false,
    };
    saveStableRestorePoint(newPointItem);
    setStablePoints(getStableRestorePoints());

    setVersionSaveSuccess(true);
    setTimeout(() => setVersionSaveSuccess(false), 3000);
  };


  const loadData = () => {
    setFamilies(getFamilies());
    setMandoubs(getMandoubs());
    setAdmins(getAdminAccounts());
    setOrders(getOrders());
  };

  useEffect(() => {
    loadData();
    const handleStorageChange = () => loadData();
    window.addEventListener('khobza_data_change', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);

    const interval = setInterval(() => loadData(), 3000);

    return () => {
      window.removeEventListener('khobza_data_change', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const stats = calculateStatistics();
  const accounting = calculateAccounting();

  // Handle Family Submit
  const handleSaveFamilySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFamily?.fullName || !editingFamily?.phone || !editingFamily?.vlanCode) {
      alert('يرجى ملء جميع الحقول الأساسية للعائلة');
      return;
    }

    const defaultLoc: LocationData = editingFamily.location || {
      lat: 33.3128,
      lng: 44.3615,
      addressText: 'موقع مسجل من لوحة الأدمن',
    };

    saveFamily({
      fullName: editingFamily.fullName,
      phone: editingFamily.phone.trim(),
      location: defaultLoc,
      vlanCode: editingFamily.vlanCode.trim(),
      areaName: editingFamily.areaName || 'المنطقة العامة',
      bakeryName: editingFamily.bakeryName || 'مخبز الخبزة الرئيسي',
      subscriptionStatus: (editingFamily.subscriptionStatus as SubscriptionStatus) || 'active',
      activationDate: editingFamily.activationDate || new Date().toISOString().split('T')[0],
      packageType: editingFamily.packageType || 'saver',
      isBlocked: !!editingFamily.isBlocked,
      notes: editingFamily.notes || '',
      id: editingFamily.id,
    });

    setEditingFamily(null);
    loadData();
  };

  // Handle Mandoub Submit
  const handleSaveMandoubSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMandoub?.name || !editingMandoub?.username || !editingMandoub?.password || !editingMandoub?.vlanCode) {
      alert('يرجى ملء كافة معلومات المندوب الحيوية');
      return;
    }

    const saved = saveMandoub({
      name: editingMandoub.name,
      username: editingMandoub.username.trim(),
      password: editingMandoub.password.trim(),
      vlanCode: editingMandoub.vlanCode.trim(),
      areaName: editingMandoub.areaName || 'المنطقة المخصصة',
      status: (editingMandoub.status as 'active' | 'inactive') || 'active',
      phone: editingMandoub.phone || '',
      salaryType: editingMandoub.salaryType || 'percentage',
      fixedSalaryAmount: editingMandoub.fixedSalaryAmount ?? 500000,
      commissionPercentage: editingMandoub.commissionPercentage ?? 25,
      currentLocation: editingMandoub.currentLocation || {
        lat: 33.3128,
        lng: 44.3615,
        addressText: `موقع المندوب الجغرافي في ${editingMandoub.areaName || 'بغداد'}`,
      },
      id: editingMandoub.id,
    });

    setEditingMandoub(null);
    loadData();
    alert(`تم حفظ وحفظ حساب المندوب (${saved.name}) بنجاح على قاعدة البيانات السحابية! يمكن للمندوب الآن تسجيل الدخول مباشرة من أي هاتف باليوزر والرمز.`);
  };

  // Handle Admin Account Submit
  const handleSaveAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin?.username || !editingAdmin?.password || !editingAdmin?.fullName) {
      alert('يرجى ملء معلومات الأدمن');
      return;
    }

    saveAdminAccount({
      fullName: editingAdmin.fullName,
      username: editingAdmin.username.trim(),
      password: editingAdmin.password,
      id: editingAdmin.id,
    });

    setEditingAdmin(null);
    loadData();
  };

  // Unpaid Orders Actions
  const handleConfirmUnpaid = (orderId: string) => {
    updateOrderStatus(orderId, 'unpaid_confirmed', { unpaidResolved: false });
    loadData();
  };

  const handleRejectUnpaidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingOrderId) return;
    if (!adminNoteInput.trim()) {
      alert('يرجى كتابة ملاحظة توضيحية لسبب عدم تأكيد الغير مسدد');
      return;
    }

    updateOrderStatus(rejectingOrderId, 'rejected_unpaid_returned', {
      adminNote: adminNoteInput.trim(),
    });

    setRejectingOrderId(null);
    setAdminNoteInput('');
    loadData();
  };

  const handleResolveUnpaidDebt = (orderId: string) => {
    updateOrderStatus(orderId, 'unpaid_confirmed', { unpaidResolved: true });
    loadData();
  };

  // Filtered Lists
  const filteredFamilies = families.filter(
    (f) =>
      searchQuery === '' ||
      f.fullName.includes(searchQuery) ||
      f.phone.includes(searchQuery) ||
      f.vlanCode.includes(searchQuery) ||
      f.areaName.includes(searchQuery)
  );

  const pendingUnconfirmedOrders = orders.filter((o) => o.status === 'under_review');
  const pendingUnpaidReports = orders.filter((o) => o.status === 'processing_unpaid');
  const confirmedUnpaidDebts = orders.filter((o) => o.status === 'unpaid_confirmed');
  const completedArchiveOrders = orders.filter((o) => o.status === 'completed_confirmed');

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Admin Header */}
      <div className="bg-stone-900 text-white rounded-3xl p-6 shadow-xl border border-stone-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-500 text-stone-950 rounded-2xl font-black shadow-lg shadow-amber-500/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-black">لوحة تحكّم الإدارة العليا (Admin)</h2>
            <p className="text-xs text-stone-400 mt-0.5">
              مرحباً بك، <strong className="text-amber-400">{admin.fullName}</strong> ({admin.username})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Developer Mobile Push Notification & Sound Trigger Button */}
          <button
            onClick={async () => {
              await requestNotificationPermission();
              playNotificationChimeSound();
              sendBrowserNotification(
                'تنبيه المطور والإدارة 🔔',
                'تم اختبار إشعار الموبايل والصوت بنجاح! التطبيق سينبه المندوب والعائلة فور الخروج عند حدوث أي طلب أو متغير جديد.',
                { targetRole: 'all' }
              );
              alert('تم إرسال إشعار تجريبي للموبايل مع تشغيل النغمة الصوتية بنجاح 🎵');
            }}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-1.5 active:scale-95 border border-amber-400"
            title="اختبار إشعارات الهاتف والنغمة الصوتية لجميع طلبات ومتغيرات شاشة المطور"
          >
            <Bell className="w-4 h-4 fill-stone-950" />
            <span>تجربة إشعارات الهاتف والصوت 🔔</span>
          </button>

          <button
            onClick={handleDownloadBackup}
            className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 border border-stone-700 shadow-xs"
            title="تحميل وتصدير نسخة احتياطية كاملة للملفات بصيغة JSON"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>تصدير نسخة احتياطية</span>
          </button>

          <label
            className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 border border-stone-700 shadow-xs cursor-pointer"
            title="استرجاع وتثبيت نسخة احتياطية سابقة"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>استرجاع نسخة احتياطية</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportBackupFile}
              className="hidden"
            />
          </label>

          <button
            onClick={() => {
              setResetPasscode('');
              setResetError(null);
              setShowResetModal(true);
            }}
            className="px-3 py-2 bg-red-900/60 hover:bg-red-900 text-red-200 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 border border-red-700/60 shadow-xs"
            title="مسح وتفريغ قاعدة البيانات بالكامل عدا حسابات الإدارة"
          >
            <RotateCcw className="w-4 h-4 text-red-400" />
            <span>إعادة ضبط البيانات</span>
          </button>

          <button
            onClick={onLogout}
            className="px-3.5 py-2 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="bg-white rounded-2xl p-2 shadow-xs border border-stone-200 flex flex-wrap items-center justify-between gap-1">
        <div className="flex flex-wrap items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === 'stats'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>الإحصائيات</span>
          </button>

          <button
            onClick={() => setActiveTab('families')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === 'families'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>إدارة العوائل ({families.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('mandoubs')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === 'mandoubs'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>إدارة المندوبين ({mandoubs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('accounting')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === 'accounting'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>تصفية الحسابات والرواتب</span>
          </button>

          <button
            onClick={() => setActiveTab('renewals')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 relative ${
              activeTab === 'renewals'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-amber-50'
            }`}
          >
            <Crown className="w-4 h-4" />
            <span>طلبات تجديد الاشتراكات</span>
            {getRenewalRequests().filter((r) => r.status === 'pending_mandoub').length > 0 && (
              <span className="bg-amber-500 text-stone-950 text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full">
                {getRenewalRequests().filter((r) => r.status === 'pending_mandoub').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('unpaid')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 relative ${
              activeTab === 'unpaid'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-red-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>الطلبات غير المسددة</span>
            {pendingUnpaidReports.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full">
                {pendingUnpaidReports.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('unconfirmed')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 relative ${
              activeTab === 'unconfirmed'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-amber-50'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>طلبات مكتملة غير مؤكدة</span>
            {pendingUnconfirmedOrders.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full">
                {pendingUnconfirmedOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('archive')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === 'archive'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>الأرشيف</span>
          </button>

          <button
            onClick={() => setActiveTab('admins')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === 'admins'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>حسابات الأدمن</span>
          </button>

          <button
            onClick={() => setActiveTab('updates')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === 'updates'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>إدارة التحديثات v1.0.4</span>
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === 'notifications'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-amber-50'
            }`}
          >
            <Bell className="w-4 h-4 text-amber-500" />
            <span>إدارة الإشعارات وتوكنات FCM 🔔</span>
          </button>

          <button
            onClick={() => setActiveTab('supabase')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === 'supabase'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-stone-700 hover:bg-emerald-50'
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-500" />
            <span>قاعدة بيانات Supabase السحابية ☁️</span>
          </button>
        </div>
      </div>


      {/* TAB 1: STATISTICS */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
              <span className="text-xs font-bold text-stone-500">عدد الطلبات الكلية</span>
              <p className="text-2xl font-black text-amber-600 font-mono">{stats.totalOrders}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
              <span className="text-xs font-bold text-stone-500">عدد العوائل الكلية</span>
              <p className="text-2xl font-black text-stone-900 font-mono">{stats.totalFamilies}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-amber-200 bg-amber-50/50 shadow-xs space-y-1">
              <span className="text-xs font-bold text-amber-900">طلبات غير مكتملة</span>
              <p className="text-2xl font-black text-amber-700 font-mono">{stats.incompleteOrders}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-red-200 bg-red-50/50 shadow-xs space-y-1">
              <span className="text-xs font-bold text-red-900">طلبات غير مسددة</span>
              <p className="text-2xl font-black text-red-700 font-mono">{stats.unpaidOrders}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
              <span className="text-xs font-bold text-stone-500">عوائل محظورة</span>
              <p className="text-2xl font-black text-stone-800 font-mono">{stats.blockedFamilies}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-orange-200 bg-orange-50/50 shadow-xs space-y-1">
              <span className="text-xs font-bold text-orange-900">عوائل غير مجددين</span>
              <p className="text-2xl font-black text-orange-700 font-mono">{stats.expiredFamilies}</p>
            </div>
          </div>

          {/* Per Mandoub Performance & Location Table */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-4">
            <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-600" />
              <span>إحصائيات أداء المندوبين والموقع المباشر الحالي</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-stone-100 text-stone-700 text-xs font-extrabold border-b border-stone-200">
                    <th className="p-3.5">اسم المندوب</th>
                    <th className="p-3.5">رمز VLAN المنطقة</th>
                    <th className="p-3.5 text-center">الطلبات الغير مكتملة</th>
                    <th className="p-3.5 text-center">الطلبات المكتملة</th>
                    <th className="p-3.5">الموقع الحالي للمندوب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {stats.mandoubStats.map((ms) => (
                    <tr key={ms.mandoubId} className="hover:bg-stone-50">
                      <td className="p-3.5 font-bold text-stone-900">{ms.mandoubName}</td>
                      <td className="p-3.5 font-mono text-xs font-bold text-amber-900">
                        {ms.vlanCode} ({ms.areaName})
                      </td>
                      <td className="p-3.5 text-center font-bold text-amber-700">{ms.incompleteCount}</td>
                      <td className="p-3.5 text-center font-bold text-emerald-700">{ms.completedCount}</td>
                      <td className="p-3.5">
                        {(() => {
                          const loc = ms.currentLocation || {
                            lat: 33.3128,
                            lng: 44.3615,
                            addressText: `موقع المندوب الجغرافي في ${ms.areaName}`,
                          };
                          return (
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                              <div className="text-[11px] font-bold text-stone-800 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200/80">
                                <span className="block font-semibold text-amber-950">
                                  {loc.addressText || `منطقة ${ms.areaName}`}
                                </span>
                                <span className="text-[10px] text-stone-500 font-mono">
                                  ({loc.lat.toFixed(4)}, {loc.lng.toFixed(4)})
                                </span>
                              </div>
                              <button
                                onClick={() => setSelectedLocation(loc)}
                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-lg shadow-xs transition-colors flex items-center gap-1 shrink-0"
                                title="عرض موقع المندوب المباشر على الخريطة والتوجيه"
                              >
                                <MapPin className="w-3.5 h-3.5" />
                                <span>عرض الخريطة</span>
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FAMILIES MANAGEMENT */}
      {activeTab === 'families' && (
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-600" />
                <span>إدارة قاعدة بيانات العوائل والاشتراكات</span>
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                تصفح وإضافة وتعديل العوائل مع حساب الأيام المتبقية وحظر الأرقام
              </p>
            </div>

            <button
              onClick={() =>
                setEditingFamily({
                  fullName: '',
                  phone: '',
                  vlanCode: 'VLAN-101',
                  areaName: 'الكرادة والعرصات',
                  subscriptionStatus: 'active',
                  activationDate: new Date().toISOString().split('T')[0],
                  isBlocked: false,
                })
              }
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة عائلة جديدة</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم الثلاثي، رقم الهاتف، أو رمز VLAN..."
              className="w-full pr-10 pl-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
            />
            <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          </div>

          {/* Families Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-stone-100 text-stone-700 font-extrabold border-b border-stone-200">
                  <th className="p-3">الاسم الثلاثي</th>
                  <th className="p-3">رقم الهاتف</th>
                  <th className="p-3">VLAN / المنطقة</th>
                  <th className="p-3 text-center">حالة الاشتراك</th>
                  <th className="p-3 text-center">الأيام المتبقية</th>
                  <th className="p-3 text-center">الموقع</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredFamilies.map((fam) => (
                  <tr key={fam.id} className={`hover:bg-stone-50 ${fam.isBlocked ? 'bg-red-50/50' : ''}`}>
                    <td className="p-3 font-bold text-stone-900">
                      {fam.fullName}
                      {fam.isBlocked && (
                        <span className="mr-2 px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full">
                          محظور
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold font-mono text-stone-800" dir="ltr">
                      {fam.phone}
                    </td>
                    <td className="p-3 font-mono font-bold text-amber-900">
                      {fam.vlanCode} ({fam.areaName})
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full font-extrabold text-[11px] ${
                          fam.subscriptionStatus === 'active' && !fam.isBlocked
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {fam.isBlocked
                          ? 'محظور'
                          : fam.subscriptionStatus === 'active'
                          ? 'مفعل'
                          : 'منتهي / غير مجدد'}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono font-black text-sm">
                      {fam.daysRemaining} يوم
                    </td>
                    <td className="p-3 text-center">
                      {fam.location ? (
                        <button
                          onClick={() => setSelectedLocation(fam.location)}
                          className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-950 rounded-lg border border-amber-300 font-black text-xs flex items-center gap-1 mx-auto shadow-2xs transition-colors"
                          title="عرض موقع منزل العائلة الجغرافي على الخريطة"
                        >
                          <MapPin className="w-3.5 h-3.5 text-amber-700" />
                          <span>عرض الموقع 📍</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-stone-400 font-bold bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                          بانتظار التقاط GPS
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center space-x-1 space-x-reverse">
                      <button
                        onClick={() => renewFamilySubscription(fam.id)}
                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg font-bold text-[11px] border border-emerald-200"
                        title="تجديد الاشتراك لـ 30 يوماً جديدة"
                      >
                        تجديد (30)
                      </button>

                      <button
                        onClick={() => toggleBlockFamily(fam.id, !fam.isBlocked)}
                        className={`px-2 py-1 rounded-lg font-bold text-[11px] border ${
                          fam.isBlocked
                            ? 'bg-stone-100 text-stone-700 border-stone-300'
                            : 'bg-red-50 hover:bg-red-100 text-red-800 border-red-200'
                        }`}
                      >
                        {fam.isBlocked ? 'فك الحظر' : 'حظر العائلة'}
                      </button>

                      <button
                        onClick={() => setEditingFamily(fam)}
                        className="p-1 text-stone-600 hover:text-amber-600"
                        title="تعديل"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`حذف عائلة ${fam.fullName}؟`)) {
                            deleteFamily(fam.id);
                            loadData();
                          }
                        }}
                        className="p-1 text-stone-400 hover:text-red-600"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MANDOUBS MANAGEMENT */}
      {activeTab === 'mandoubs' && (
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-600" />
                <span>إدارة حسابات المندوبين والرموز الميدانية (VLAN)</span>
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                إضافة وتعديل وحذف المندوبين وتفعيل/تعطيل حساباتهم مع تخصيص رمز VLAN واسم المنطقة
              </p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              {/* Search Field for Mandoubs */}
              <div className="relative flex-1 md:w-72">
                <Search className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={mandoubSearchQuery}
                  onChange={(e) => setMandoubSearchQuery(e.target.value)}
                  placeholder="بحث باسم المندوب، رقم هاتف، رمز VLAN..."
                  className="w-full pl-7 pr-9 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                />
                {mandoubSearchQuery && (
                  <button
                    onClick={() => setMandoubSearchQuery('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={() =>
                  setEditingMandoub({
                    name: '',
                    username: '',
                    password: '123',
                    vlanCode: 'VLAN-101',
                    areaName: 'الكرادة والعرصات',
                    status: 'active',
                  })
                }
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة مندوب جديد</span>
              </button>
            </div>
          </div>

          {/* Mandoubs List Table */}
          {(() => {
            const filteredMandoubs = mandoubs.filter((m) => {
              const q = mandoubSearchQuery.trim().toLowerCase();
              if (!q) return true;
              return (
                m.name.toLowerCase().includes(q) ||
                m.username.toLowerCase().includes(q) ||
                m.vlanCode.toLowerCase().includes(q) ||
                m.areaName.toLowerCase().includes(q) ||
                (m.phone && m.phone.includes(q))
              );
            });

            return (
              <div className="space-y-3">
                {mandoubSearchQuery && (
                  <p className="text-xs font-bold text-stone-500">
                    نتائج البحث عن "{mandoubSearchQuery}": {filteredMandoubs.length} مندوب
                  </p>
                )}

                {filteredMandoubs.length === 0 ? (
                  <div className="text-center py-10 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                    <p className="text-stone-400 font-bold text-sm">لم يتم العثور على أي حساب مندوب يطابق البحث.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-stone-100 text-stone-700 font-extrabold border-b border-stone-200">
                          <th className="p-3">اسم المندوب</th>
                          <th className="p-3">اسم المستخدم</th>
                          <th className="p-3">كلمة السر</th>
                          <th className="p-3">رمز VLAN</th>
                          <th className="p-3">اسم المنطقة</th>
                          <th className="p-3">رقم الهاتف</th>
                          <th className="p-3 text-center">حالة الحساب</th>
                          <th className="p-3 text-center">التحكم بالحساب</th>
                          <th className="p-3 text-center">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {filteredMandoubs.map((m) => {
                          const isDisabled = m.status === 'disabled' || m.status === 'inactive';

                          return (
                            <tr key={m.id} className="hover:bg-stone-50">
                              <td className="p-3 font-bold text-stone-900">{m.name}</td>
                              <td className="p-3 font-mono font-bold text-stone-800">{m.username}</td>
                              <td className="p-3 font-mono text-stone-500">{m.password}</td>
                              <td className="p-3 font-mono font-extrabold text-amber-900">{m.vlanCode}</td>
                              <td className="p-3 font-bold text-stone-700">{m.areaName}</td>
                              <td className="p-3 font-mono text-stone-600" dir="ltr">
                                {m.phone || 'غير مسجل'}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2.5 py-1 rounded-full font-bold text-[10px] inline-block ${
                                    !isDisabled
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-red-100 text-red-800 border border-red-200'
                                  }`}
                                >
                                  {!isDisabled ? 'نشط ومفعل' : 'معطل وموقوف'}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => {
                                    const newStatus = isDisabled ? 'active' : 'disabled';
                                    saveMandoub({ ...m, status: newStatus });
                                    loadData();
                                  }}
                                  className={`px-2.5 py-1 rounded-xl font-bold text-[11px] transition-all inline-flex items-center gap-1 shadow-xs ${
                                    isDisabled
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                      : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                                  }`}
                                  title={isDisabled ? 'تفعيل حساب المندوب' : 'تعطيل حساب المندوب'}
                                >
                                  {isDisabled ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>تفعيل الحساب</span>
                                    </>
                                  ) : (
                                    <>
                                      <Ban className="w-3.5 h-3.5" />
                                      <span>تعطيل الحساب</span>
                                    </>
                                  )}
                                </button>
                              </td>
                              <td className="p-3 text-center space-x-1 space-x-reverse">
                                <button
                                  onClick={() => handleCopyMandoubCredentials(m)}
                                  className={`p-1.5 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-xs ${
                                    copiedMandoubId === m.id
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'text-amber-700 hover:bg-amber-50 hover:text-amber-900'
                                  }`}
                                  title="نسخ بيانات الدخول للمندوب (اليوزر وكلمة السر والرابط)"
                                >
                                  {copiedMandoubId === m.id ? (
                                    <>
                                      <Check className="w-4 h-4 text-emerald-600" />
                                      <span className="text-[10px]">تم النسخ!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-4 h-4" />
                                      <span className="text-[10px]">نسخ الدخول</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => setEditingMandoub(m)}
                                  className="p-1.5 text-stone-600 hover:text-amber-600 transition-colors"
                                  title="تعديل المندوب"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`حذف حساب المندوب ${m.name} نهائياً؟`)) {
                                      deleteMandoub(m.id);
                                      loadData();
                                    }
                                  }}
                                  className="p-1.5 text-stone-400 hover:text-red-600 transition-colors"
                                  title="حذف المندوب"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 4: ACCOUNTING & SALARIES */}
      {activeTab === 'accounting' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-6">
            <h3 className="text-lg font-black text-stone-900 flex items-center gap-2 border-b border-stone-100 pb-4">
              <Calculator className="w-5 h-5 text-amber-600" />
              <span>تصفية الحسابات ورواتب المندوبين</span>
            </h3>

            {/* Financial Overview Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-1">
                <span className="text-xs font-bold text-stone-600">عدد الزبائن الكلي</span>
                <p className="text-2xl font-black text-stone-900 font-mono">
                  {accounting.totalCustomersCount} عائلة
                </p>
                <p className="text-[11px] text-stone-500">
                  لآخر ٣٠ يوم: <strong className="text-amber-700">{accounting.last30DaysCustomersCount} مشترك نشط</strong>
                </p>
              </div>

              <div className="p-5 bg-amber-50 rounded-2xl border border-amber-200 space-y-1">
                <span className="text-xs font-bold text-amber-900">معادلة اشتراك العائلة</span>
                <p className="text-sm font-black text-amber-950">
                  10,000 د.ع - 25% (عمولة المندوب)
                </p>
                <p className="text-[11px] text-amber-800">
                  الصافي لكل زبون: <strong>7,500 دينار عراقي</strong>
                </p>
              </div>

              <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1">
                <span className="text-xs font-bold text-emerald-900">مبلغ الربح الكلي المتبقي للإدارة</span>
                <p className="text-2xl font-black text-emerald-700 font-mono">
                  {accounting.totalNetProfitIQD.toLocaleString()} د.ع
                </p>
                <p className="text-[11px] text-emerald-800">
                  صافي أرباح الاشتراكات بعد خصم رواتب المندوبين
                </p>
              </div>
            </div>

            {/* Mandoubs Salaries Table */}
            <div className="space-y-3 pt-2">
              <h4 className="font-extrabold text-stone-800 text-sm">
                قائمة رواتب المندوبين المفعلين حسب المناطق والـ VLAN:
              </h4>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-stone-100 text-stone-700 font-extrabold border-b border-stone-200">
                      <th className="p-3.5">اسم المندوب</th>
                      <th className="p-3.5">رمز VLAN المنطقة</th>
                      <th className="p-3.5">اسم المنطقة</th>
                      <th className="p-3.5 text-center">عدد الزبائن النشطين في المنطقة</th>
                      <th className="p-3.5 text-center">الراتب المحسوب (25% من الاشتراكات)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {accounting.mandoubSalaries.map((sal) => (
                      <tr key={sal.mandoubId} className="hover:bg-stone-50">
                        <td className="p-3.5 font-bold text-stone-900">{sal.mandoubName}</td>
                        <td className="p-3.5 font-mono font-bold text-amber-900">{sal.vlanCode}</td>
                        <td className="p-3.5 font-bold text-stone-700">{sal.areaName}</td>
                        <td className="p-3.5 text-center font-bold font-mono text-stone-800">
                          {sal.vlanCustomersCount} مشترك
                        </td>
                        <td className="p-3.5 text-center font-black font-mono text-sm text-emerald-700">
                          {sal.salaryIQD.toLocaleString()} دينار عراقي
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: RENEWALS DASHBOARD */}
      {activeTab === 'renewals' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500 text-stone-950 rounded-2xl font-black">
                  <Crown className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-stone-900">سجل وطلبات تجديد اشتراكات العوائل</h3>
                  <p className="text-xs text-stone-500 font-semibold mt-0.5">
                    متابعة المبالغ المستحصلة من تجديد باقات الاشتراكات وحالات الموافقة أو الرفض
                  </p>
                </div>
              </div>

              <button
                onClick={loadData}
                className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تحديث</span>
              </button>
            </div>

            {/* Renewals Overview Metrics */}
            {(() => {
              const allReqs = getRenewalRequests();
              const confirmedReqs = allReqs.filter((r) => r.status === 'confirmed');
              const rejectedReqs = allReqs.filter((r) => r.status === 'rejected_mandoub' || r.status === 'rejected_admin');
              const pendingReqs = allReqs.filter((r) => r.status === 'pending_mandoub');
              const totalCollectedIQD = confirmedReqs.reduce((sum, r) => sum + r.packagePriceIQD, 0);

              return (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1">
                      <span className="text-xs font-bold text-emerald-900">إجمالي المبالغ المستحصلة من التجديد</span>
                      <p className="text-2xl font-black text-emerald-700 font-mono">
                        {totalCollectedIQD.toLocaleString()} د.ع
                      </p>
                      <p className="text-[11px] text-emerald-800 font-semibold">
                        مجموع الأموال المستلمة من المندوبين
                      </p>
                    </div>

                    <div className="p-5 bg-amber-50 rounded-2xl border border-amber-200 space-y-1">
                      <span className="text-xs font-bold text-amber-900">طلبات التجديد المؤكدة</span>
                      <p className="text-2xl font-black text-amber-800 font-mono">
                        {confirmedReqs.length} تجديد ناجح
                      </p>
                      <p className="text-[11px] text-amber-800 font-semibold">
                        تم تمديد اشتراكات العوائل تلقائياً
                      </p>
                    </div>

                    <div className="p-5 bg-red-50 rounded-2xl border border-red-200 space-y-1">
                      <span className="text-xs font-bold text-red-900">طلبات التجديد المرفوضة</span>
                      <p className="text-2xl font-black text-red-700 font-mono">
                        {rejectedReqs.length} طلب مرفوض
                      </p>
                      <p className="text-[11px] text-red-800 font-semibold">
                        طلبات معلقة لعدم استلام المبلغ من قبل المندوب
                      </p>
                    </div>
                  </div>

                  {/* Pending Renewals */}
                  {pendingReqs.length > 0 && (
                    <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-3">
                      <h4 className="font-black text-amber-900 text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>طلبات التجديد المعلقة لدى المندوبين ({pendingReqs.length})</span>
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {pendingReqs.map((req) => (
                          <div key={req.id} className="p-3 bg-white border border-amber-200 rounded-xl space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <strong className="text-stone-900 text-sm">{req.familyName}</strong>
                              <span className="font-mono text-amber-800 font-bold">{req.vlanCode}</span>
                            </div>
                            <div className="flex items-center justify-between text-stone-600">
                              <span>الباقة: <strong className="text-amber-900">{req.packageName}</strong></span>
                              <span className="font-mono font-bold text-emerald-700">{req.packagePriceIQD.toLocaleString()} د.ع</span>
                            </div>
                            <div className="text-[11px] text-stone-500">
                              بانتظار تأكيد استلام المبلغ من المندوب المخصص
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confirmed Renewals Ledger Table */}
                  <div className="space-y-3 pt-2">
                    <h4 className="font-black text-stone-900 text-sm">سجل الاشتراكات المجددة والمؤكدة:</h4>
                    {confirmedReqs.length === 0 ? (
                      <p className="text-center py-6 text-stone-400 font-bold text-xs">
                        لا توجد طلبات تجديد مؤكدة حتى الآن.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                          <thead>
                            <tr className="bg-stone-100 text-stone-700 font-extrabold border-b border-stone-200">
                              <th className="p-3">رقم التجديد</th>
                              <th className="p-3">اسم العائلة</th>
                              <th className="p-3">الباقة المجددة</th>
                              <th className="p-3 text-center">المبلغ المستحصل</th>
                              <th className="p-3">المندوب المستلم</th>
                              <th className="p-3 text-center">تاريخ التأكيد</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {confirmedReqs.map((req) => (
                              <tr key={req.id} className="hover:bg-stone-50">
                                <td className="p-3 font-mono font-bold text-amber-900">{req.id}</td>
                                <td className="p-3 font-bold text-stone-900">{req.familyName}</td>
                                <td className="p-3 font-bold text-amber-800">{req.packageName}</td>
                                <td className="p-3 text-center font-mono font-black text-emerald-700">
                                  {req.packagePriceIQD.toLocaleString()} د.ع
                                </td>
                                <td className="p-3 font-bold text-stone-700">
                                  {req.confirmedMandoubName || req.mandoubId || 'مندوب المنطقة'}
                                </td>
                                <td className="p-3 text-center font-mono text-stone-500">
                                  {req.confirmedAt ? new Date(req.confirmedAt).toLocaleDateString('ar-IQ') : 'سابقاً'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Rejected Renewals Ledger Table */}
                  {rejectedReqs.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-stone-200">
                      <h4 className="font-black text-red-900 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span>طلبات التجديد المرفوضة مع أسباب الرفض:</span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                          <thead>
                            <tr className="bg-red-50 text-red-900 font-extrabold border-b border-red-200">
                              <th className="p-3">رقم الطلب</th>
                              <th className="p-3">اسم العائلة</th>
                              <th className="p-3">رقم الهاتف</th>
                              <th className="p-3">الباقة</th>
                              <th className="p-3">سبب الرفض</th>
                              <th className="p-3 text-center">تواصل سريع</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {rejectedReqs.map((req) => (
                              <tr key={req.id} className="hover:bg-red-50/50">
                                <td className="p-3 font-mono font-bold text-red-900">{req.id}</td>
                                <td className="p-3 font-bold text-stone-900">{req.familyName}</td>
                                <td className="p-3 font-mono text-stone-700" dir="ltr">{req.familyPhone}</td>
                                <td className="p-3 font-bold text-amber-900">{req.packageName}</td>
                                <td className="p-3 font-semibold text-red-800 bg-red-50/80 rounded-lg">
                                  {req.rejectionReason || 'رفض المندوب استلام المبلغ'}
                                </td>
                                <td className="p-3 text-center">
                                  <a
                                    href={`tel:${req.familyPhone}`}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition-colors inline-flex items-center gap-1"
                                  >
                                    <Phone className="w-3 h-3" />
                                    <span>اتصال</span>
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 6: UNPAID ORDERS MANAGEMENT */}
      {activeTab === 'unpaid' && (
        <div className="space-y-6">
          {/* Unpaid Pending Reports */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-4">
            <h3 className="text-lg font-black text-red-900 flex items-center gap-2 border-b border-stone-100 pb-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span>الطلبات غير المسددة قيد المعالجة (تقرير المندوب بانتظار تأكيد الإدارة)</span>
            </h3>

            {pendingUnpaidReports.length === 0 ? (
              <p className="text-center py-8 text-stone-400 font-bold text-sm">
                لا توجد بلاغات غير مسددة بانتظار المعالجة حالياً.
              </p>
            ) : (
              <div className="space-y-3">
                {pendingUnpaidReports.map((unp) => (
                  <div
                    key={unp.id}
                    className="p-4 bg-red-50/70 border border-red-200 rounded-2xl flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-red-900 bg-red-100 px-2.5 py-0.5 rounded text-xs">
                          {unp.id}
                        </span>
                        <h4 className="font-black text-stone-900 text-base">{unp.familyName}</h4>
                      </div>
                      <p className="text-xs font-bold text-stone-600" dir="ltr">
                        الهاتف: {unp.familyPhone} | المندوب المرفق: {unp.mandoubName || 'غير محدد'}
                      </p>
                      <p className="text-xs font-semibold text-stone-500">
                        الكمية: {unp.quantity} {unp.unitText} | المنطقة: {unp.areaName} ({unp.vlanCode})
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${unp.familyPhone}`}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>اتصال بالزبون</span>
                      </a>

                      <button
                        onClick={() => handleConfirmUnpaid(unp.id)}
                        className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors"
                      >
                        تأكيد الغير مسدد
                      </button>

                      <button
                        onClick={() => setRejectingOrderId(unp.id)}
                        className="px-3.5 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 font-extrabold text-xs rounded-xl transition-colors"
                      >
                        عدم التأكيد (رفض مع ملاحظة)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirmed Unpaid Debt Ledger */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-4">
            <h3 className="text-lg font-black text-stone-900 flex items-center gap-2 border-b border-stone-100 pb-4">
              <DollarSign className="w-5 h-5 text-amber-600" />
              <span>سجل الذمم والمبالغ الغير مسددة المثبتة باسم المندوبين</span>
            </h3>

            {confirmedUnpaidDebts.length === 0 ? (
              <p className="text-center py-6 text-stone-400 font-bold text-sm">
                لا توجد ذمم معلقة في السجل حالياً.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-stone-100 text-stone-700 font-extrabold border-b border-stone-200">
                      <th className="p-3">رقم الطلب</th>
                      <th className="p-3">اسم العائلة</th>
                      <th className="p-3">المندوب المسجل</th>
                      <th className="p-3">الكمية والمنطقة</th>
                      <th className="p-3 text-center">المبلغ</th>
                      <th className="p-3 text-center">حالة التسديد</th>
                      <th className="p-3 text-center">الإجراء عند التسديد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {confirmedUnpaidDebts.map((deb) => (
                      <tr key={deb.id} className="hover:bg-stone-50">
                        <td className="p-3 font-mono font-bold text-red-900">{deb.id}</td>
                        <td className="p-3 font-bold text-stone-900">{deb.familyName}</td>
                        <td className="p-3 font-bold text-amber-900">{deb.mandoubName || 'غير محدد'}</td>
                        <td className="p-3 text-stone-600">
                          {deb.quantity} {deb.unitText} ({deb.areaName})
                        </td>
                        <td className="p-3 text-center font-black text-red-700 font-mono">
                          {deb.unpaidAmount ? `${deb.unpaidAmount.toLocaleString()} د.ع` : 'غير محدد'}
                        </td>
                        <td className="p-3 text-center">
                          {deb.unpaidResolved ? (
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-xs rounded-full inline-block">
                              تم التسديد
                            </span>
                          ) : (
                            <span className="px-3 py-1 bg-red-100 text-red-700 border border-red-300 font-black text-xs rounded-full inline-block">
                              غير مسدد
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {!deb.unpaidResolved ? (
                            <button
                              onClick={() => handleResolveUnpaidDebt(deb.id)}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors"
                            >
                              تأكيد التسديد
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-emerald-700">تم استيفاء الدين</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: UNCONFIRMED COMPLETED ORDERS */}
      {activeTab === 'unconfirmed' && (
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-4">
          <h3 className="text-lg font-black text-amber-900 flex items-center gap-2 border-b border-stone-100 pb-4">
            <Clock className="w-5 h-5 text-amber-600" />
            <span>الطلبات قيد المعالجة المكتملة الغير مؤكدة من الزبون</span>
          </h3>

          {pendingUnconfirmedOrders.length === 0 ? (
            <p className="text-center py-8 text-stone-400 font-bold text-sm">
              لا توجد طلبات مكتملة معلقة بانتظار التأكيد حالياً.
            </p>
          ) : (
            <div className="space-y-3">
              {pendingUnconfirmedOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded text-xs">
                        {ord.id}
                      </span>
                      <h4 className="font-black text-stone-900">{ord.familyName}</h4>
                    </div>
                    <p className="text-xs font-semibold text-stone-600">
                      المندوب المنفذ: {ord.mandoubName || 'غير محدد'} | الكمية: {ord.quantity} {ord.unitText}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${ord.familyPhone}`}
                      className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>اتصال</span>
                    </a>

                    <button
                      onClick={() => {
                        updateOrderStatus(ord.id, 'completed_confirmed');
                        loadData();
                      }}
                      className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors"
                    >
                      تأكيد الأرشيف يدوياً
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 7: ARCHIVE */}
      {activeTab === 'archive' && (
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-4">
          <h3 className="text-lg font-black text-stone-900 flex items-center gap-2 border-b border-stone-100 pb-4">
            <Archive className="w-5 h-5 text-amber-600" />
            <span>سجل الطلبات المكتملة والمؤكدة نهائياً (الأرشيف)</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-stone-100 text-stone-700 font-extrabold border-b border-stone-200">
                  <th className="p-3">رقم الطلب</th>
                  <th className="p-3">اسم العائلة</th>
                  <th className="p-3">المندوب</th>
                  <th className="p-3">تفاصيل الطلب</th>
                  <th className="p-3">المنطقة (VLAN)</th>
                  <th className="p-3 text-center">تاريخ التأكيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {completedArchiveOrders.map((arch) => (
                  <tr key={arch.id} className="hover:bg-stone-50">
                    <td className="p-3 font-mono font-bold text-amber-900">{arch.id}</td>
                    <td className="p-3 font-bold text-stone-900">{arch.familyName}</td>
                    <td className="p-3 font-bold text-stone-700">{arch.mandoubName || 'عام'}</td>
                    <td className="p-3 text-stone-600">
                      {arch.quantity} {arch.unitText} ({arch.timeSlotText})
                    </td>
                    <td className="p-3 font-mono text-stone-500">
                      {arch.areaName} ({arch.vlanCode})
                    </td>
                    <td className="p-3 text-center font-mono text-stone-500">
                      {arch.updatedAt ? arch.updatedAt.split('T')[0] : 'اليوم'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 8: ADMIN ACCOUNTS */}
      {activeTab === 'admins' && (
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-600" />
                <span>إدارة حسابات المشرفين والأدمن</span>
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                إضافة وتحديث حسابات الدخول للوحة التحكم الرئيسية
              </p>
            </div>

            <button
              onClick={() =>
                setEditingAdmin({
                  fullName: '',
                  username: '',
                  password: '',
                })
              }
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة أدمن جديد</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-stone-100 text-stone-700 font-extrabold border-b border-stone-200">
                  <th className="p-3">اسم المسؤول</th>
                  <th className="p-3">اسم المستخدم</th>
                  <th className="p-3">كلمة السر</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {admins.map((a) => (
                  <tr key={a.id} className="hover:bg-stone-50">
                    <td className="p-3 font-bold text-stone-900">{a.fullName}</td>
                    <td className="p-3 font-mono font-bold text-amber-900">{a.username}</td>
                    <td className="p-3 font-mono text-stone-500">{a.password}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setEditingAdmin(a)}
                        className="p-1 text-stone-600 hover:text-amber-600"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 9: UPDATES & VERSION MANAGEMENT */}
      {activeTab === 'updates' && (
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-6">
          {/* Dedicated Official Restore Point Banner */}
          <div className="p-5 bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 text-white rounded-3xl border border-amber-500/40 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-base text-amber-300">نقطة الاستعادة الرسمية والمستقرة</h3>
                  <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full font-mono text-xs font-black">
                    v1.0.4.final
                  </span>
                </div>
                <p className="text-xs text-stone-300 mt-1 font-semibold">
                  تم اعتماد وحفظ نقطة الاستعادة الرسمية والمستقرة وآمنة لنظام الخبزة، يمكنك العودة إليها في أي وقت.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setRestoreV104Passcode('');
                setRestoreV104Error(null);
                setShowRestoreV104Modal(true);
              }}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 active:scale-95 shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              <span>استرجاع نقطة v1.0.4.final الآن</span>
            </button>
          </div>

          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-stone-900">إدارة إصدارات وتحديثات التطبيق بالخلفية</h3>
                <p className="text-xs text-stone-500 font-semibold mt-0.5">
                  التحقق التلقائي عند التشغيل - تقييد استخدام التطبيق عند توفر تحديث إجباري جديد
                </p>
              </div>
            </div>

            <div className="text-left font-mono text-xs font-bold text-stone-600 bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-200">
              الإصدار الحالي للجهاز: <span className="text-amber-600">v{getInstalledVersion()}</span>
            </div>
          </div>

          <form onSubmit={handlePublishVersionUpdate} className="space-y-5 max-w-2xl text-right">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-stone-800">
                  رقم الإصدار الأخير المتاح للخادم (Latest Available Version)
                </label>
                <span className="text-[11px] font-black text-amber-800 bg-amber-100/80 px-2.5 py-0.5 rounded-full border border-amber-300">
                  قائمة النقاط المستقرة ({stablePoints.length})
                </span>
              </div>

              {/* Select Dropdown for Stable Restore Points */}
              <div className="mb-3">
                <label className="block text-[11px] font-bold text-stone-500 mb-1">
                  اختر من النقاط المستقرة المتاحة (حتى الآن والمستقبلية):
                </label>
                <select
                  value={selectedPointId}
                  onChange={(e) => {
                    const pId = e.target.value;
                    setSelectedPointId(pId);
                    const selectedPoint = stablePoints.find((p) => p.id === pId || p.version === pId);
                    if (selectedPoint) {
                      setVersionInput(selectedPoint.version);
                      setReleaseNotesInput(selectedPoint.releaseNotes);
                      setIsMandatoryInput(selectedPoint.isMandatory);
                    }
                  }}
                  className="w-full px-4 py-3 bg-stone-50 border-2 border-amber-400 hover:border-amber-500 rounded-2xl font-bold text-xs text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all cursor-pointer shadow-xs"
                >
                  <option value="">-- اختر نقطة مستقرة مجهزة من القائمة للتحديث الفوري --</option>
                  {stablePoints.map((point) => (
                    <option key={point.id} value={point.id}>
                      {point.title || `v${point.version}`} {point.isOfficial ? '⭐ (رسمي)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Version Input Box & Save to List Button */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-stone-600">
                  أو أدخل/عدّل رقم الإصدار مخصصاً:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={versionInput}
                    onChange={(e) => {
                      setVersionInput(e.target.value);
                      setSelectedPointId('');
                    }}
                    placeholder="مثال: 1.1.0 أو 1.0.4.final"
                    className="flex-1 px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl font-mono font-bold text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
                    dir="ltr"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      if (!versionInput.trim()) {
                        alert('يرجى كتابة رقم الإصدار أولاً');
                        return;
                      }
                      const ver = versionInput.trim();
                      const newPoint: StableRestorePointItem = {
                        id: ver.startsWith('v') ? ver : `v${ver}`,
                        version: ver,
                        title: `v${ver} - نقطة مستقرة مخصصة`,
                        releaseNotes: releaseNotesInput.trim() || `تحديث وإصدار مستقر v${ver}`,
                        isMandatory: isMandatoryInput,
                        createdAt: new Date().toISOString(),
                        isOfficial: false,
                      };
                      saveStableRestorePoint(newPoint);
                      setStablePoints(getStableRestorePoints());
                      setSelectedPointId(newPoint.id);
                      alert(`✅ تم حفظ الإصدار v${ver} بنجاح في قائمة النقاط المستقرة!`);
                    }}
                    className="px-3.5 py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs shrink-0 active:scale-95"
                    title="حفظ هذا الإصدار في القائمة لاستخدامه وتطبيقه مستقبلاً"
                  >
                    <Plus className="w-4 h-4" />
                    <span>حفظ بالشريط</span>
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-stone-500 mt-2 font-semibold leading-normal">
                * عند اختيار أو كتابة رقم إصدار جديد (مثلاً 1.1.0)، سيقوم جميع المستخدمين بالبحث بالخلفية وسينتقل التطبيق فوراً للتحديث.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                ملاحظات التحديث للزبائن والمندوبين
              </label>
              <textarea
                rows={3}
                required
                value={releaseNotesInput}
                onChange={(e) => setReleaseNotesInput(e.target.value)}
                placeholder="اكتب تفاصيل التحديث وما الميزات الجديدة..."
                className="w-full p-3.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-semibold"
              />
            </div>

            <div className="flex items-center gap-3 bg-amber-50/70 border border-amber-200 p-4 rounded-2xl">
              <input
                type="checkbox"
                id="mandatory-toggle"
                checked={isMandatoryInput}
                onChange={(e) => setIsMandatoryInput(e.target.checked)}
                className="w-5 h-5 accent-amber-600 rounded"
              />
              <label htmlFor="mandatory-toggle" className="text-xs font-bold text-stone-800 cursor-pointer">
                تحديث إجباري (إيقاف العمل بالتطبيق تماماً لحين الضغط على زر "تحديث الآن")
              </label>
            </div>

            {versionSaveSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>تم نشر التحديث الجديد بنجاح! سيتم إخطار التطبيقات فور تشغيلها.</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-amber-600/20 flex items-center gap-2 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>نشر التحديث فوراً</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm('هل أنت متأكد من تطبيق نقطة الاسترجاع الآمنة السحابية المعتمدة v1.0.5؟ سيتم تحديث وتثبيت الإصدار فوراً وتفعيل الإشعارات وتزامن الخادم.')) {
                    restoreOfficialPointV105();
                    setInstalledVersion('1.0.5');
                    setVersionInput('1.0.5');
                    setIsMandatoryInput(false);
                    setReleaseNotesInput('نقطة الاسترجاع السحابية الآمنة المعتمدة v1.0.5 - تفعيل استلام الإشعارات والتطبيق مغلق تماماً للمندوب والعائلة ومزامنة سحابية مستقرة.');
                    setVersionSaveSuccess(true);
                    alert('✅ تم تطبيق نقطة الاسترجاع الآمنة السحابية المعتمدة v1.0.5 بنجاح!');
                  }
                }}
                className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>نقطة الاسترجاع الآمنة المعتمدة v1.0.5 🛡️</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm('هل أنت متأكد من تطبيق نقطة الاسترجاع الآمنة السحابية المعتمدة v1.0.4.final؟ سيتم تحديث وتثبيت الإصدار فوراً وضبط استقرار النظام.')) {
                    restoreOfficialPointV104Final();
                    setInstalledVersion('1.0.4');
                    setVersionInput('1.0.4.final');
                    setIsMandatoryInput(false);
                    setReleaseNotesInput('نقطة الاسترجاع السحابية الآمنة المعتمدة v1.0.4.final - استقرار شامل لقاعدة بيانات Supabase، مطابقة الـ VLAN، وتحديثات المندوبين وحسابات الاشتراكات بدون أي خلل.');
                    setVersionSaveSuccess(true);
                    alert('✅ تم تطبيق نقطة الاسترجاع الآمنة السحابية المعتمدة بنجاح!');
                  }
                }}
                className="px-4 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>نقطة الاسترجاع v1.0.4.final</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  saveAppVersionConfig({
                    currentVersion: '1.0.4',
                    latestVersion: '1.0.4',
                    isMandatory: false,
                    releaseNotes: 'الإصدار المستقر v1.0.4 - تثبيت فوري تلقائي وتحديث الإشعارات ونقطة استعادة',
                    releasedAt: new Date().toISOString(),
                  });
                  setInstalledVersion('1.0.4');
                  setVersionInput('1.0.4');
                  setIsMandatoryInput(false);
                  setReleaseNotesInput('الإصدار المستقر v1.0.4');
                  setVersionSaveSuccess(true);
                }}
                className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl border border-stone-200 transition-colors"
              >
                إعادة الضبط إلى v1.0.4
              </button>

              <button
                type="button"
                onClick={() => {
                  saveAppVersionConfig({
                    currentVersion: '1.0.3',
                    latestVersion: '1.0.3',
                    isMandatory: false,
                    releaseNotes: 'الاستعادة إلى نقطة العودة المستقرة v1.0.3',
                    releasedAt: new Date().toISOString(),
                  });
                  setInstalledVersion('1.0.3');
                  setVersionInput('1.0.3');
                  setIsMandatoryInput(false);
                  setReleaseNotesInput('الاستعادة إلى نقطة العودة المستقرة v1.0.3');
                  setVersionSaveSuccess(true);
                }}
                className="px-4 py-3 bg-amber-50 hover:bg-amber-100 text-amber-900 font-extrabold text-xs rounded-xl border border-amber-300 transition-colors flex items-center gap-1.5"
              >
                <span>العودة إلى النقطة المستقرة v1.0.3 🔄</span>
              </button>
            </div>
          </form>

          {/* Backup & Restore Data Management Card */}
          <div className="pt-6 border-t border-stone-200 mt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-stone-900">نسخ احتياطي واستعادة البيانات الكاملة للنظام 💾</h4>
                <p className="text-xs text-stone-500 font-medium mt-0.5">
                  حماية قاعدة البيانات وتصدير ملف شامل لكافة العوائل، المندوبين، الطلبات، والاشتراكات لمشاركته أو استرجاعه في تطبيق جديد كأن شيئاً لم يكن.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-stone-800">
                  <Share2 className="w-4 h-4 text-amber-600" />
                  <span>تصدير ومشاركة النسخة الاحتياطية (JSON) 📤</span>
                </div>
                <p className="text-[11px] text-stone-500 font-medium leading-relaxed">
                  قم بتحميل أو مشاركة ملف النسخة الاحتياطية الشاملة على الواتساب أو التيليجرام أو حفظه في ملفاتك لضمان عدم ضياع أي بيانات.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>تصدير ومشاركة النسخة الاحتياطية الآن</span>
                </button>
              </div>

              <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-stone-800">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>استرجاع البيانات من ملف احتياطي (JSON) 📥</span>
                </div>
                <p className="text-[11px] text-stone-500 font-medium leading-relaxed">
                  اختر ملف النسخة الاحتياطية المرفوع سابقاً لإدراج جميع البيانات القديمة (العوائل، المندوبين، التاريخ، والطلبات) فوراً.
                </p>
                <label className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95">
                  <Upload className="w-4 h-4" />
                  <span>رفع واسترجاع نسخة احتياطية</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportBackupFile}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 12: NOTIFICATIONS & FCM TOKENS MANAGEMENT */}
      {activeTab === 'notifications' && (
        <div className="space-y-6 text-right animate-fadeIn">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-amber-700 via-amber-600 to-amber-800 rounded-3xl p-6 text-white shadow-lg space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-xs">
                <Bell className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black">إدارة إشعارات الهواتف و Firebase Cloud Messaging (FCM) 📱</h3>
                <p className="text-xs text-amber-100 font-medium">
                  مراقبة رموز الأجهزة (Device Tokens)، إرسال إشعارات تجريبية فورية، وتوصيل التنبيهات حتى عند إغلاق التطبيق.
                </p>
              </div>
            </div>
          </div>

          {/* Current Device FCM Token Card */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-600" />
                <h4 className="text-base font-black text-stone-900">رمز FCM Token الخاص بجهازك الحالي 🔑</h4>
              </div>
              <button
                type="button"
                onClick={handleGenerateFcmToken}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>توليد / تحديث الرمز الآن</span>
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-stone-700">
                رمز الـ Token المميز للجهاز (يُستخدم لإرسال الإشعار المباشر لهذا الجهاز عبر Firebase):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={localFcmToken || 'بانتظار توليد التوكن... اضغط على "توليد / تحديث الرمز الآن" أو وافق على إذن الإشعارات'}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl font-mono text-xs font-bold text-stone-800 focus:outline-none select-all"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (localFcmToken) {
                      navigator.clipboard.writeText(localFcmToken);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2500);
                    }
                  }}
                  disabled={!localFcmToken}
                  className="px-4 py-3 bg-stone-800 hover:bg-stone-900 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  title="نسخ التوكن إلى الحافظة"
                >
                  {copiedToken ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>تم النسخ!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>نسخ الرمز</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-stone-500 font-medium">
                💡 يتم تخزين هذا التوكن تلقائياً في قاعدة بيانات Supabase في جدول <code className="font-mono text-amber-700 font-bold bg-amber-50 px-1 py-0.5 rounded">fcm_tokens</code> مع رقم هاتف المستخدم.
              </p>
            </div>
          </div>

          {/* Cloudflare Worker Edge Gateway Configuration Card */}
          <div className="bg-gradient-to-br from-orange-50 via-white to-amber-50 rounded-3xl p-6 shadow-xs border border-orange-200 space-y-4">
            <div className="flex items-center justify-between border-b border-orange-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-orange-600 text-white rounded-2xl shadow-xs">
                  <CloudLightning className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-stone-900 flex items-center gap-2">
                    <span>بوابة Cloudflare Edge العالمية للإشعارات الفورية ⚡</span>
                    <span className="text-[10px] bg-orange-600 text-white px-2 py-0.5 rounded-full font-bold">موصى به</span>
                  </h4>
                  <p className="text-[11px] text-stone-500 font-medium">
                    تضمن إيقاظ الهاتف فورياً وإيصال التنبيه حتى لو كان التطبيق مغلقاً كلياً وشاشة الهاتف مقفلة.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveCfWorkerUrl} className="space-y-3">
              <label className="block text-xs font-bold text-stone-700">
                رابط الـ Cloudflare Worker الخاص بك (أو اتركه افتراضياً للموزع المباشر):
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={cfWorkerUrl}
                  onChange={(e) => setCfWorkerUrl(e.target.value)}
                  placeholder="https://khobza-push.your-subdomain.workers.dev"
                  className="w-full px-4 py-2.5 bg-white border border-orange-200 rounded-xl font-mono text-xs font-bold text-stone-800"
                  dir="ltr"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all shrink-0"
                >
                  حفظ الرابط
                </button>
                <button
                  type="button"
                  onClick={handleSendCloudflareTest}
                  disabled={testPushSending}
                  className="px-5 py-2.5 bg-stone-900 hover:bg-black active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  <CloudLightning className="w-4 h-4 text-amber-400" />
                  <span>بث فوري عبر Cloudflare</span>
                </button>
              </div>
              {cfWorkerSavedMessage && (
                <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                  {cfWorkerSavedMessage}
                </p>
              )}
              <div className="bg-white/80 p-3 rounded-2xl border border-orange-100 text-xs text-stone-600 space-y-1">
                <p className="font-bold text-stone-800 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-orange-600" />
                  <span>كود الـ Worker الجاهز لـ Cloudflare:</span>
                </p>
                <p className="text-[11px] text-stone-500">
                  تم تضمين كود الـ Worker كاملاً في ملف المشروع <code className="font-mono text-orange-700 bg-orange-50 px-1 py-0.5 rounded font-bold">cloudflare-worker/worker.js</code> ودليل النشر في <code className="font-mono text-orange-700 bg-orange-50 px-1 py-0.5 rounded font-bold">CLOUDFLARE_PUSH_SETUP_AR.md</code>.
                </p>
              </div>
            </form>
          </div>

          {/* Interactive Test Notification Dispatcher */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-4">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-4">
              <Radio className="w-5 h-5 text-amber-600 animate-pulse" />
              <h4 className="text-base font-black text-stone-900">إرسال واختبار إشعار تجريبي فوري (Push Notification Test) 🚀</h4>
            </div>

            <form onSubmit={handleSendTestPush} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">عنوان الإشعار (Notification Title)</label>
                  <input
                    type="text"
                    required
                    value={testPushTitle}
                    onChange={(e) => setTestPushTitle(e.target.value)}
                    placeholder="مثال: وصل الخبز إلى منزلكم 🥖"
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الجهة المستهدفة بالإشعار</label>
                  <select
                    value={testPushRole}
                    onChange={(e) => setTestPushRole(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs text-stone-800"
                  >
                    <option value="all">الجميع (كافة العوائل والمندوبين والأدمن)</option>
                    <option value="family">العوائل فقط</option>
                    <option value="mandoub">المندوبين فقط</option>
                    <option value="admin">الأدمن فقط</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">نص محتوى الإشعار (Notification Body)</label>
                <textarea
                  required
                  rows={2}
                  value={testPushBody}
                  onChange={(e) => setTestPushBody(e.target.value)}
                  placeholder="اكتب رسالة الإشعار هنا..."
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs"
                />
              </div>

              {testPushResult && (
                <div
                  className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                    testPushResult.startsWith('🚀') || testPushResult.startsWith('✅')
                      ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
                      : 'bg-amber-50 border border-amber-300 text-amber-900'
                  }`}
                >
                  <Info className="w-4 h-4 shrink-0" />
                  <span>{testPushResult}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={testPushSending}
                  className="px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-black text-xs rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{testPushSending ? 'جارِ إرسال الإشعار...' : 'إرسال الإشعار التجريبي الآن 🚀'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Developer API & cURL Instructions Card */}
          <div className="bg-stone-900 text-stone-100 rounded-3xl p-6 shadow-md space-y-4">
            <div className="flex items-center gap-2 border-b border-stone-800 pb-3">
              <FileJson className="w-5 h-5 text-amber-400" />
              <h4 className="text-sm font-black text-amber-400">طريقة إرسال الإشعارات برمجياً من السيرفر أو cURL / Postman 💻</h4>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed font-medium">
              يمكن لصديقك المبرمج إرسال تنبيه فوري عبر إرسال طلب HTTP POST مباشر إلى الـ Endpoint الخاص بنا:
            </p>

            <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 font-mono text-[11px] text-amber-300 overflow-x-auto space-y-2" dir="ltr">
              <p className="text-stone-400 font-sans font-bold"># Endpoint:</p>
              <p className="text-emerald-400">POST /api/fcm/send</p>
              <p className="text-stone-400 font-sans font-bold pt-1"># Payload (JSON):</p>
              <pre className="text-stone-200">
{`{
  "title": "🎉 تم توصيل الخبز!",
  "body": "قام المندوب بتوصيل طلب الخبز إلى منزلكم. يرجى الاستلام وتأكيد الطلب.",
  "targetRole": "family",
  "orderId": "order-12345"
}`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 13: SUPABASE CLOUD DATABASE MANAGEMENT */}
      {activeTab === 'supabase' && (
        <div className="space-y-6 text-right animate-fadeIn">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-emerald-800 via-teal-700 to-emerald-900 rounded-3xl p-6 text-white shadow-lg space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-xs">
                <Globe className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black">إدارة قاعدة بيانات Supabase السحابية الكاملة ☁️</h3>
                <p className="text-xs text-emerald-100 font-medium">
                  ربط ومزامنة كافة جداول العوائل، المندوبين، المدراء، الطلبات، والاشتراكات سحابياً دون أي اعتماد على التخزين المحلي.
                </p>
              </div>
            </div>
          </div>

          {/* Connection Status Card */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded-full ${isSupabaseConfigured() ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <h4 className="text-base font-black text-stone-900">
                  حالة الاتصال بـ Supabase: {isSupabaseConfigured() ? '✅ متصل ومُهيأ سحابياً' : '⚠️ قيد التهيئة'}
                </h4>
              </div>
              <button
                type="button"
                onClick={handleTestSupabase}
                disabled={isTestingSupabase}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingSupabase ? 'animate-spin' : ''}`} />
                <span>{isTestingSupabase ? 'جارِ فحص الجداول...' : 'فحص واختبار جداول Supabase الآن ⚡'}</span>
              </button>
            </div>

            {/* Test Results Breakdown */}
            {supabaseTestStatus && (
              <div className={`p-4 rounded-2xl border ${supabaseTestStatus.success ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'} space-y-3`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-stone-900">
                    {supabaseTestStatus.success ? '✅ تم الاتصال بنجاح بقاعدة بيانات Supabase' : '⚠️ تم فحص الاتصال مع ملاحظات:'}
                  </span>
                  {supabaseTestStatus.error && (
                    <span className="text-[11px] text-red-600 font-mono font-bold">{supabaseTestStatus.error}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  {Object.entries(supabaseTestStatus.tables || {}).map(([tbl, ok]: [string, any]) => (
                    <div
                      key={tbl}
                      className={`p-2.5 rounded-xl border text-center font-mono text-xs flex items-center justify-between ${
                        ok ? 'bg-white border-emerald-300 text-emerald-800 font-bold' : 'bg-red-50 border-red-200 text-red-700'
                      }`}
                    >
                      <span className="text-stone-700">{tbl}:</span>
                      <span>{ok ? 'متصل ✅' : 'غير متوفر ❌'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Direct Sync & Migration Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={handlePushToSupabase}
                disabled={isSyncingSupabase}
                className="py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isSyncingSupabase ? 'جارِ المزامنة...' : 'رفع ومزامنة جميع البيانات إلى Supabase الآن 🚀'}</span>
              </button>

              <button
                type="button"
                onClick={handlePullFromSupabase}
                disabled={isSyncingSupabase}
                className="py-3.5 px-4 bg-stone-800 hover:bg-stone-900 text-white font-black text-xs rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{isSyncingSupabase ? 'جارِ السحب...' : 'سحب وتحديث البيانات من Supabase السحابية 📥'}</span>
              </button>
            </div>

            {supabaseSyncMsg && (
              <div className="p-3.5 bg-emerald-100 border border-emerald-300 text-emerald-950 font-bold text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{supabaseSyncMsg}</span>
              </div>
            )}
          </div>

          {/* SQL Schema Generation and Copy Card */}
          <div className="bg-stone-900 text-stone-100 rounded-3xl p-6 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <FileJson className="w-5 h-5 text-emerald-400" />
                <div>
                  <h4 className="text-sm font-black text-emerald-400">
                    كود SQL الشامل لإنشاء جميع جداول تطبيق خبزة في Supabase 📜
                  </h4>
                  <p className="text-xs text-stone-400 mt-0.5">
                    انسخ الكود بالكامل، افتح لوحة Supabase الخاصة بك، اذهب إلى <strong>SQL Editor</strong>، الصق الكود واضغط <strong>Run</strong>.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2500);
                }}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>تم النسخ بنجاح! 📋</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>نسخ كود SQL بالكامل 📋</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 font-mono text-[11px] text-emerald-300 max-h-96 overflow-y-auto space-y-1" dir="ltr">
              <pre className="text-stone-200 whitespace-pre-wrap">{SUPABASE_SCHEMA_SQL}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit / Add Family */}
      {editingFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-stone-200">
            <div className="p-5 bg-amber-600 text-white flex items-center justify-between shrink-0">
              <h3 className="font-extrabold text-lg">
                {editingFamily.id ? 'تعديل بيانات العائلة' : 'إضافة عائلة جديدة لقاعدة البيانات'}
              </h3>
              <button
                onClick={() => setEditingFamily(null)}
                className="p-1 text-amber-200 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveFamilySubmit} className="p-6 space-y-4 text-right overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">الاسم الثلاثي للعائلة</label>
                <input
                  type="text"
                  required
                  value={editingFamily.fullName || ''}
                  onChange={(e) => setEditingFamily({ ...editingFamily, fullName: e.target.value })}
                  placeholder="مثال: عائلة أبا الفضل الزبيدي"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">رقم هاتف العائلة (١١ رقم)</label>
                <input
                  type="tel"
                  required
                  maxLength={11}
                  value={editingFamily.phone || ''}
                  onChange={(e) =>
                    setEditingFamily({
                      ...editingFamily,
                      phone: e.target.value.replace(/\D/g, '').slice(0, 11),
                    })
                  }
                  placeholder="07701112233"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold font-mono text-xs"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">رمز VLAN للمنطقة</label>
                  <input
                    type="text"
                    required
                    value={editingFamily.vlanCode || ''}
                    onChange={(e) => setEditingFamily({ ...editingFamily, vlanCode: e.target.value })}
                    placeholder="VLAN-101"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-mono font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">اسم المنطقة</label>
                  <input
                    type="text"
                    required
                    value={editingFamily.areaName || ''}
                    onChange={(e) => setEditingFamily({ ...editingFamily, areaName: e.target.value })}
                    placeholder="الكرادة والعرصات"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  اسم المخبز المزود للخبز 🥖
                </label>
                <input
                  type="text"
                  required
                  value={editingFamily.bakeryName || ''}
                  onChange={(e) => setEditingFamily({ ...editingFamily, bakeryName: e.target.value })}
                  placeholder="مثال: مخبز الخبزة الرئيسي - فرع الكرادة"
                  className="w-full px-3.5 py-2.5 bg-amber-50/80 border border-amber-300 rounded-xl font-bold text-xs text-amber-950 focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Family Geographic Location Info & Map View */}
              <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-2xl space-y-2 text-right">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-amber-950 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-600" />
                    <span>الموقع الجغرافي المباشر لمنزل العائلة 📍</span>
                  </label>
                  {editingFamily.location ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLocation(editingFamily.location!);
                      }}
                      className="text-xs font-black text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>عرض موقع المنزل على الخريطة 📍</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">
                      بانتظار التقاط الموقع الأول
                    </span>
                  )}
                </div>

                <div className="p-2.5 bg-white/90 border border-amber-200 rounded-xl text-xs text-stone-700 space-y-1">
                  <p className="font-bold text-amber-900">
                    💡 يتم التقاط موقع منزل العائلة بدقة ١٠٠٪ تلقائياً عبر GPS هاتف العائلة عند ضغطهم زر "تحقق ودخول الحساب" لأول مرة في واجهة الزبون.
                  </p>
                  {editingFamily.location && (
                    <p className="font-mono text-[11px] text-stone-600 pt-1 border-t border-amber-100">
                      العنوان الملتقط: {editingFamily.location.addressText || `${editingFamily.location.lat.toFixed(5)}, ${editingFamily.location.lng.toFixed(5)}`}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">نوع باقة الاشتراك العائلية</label>
                <select
                  value={editingFamily.packageType || 'saver'}
                  onChange={(e) =>
                    setEditingFamily({
                      ...editingFamily,
                      packageType: e.target.value as PackageType,
                    })
                  }
                  className="w-full px-3.5 py-2.5 bg-amber-50 border border-amber-300 rounded-xl font-bold text-xs text-amber-900 focus:bg-white focus:ring-2 focus:ring-amber-500"
                >
                  <option value="saver">باقة توفير (15 طلب مجاني مقابل 10,000 د.ع)</option>
                  <option value="medium">الباقة المتوسطة (25 طلب مجاني مقابل 15,000 د.ع)</option>
                  <option value="unlimited">الباقة المفتوحة (طلبات غير محدودة مقابل 20,000 د.ع)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="blockCheck"
                  checked={!!editingFamily.isBlocked}
                  onChange={(e) => setEditingFamily({ ...editingFamily, isBlocked: e.target.checked })}
                  className="w-4 h-4 text-red-600 rounded"
                />
                <label htmlFor="blockCheck" className="text-xs font-bold text-red-700">
                  حظر هذا الرقم والعائلة من استخدام التطبيق
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingFamily(null)}
                  className="px-4 py-2 bg-stone-100 text-stone-700 font-bold text-xs rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md"
                >
                  حفظ البيانات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit / Add Mandoub */}
      {editingMandoub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-stone-200">
            <div className="p-5 bg-amber-600 text-white flex items-center justify-between shrink-0">
              <h3 className="font-extrabold text-lg">
                {editingMandoub.id ? 'تعديل حساب المندوب' : 'إضافة مندوب جديد'}
              </h3>
              <button
                onClick={() => setEditingMandoub(null)}
                className="p-1 text-amber-200 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveMandoubSubmit} className="p-6 space-y-4 text-right overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اسم المندوب الثلاثي</label>
                <input
                  type="text"
                  required
                  value={editingMandoub.name || ''}
                  onChange={(e) => setEditingMandoub({ ...editingMandoub, name: e.target.value })}
                  placeholder="علي الحسيني"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">اسم المستخدم للدخول</label>
                  <input
                    type="text"
                    required
                    value={editingMandoub.username || ''}
                    onChange={(e) => setEditingMandoub({ ...editingMandoub, username: e.target.value })}
                    placeholder="ali_karrada"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-mono font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">كلمة السر</label>
                  <input
                    type="text"
                    required
                    value={editingMandoub.password || ''}
                    onChange={(e) => setEditingMandoub({ ...editingMandoub, password: e.target.value })}
                    placeholder="123456"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-mono font-bold text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">رمز VLAN للمنطقة</label>
                  <input
                    type="text"
                    required
                    value={editingMandoub.vlanCode || ''}
                    onChange={(e) => setEditingMandoub({ ...editingMandoub, vlanCode: e.target.value })}
                    placeholder="VLAN-101"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-mono font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">اسم المنطقة المخصصة</label>
                  <input
                    type="text"
                    required
                    value={editingMandoub.areaName || ''}
                    onChange={(e) => setEditingMandoub({ ...editingMandoub, areaName: e.target.value })}
                    placeholder="الكرادة والعرصات"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">رقم هاتف المندوب (يمكن تعديله من الادمن فقط)</label>
                <input
                  type="tel"
                  maxLength={11}
                  value={editingMandoub.phone || ''}
                  onChange={(e) =>
                    setEditingMandoub({
                      ...editingMandoub,
                      phone: e.target.value.replace(/\D/g, '').slice(0, 11),
                    })
                  }
                  placeholder="07801234567"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold font-mono text-xs"
                  dir="ltr"
                />
              </div>

              {/* Geographic Location of Mandoub - Automatic GPS Tracking */}
              <div className="p-3.5 bg-amber-50/80 border border-amber-300/80 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-amber-950 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-600" />
                    <span>تتبع الموقع الجغرافي المباشر للمندوب 📍</span>
                  </label>
                  {editingMandoub.currentLocation && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLocation(editingMandoub.currentLocation!);
                      }}
                      className="text-[11px] font-black text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>معاينة خريطة المندوب</span>
                    </button>
                  )}
                </div>

                <div className="p-3 bg-white/90 border border-amber-200 rounded-xl text-xs space-y-1.5">
                  <p className="font-bold text-amber-900 leading-relaxed">
                    💡 يتم التقاط الموقع الجغرافي التفصيلي للمندوب تلقائياً وبدقة عالية فور تسجيل دخوله بحسابه في التطبيق، ويبقى تتبع موقعه فعالاً في الخلفية لحين إيقاف حسابه أو حذفه.
                  </p>
                  {editingMandoub.currentLocation ? (
                    <p className="font-mono text-[11px] text-stone-600 pt-1.5 border-t border-amber-100 flex items-center justify-between">
                      <span>آخر موقع مسجل:</span>
                      <span className="font-bold text-amber-800">
                        {editingMandoub.currentLocation.addressText || `${editingMandoub.currentLocation.lat.toFixed(4)}, ${editingMandoub.currentLocation.lng.toFixed(4)}`}
                      </span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-stone-500 font-semibold pt-1 border-t border-amber-100">
                      بانتظار تسجيل المندوب لدخوله الأول لالتقاط الموقع المباشر تلقائياً.
                    </p>
                  )}
                </div>
              </div>

              {/* Mandoub Salary Type Configuration */}
              <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-3">
                <label className="block text-xs font-black text-amber-900">
                  نظام راتب وحسابات المندوب:
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-stone-800">
                    <input
                      type="radio"
                      name="salaryType"
                      checked={(editingMandoub.salaryType || 'percentage') === 'percentage'}
                      onChange={() => setEditingMandoub({ ...editingMandoub, salaryType: 'percentage' })}
                      className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                    />
                    <span>نسبة مئوية متغيرة</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-stone-800">
                    <input
                      type="radio"
                      name="salaryType"
                      checked={editingMandoub.salaryType === 'fixed'}
                      onChange={() => setEditingMandoub({ ...editingMandoub, salaryType: 'fixed' })}
                      className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                    />
                    <span>راتب أسبوعي / شهري ثابت</span>
                  </label>
                </div>

                {editingMandoub.salaryType === 'fixed' ? (
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">
                      مبلغ الراتب الثابت للمندوب (بالدينار العراقي):
                    </label>
                    <input
                      type="number"
                      value={editingMandoub.fixedSalaryAmount ?? 500000}
                      onChange={(e) =>
                        setEditingMandoub({
                          ...editingMandoub,
                          fixedSalaryAmount: Number(e.target.value),
                        })
                      }
                      className="w-full px-3.5 py-2 bg-white border border-amber-300 rounded-xl font-mono font-bold text-xs"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">
                      نسبة عمولة المندوب من مبالغ الاشتراكات (%):
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editingMandoub.commissionPercentage ?? 25}
                      onChange={(e) =>
                        setEditingMandoub({
                          ...editingMandoub,
                          commissionPercentage: Number(e.target.value),
                        })
                      }
                      className="w-full px-3.5 py-2 bg-white border border-amber-300 rounded-xl font-mono font-bold text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Account Active / Disabled Toggle */}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl flex items-center justify-between">
                <div>
                  <label className="block text-xs font-black text-stone-900">حالة حساب المندوب</label>
                  <p className="text-[11px] text-stone-500 font-semibold">
                    عند تعطيل الحساب، لا يمكن للمندوب تسجيل الدخول وتظهر له رسالة بأن حسابه معطل.
                  </p>
                </div>
                <select
                  value={(editingMandoub.status === 'disabled' || editingMandoub.status === 'inactive') ? 'disabled' : 'active'}
                  onChange={(e) =>
                    setEditingMandoub({
                      ...editingMandoub,
                      status: e.target.value as 'active' | 'disabled',
                    })
                  }
                  className="px-3 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 focus:ring-2 focus:ring-amber-500"
                >
                  <option value="active">مفعل (نشط)</option>
                  <option value="disabled">معطل (موقوف)</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMandoub(null)}
                  className="px-4 py-2 bg-stone-100 text-stone-700 font-bold text-xs rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md"
                >
                  حفظ حساب المندوب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit / Add Admin */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200">
            <div className="p-5 bg-amber-600 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-lg">حساب مشرف أدمن</h3>
              <button
                onClick={() => setEditingAdmin(null)}
                className="p-1 text-amber-200 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveAdminSubmit} className="p-6 space-y-4 text-right">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">الاسم الكامل للمشرف</label>
                <input
                  type="text"
                  required
                  value={editingAdmin.fullName || ''}
                  onChange={(e) => setEditingAdmin({ ...editingAdmin, fullName: e.target.value })}
                  placeholder="مدير جديد"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">اسم المستخدم</label>
                <input
                  type="text"
                  required
                  value={editingAdmin.username || ''}
                  onChange={(e) => setEditingAdmin({ ...editingAdmin, username: e.target.value })}
                  placeholder="admin123"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-mono font-bold text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">كلمة السر</label>
                <input
                  type="text"
                  required
                  value={editingAdmin.password || ''}
                  onChange={(e) => setEditingAdmin({ ...editingAdmin, password: e.target.value })}
                  placeholder="admin123"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl font-mono font-bold text-xs"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="px-4 py-2 bg-stone-100 text-stone-700 font-bold text-xs rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md"
                >
                  حفظ الحساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Admin Note when Rejecting Unpaid */}
      {rejectingOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200">
            <div className="p-5 bg-amber-600 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-lg">ملاحظة عدم تأكيد الغير مسدد</h3>
              <button
                onClick={() => setRejectingOrderId(null)}
                className="p-1 text-amber-200 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleRejectUnpaidSubmit} className="p-6 space-y-4 text-right">
              <p className="text-xs text-stone-600 font-bold">
                أدخل الملاحظة الموجهة للمندوب لشرح سبب عدم اعتماد حالة الغير مسدد للطلب:
              </p>

              <textarea
                rows={3}
                required
                value={adminNoteInput}
                onChange={(e) => setAdminNoteInput(e.target.value)}
                placeholder="مثال: تم التواصل مع العائلة والتأكد من تسديد المبلغ نقداً للمندوب..."
                className="w-full p-3 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs focus:bg-white focus:ring-2 focus:ring-amber-500/20"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingOrderId(null)}
                  className="px-4 py-2 bg-stone-100 text-stone-700 font-bold text-xs rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md"
                >
                  إرسال الملاحظة للمندوب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {selectedLocation && (
        <LocationPickerModal
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
        />
      )}

      {/* Modal: Confirm Database Reset / Wipe */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200 text-right">
            <div className="p-5 bg-gradient-to-r from-red-700 via-red-600 to-red-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-amber-300 animate-pulse" />
                <h3 className="font-extrabold text-lg">تأكيد مسح وإعادة ضبط البيانات</h3>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                className="p-1 text-red-200 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleConfirmResetDatabase} className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs font-bold text-red-900 space-y-1.5 leading-relaxed">
                <p className="text-sm font-black text-red-700">⚠️ تحذير أمني شديد الخطورة:</p>
                <p>
                  عند مسح البيانات، سيتم حذف جميع المندوبين، جميع العوائل والاشتراكات، وتاريخ الطلبات والأرقام المحظورة نهائياً من النظام.
                </p>
                <p className="text-stone-700 font-semibold pt-1 border-t border-red-200/80">
                  * ملاحظة: سيتم الحفاظ فقط على حسابات مدير النظام (الأدمن).
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-stone-800 mb-1.5 pr-1">
                  أدخل كلمة سر الأدمن لتأكيد العملية:
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={resetPasscode}
                  onChange={(e) => {
                    setResetPasscode(e.target.value);
                    setResetError(null);
                  }}
                  placeholder="أدخل كلمة سر الأدمن الخاص بك"
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl font-bold font-mono text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-all"
                  dir="ltr"
                />
                <p className="text-[11px] text-stone-500 mt-1 font-semibold">
                  (ملاحظة: أدخل كلمة المرور الخاصة بحساب الأدمن لتأكيد مسح البيانات بالكامل)
                </p>
              </div>

              {resetError && (
                <div className="p-3 bg-red-100 border border-red-300 text-red-900 text-xs font-bold rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-colors"
                >
                  إلغاء الأمر
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-md shadow-red-600/30 flex items-center gap-2 transition-all active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>مسح وتفريغ القاعدة الآن</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Confirm Restore Point v1.0.4.final */}
      {showRestoreV104Modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200 text-right">
            <div className="p-5 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-6 h-6 text-amber-100" />
                <h3 className="font-extrabold text-lg">تأكيد استرجاع نقطة v1.0.4.final</h3>
              </div>
              <button
                onClick={() => setShowRestoreV104Modal(false)}
                className="p-1 text-amber-100 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleConfirmRestoreV104} className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs font-bold text-amber-900 space-y-1.5 leading-relaxed">
                <p className="text-sm font-black text-amber-800">📌 استرجاع النقطة الرسمية والمستقرة الآمنة:</p>
                <p>
                  سيتم تطبيق وتفعيل نقطة الاستعادة الرسمية v1.0.4.final وتعيين النظام إلى الحالة المستقرة المعتمدة.
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-stone-800 mb-1.5 pr-1">
                  أدخل كلمة سر الأدمن لتأكيد العملية:
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={restoreV104Passcode}
                  onChange={(e) => {
                    setRestoreV104Passcode(e.target.value);
                    setRestoreV104Error(null);
                  }}
                  placeholder="أدخل كلمة سر الأدمن الخاص بك"
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl font-bold font-mono text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                  dir="ltr"
                />
                <p className="text-[11px] text-stone-500 mt-1 font-semibold">
                  (ملاحظة: يتطلب أدخال كلمة سر الأدمن لتأكيد تطبيق نقطة الاستعادة)
                </p>
              </div>

              {restoreV104Error && (
                <div className="p-3 bg-red-100 border border-red-300 text-red-900 text-xs font-bold rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{restoreV104Error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowRestoreV104Modal(false)}
                  className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-colors"
                >
                  إلغاء الأمر
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md shadow-amber-600/30 flex items-center gap-2 transition-all active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>تأكيد واسترجاع النقطة الآن</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
