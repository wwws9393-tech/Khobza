import React, { useState, useEffect } from 'react';
import { Family, LocationData, Mandoub, Order, OrderType, PackageType, RenewalRequest, TimeSlot } from '../types';
import {
  confirmOrderReceipt,
  createOrder,
  createRenewalRequest,
  getFamilyByPhone,
  getMandoubs,
  getOrders,
  getRenewalRequests,
  isOrderMatchedToMandoub,
  isVlanMatching,
  normalizeIraqiPhone,
  normalizeVlanCode,
  pushToServer,
  syncWithServer,
} from '../services/storage';
import { requestNotificationPermission, sendBrowserNotification } from '../services/notifications';
import { registerPushSubscription } from '../services/pushService';
import { registerFcmToken } from '../services/fcmService';

import {
  Calendar,
  Clock,
  Phone,
  ShoppingBag,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  MapPin,
  LogOut,
  ChevronLeft,
  RotateCcw,
  Bell,
  Check,
  Truck,
  RefreshCw,
  Crown,
  Zap,
  DollarSign,
  X,
  Smartphone,
  Share2,
  PlusSquare,
  Download,
} from 'lucide-react';

interface Props {
  family: Family;
  location: LocationData;
  onLogout: () => void;
}

export const CustomerMainView: React.FC<Props> = ({
  family,
  location,
  onLogout,
}) => {
  // Order selection state: null = none chosen yet, 'kg' = بالكيلو, 'loaf' = رغيف, 'amount' = مبلغ مادي
  const [selectedType, setSelectedType] = useState<OrderType | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [priceAmount, setPriceAmount] = useState<number>(1000);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot>('morning');

  const [activeFamily, setActiveFamily] = useState<Family>(family);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [assignedMandoub, setAssignedMandoub] = useState<Mandoub | null>(null);
  const [orderSuccessMessage, setOrderSuccessMessage] = useState<string | null>(null);
  const [isOrderSubmitted, setIsOrderSubmitted] = useState<boolean>(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);

  // Renewal Modal State
  const [showRenewalModal, setShowRenewalModal] = useState<boolean>(false);
  const [selectedPackageForRenewal, setSelectedPackageForRenewal] = useState<PackageType>('saver');
  const [latestRenewal, setLatestRenewal] = useState<RenewalRequest | null>(null);

  // App PWA Installation State
  const [showIosInstallModal, setShowIosInstallModal] = useState<boolean>(false);
  const [showAndroidInstallModal, setShowAndroidInstallModal] = useState<boolean>(false);
  const [installedToast, setInstalledToast] = useState<boolean>(false);

  const handleInstallAppClick = () => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone;

    if (isStandalone) {
      setInstalledToast(true);
      setTimeout(() => setInstalledToast(false), 4000);
      return;
    }

    const isInIframe = window.self !== window.top;

    // If deferredPrompt is available (Android / Chrome / Edge)
    if ((window as any).deferredPrompt) {
      const promptEvent = (window as any).deferredPrompt;
      try {
        promptEvent.prompt();
        promptEvent.userChoice.then((choiceResult: { outcome: string }) => {
          if (choiceResult.outcome === 'accepted') {
            setInstalledToast(true);
            setTimeout(() => setInstalledToast(false), 4000);
          }
          (window as any).deferredPrompt = null;
        });
      } catch (err) {
        console.warn('Install prompt trigger failed:', err);
      }
      return;
    }

    // If inside iframe preview, directly launch standalone auto-install window immediately
    if (isInIframe) {
      localStorage.setItem('khobza_auto_install', 'true');
      window.open(`${window.location.origin}?autoInstall=1`, '_blank');
      return;
    }

    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIos = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIos) {
      setShowIosInstallModal(true);
    } else {
      setShowAndroidInstallModal(true);
    }
  };

  const isExpiredOrNoOrders =
    family.subscriptionStatus === 'expired' ||
    family.daysRemaining <= 0 ||
    (family.packageType !== 'unlimited' &&
      typeof family.remainingOrders === 'number' &&
      family.remainingOrders <= 0);

  const handleDismissRenewal = (renewalId: string) => {
    try {
      const key = `khobza_dismissed_renewals_${family.id}`;
      const dismissed: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      if (!dismissed.includes(renewalId)) {
        dismissed.push(renewalId);
        localStorage.setItem(key, JSON.stringify(dismissed));
      }
    } catch (e) {}
    setLatestRenewal(null);
  };

  // Sync active orders, assigned mandoub, and latest renewal request for this family
  const loadOrders = () => {
    // 1. Refresh active family from local storage / cloud state
    const currentFam = getFamilyByPhone(family.phone) || family;
    setActiveFamily(currentFam);

    const allOrders = getOrders();
    const famPhoneNorm = normalizeIraqiPhone(currentFam.phone || family.phone);
    const familyOrders = allOrders.filter((o) => {
      if (o.familyId && (o.familyId === currentFam.id || o.familyId === family.id)) {
        return true;
      }
      const orderPhoneNorm = normalizeIraqiPhone(o.familyPhone);
      if (
        famPhoneNorm &&
        orderPhoneNorm &&
        (famPhoneNorm === orderPhoneNorm ||
          famPhoneNorm.endsWith(orderPhoneNorm) ||
          orderPhoneNorm.endsWith(famPhoneNorm))
      ) {
        return true;
      }
      return o.familyPhone === currentFam.phone || o.familyPhone === family.phone;
    });
    setCustomerOrders(familyOrders);

    // Load latest renewal request for this family, ignoring permanently dismissed banners
    const key = `khobza_dismissed_renewals_${currentFam.id}`;
    let dismissedIds: string[] = [];
    try {
      dismissedIds = JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {}

    const renewals = getRenewalRequests();
    const famRenewals = renewals.filter(
      (r) =>
        (r.familyId === currentFam.id ||
          r.familyPhone === currentFam.phone ||
          r.familyPhone === family.phone) &&
        !dismissedIds.includes(r.id)
    );
    if (famRenewals.length > 0) {
      setLatestRenewal(famRenewals[0]);
    } else {
      setLatestRenewal(null);
    }

    // Notify customer on family device if an order reaches under_review ("وصل الخبز إلى منزلكم")
    const notifiedKey = `khobza_family_notified_orders_${currentFam.id}`;
    let notifiedIds: string[] = [];
    try {
      notifiedIds = JSON.parse(localStorage.getItem(notifiedKey) || '[]');
    } catch (e) {}

    const notifiedSet = new Set(notifiedIds);
    let newlyNotified = false;

    familyOrders.forEach((o) => {
      if (o.status === 'under_review' && !notifiedSet.has(o.id)) {
        sendBrowserNotification(
          '🎉 وصل الخبز إلى منزلكم!',
          `قام المندوب بتوصيل طلب الخبز (${o.quantity} ${o.unitText}). يرجى تأكيد الاستلام الآن!`,
          { orderId: o.id, targetRole: 'family', targetPhone: currentFam.phone, force: true }
        );
        notifiedSet.add(o.id);
        newlyNotified = true;
      }
    });

    if (newlyNotified) {
      try {
        localStorage.setItem(notifiedKey, JSON.stringify(Array.from(notifiedSet)));
      } catch (e) {}
    }

    const mandoubs = getMandoubs();
    const activeMandoubs = mandoubs.filter((m) => !m.status || m.status === 'active');
    
    // Check if any recent order already has an assigned Mandoub
    let assigned: Mandoub | null = null;
    const orderWithMandoub = familyOrders.find((o) => o.mandoubId || o.mandoubName);
    if (orderWithMandoub?.mandoubId) {
      assigned = activeMandoubs.find((m) => m.id === orderWithMandoub.mandoubId) || null;
    }
    if (!assigned && orderWithMandoub?.mandoubName) {
      assigned = activeMandoubs.find(
        (m) =>
          (m.name && m.name.trim() === orderWithMandoub.mandoubName?.trim()) ||
          (m.username && m.username.trim() === orderWithMandoub.mandoubName?.trim())
      ) || null;
    }
    if (!assigned) {
      const matched = activeMandoubs.find((m) =>
        isOrderMatchedToMandoub(
          { vlanCode: currentFam.vlanCode, areaName: currentFam.areaName },
          m,
          activeMandoubs
        )
      );
      const fallbackMandoub = !matched && activeMandoubs.length === 1 ? activeMandoubs[0] : null;
      assigned = matched || fallbackMandoub || (activeMandoubs.length > 0 ? activeMandoubs[0] : null);
    }

    if (!assigned && orderWithMandoub?.mandoubName) {
      assigned = {
        id: orderWithMandoub.mandoubId || 'mandoub-active',
        name: orderWithMandoub.mandoubName,
        username: orderWithMandoub.mandoubName,
        password: '',
        vlanCode: currentFam.vlanCode,
        areaName: currentFam.areaName || '',
        status: 'active',
        phone: orderWithMandoub.mandoubPhone,
      };
    }

    setAssignedMandoub(assigned);
  };

  useEffect(() => {
    requestNotificationPermission().catch(() => {});
    if (family?.phone || family?.id) {
      registerFcmToken(family.phone || family.id, 'family', family.vlanCode).catch(() => {});
      registerPushSubscription(family.phone || family.id, 'family', family.vlanCode).catch(() => {});
    }

    const fetchDirectOrders = async () => {
      try {
        const res = await fetch(`/api/orders?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.orders)) {
            const currentStr = localStorage.getItem('khobza_orders_v2');
            const nextStr = JSON.stringify(data.orders);
            if (currentStr !== nextStr) {
              localStorage.setItem('khobza_orders_v2', nextStr);
              loadOrders();
            }
          }
        }
      } catch (e) {}
    };

    // Direct cloud sync immediately on launch
    syncWithServer(true).then(() => {
      fetchDirectOrders();
      loadOrders();
    }).catch(() => {
      fetchDirectOrders();
      loadOrders();
    });

    loadOrders();
    const handleStorageChange = () => loadOrders();
    window.addEventListener('khobza_data_change', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);

    const handleFocusOrVisibility = () => {
      fetchDirectOrders();
      syncWithServer(true).then(() => loadOrders()).catch(() => loadOrders());
    };
    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    // Live continuous sync and delivery status poll every 1.5 seconds
    const interval = setInterval(() => {
      fetchDirectOrders();
      syncWithServer(true).then(() => loadOrders()).catch(() => loadOrders());
    }, 1500);

    return () => {
      window.removeEventListener('khobza_data_change', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      clearInterval(interval);
    };
  }, [family.phone, family.id, family.vlanCode]);

  // Helper for quantity unit text
  const getUnitText = (type: OrderType, qty: number) => {
    if (type === 'kg') {
      return qty === 1 ? 'كيلو' : 'كيلوات';
    } else if (type === 'amount') {
      return `خبزة (مقابل ${priceAmount.toLocaleString()} د.ع)`;
    } else {
      return 'خبزة';
    }
  };

  const [orderValidationError, setOrderValidationError] = useState<string | null>(null);

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingOrder) return;

    setOrderValidationError(null);

    if (!selectedType) {
      setOrderValidationError('يرجى اختيار نوع الطلب من الخيارات المتاحة');
      return;
    }

    if (selectedType === 'loaf' && quantity < 10) {
      setOrderValidationError('أقل عدد مسموح للطلب بالخبز هو ١٠ خبزات');
      return;
    }

    if (selectedType === 'kg' && quantity < 2) {
      setOrderValidationError('أقل عدد مسموح للطلب بالكيلو هو كيلوين (٢ كيلو)');
      return;
    }

    if (selectedType === 'amount' && (!priceAmount || priceAmount < 1000)) {
      setOrderValidationError('أقل مبلغ مادي مسموح للطلب هو ١,٠٠٠ دينار عراقي');
      return;
    }

    setIsSubmittingOrder(true);

    try {
      if (selectedType === 'amount') {
        createOrder({
          family,
          orderType: 'amount',
          priceAmount,
          quantity: Math.round((priceAmount / 1000) * 6),
          timeSlot: selectedTimeSlot,
        });
      } else {
        createOrder({
          family,
          orderType: selectedType,
          quantity,
          timeSlot: selectedTimeSlot,
        });
      }

      setIsOrderSubmitted(true);
      setTimeout(() => {
        setIsOrderSubmitted(false);
      }, 3000);

      // Reset selection form
      setSelectedType(null);
      setQuantity(1);
      setPriceAmount(1000);
      setSelectedTimeSlot('morning');
      loadOrders();
    } finally {
      setTimeout(() => setIsSubmittingOrder(false), 500);
    }
  };

  const handleConfirmArrival = (orderId: string) => {
    confirmOrderReceipt(orderId);
    setCustomerOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'completed_confirmed',
              customerConfirmedAt: new Date().toISOString(),
            }
          : o
      )
    );
    setOrderSuccessMessage('تم تأكيد وصول واستلام طلب الخبز بنجاح! بالعافية 🥖');
    pushToServer('merge');
    setTimeout(() => {
      loadOrders();
    }, 100);
  };


  const handleConfirmRenewal = (e: React.FormEvent) => {
    e.preventDefault();
    createRenewalRequest({
      family,
      requestedPackage: selectedPackageForRenewal,
    });
    pushToServer('merge');
    setShowRenewalModal(false);
    loadOrders();
  };

  // Find orders waiting for customer arrival confirmation
  const pendingConfirmations = customerOrders.filter(
    (o) => o.status === 'under_review'
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Top Header Card: Family Profile & Subscription Days */}
      <div className="bg-gradient-to-br from-amber-600 via-amber-700 to-stone-900 rounded-3xl shadow-xl text-white p-6 relative overflow-hidden">
        {/* Decorative background shape */}
        <div className="absolute -left-12 -top-12 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-300" />
              <h2 className="text-xl font-black">{family.fullName}</h2>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold text-amber-100">
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                <span dir="ltr">{family.phone}</span>
              </span>
              <span className="flex items-center gap-1 bg-white/15 px-2.5 py-0.5 rounded-full">
                <MapPin className="w-3.5 h-3.5 text-amber-300" />
                <span>{family.areaName} ({family.vlanCode})</span>
              </span>
            </div>
            <div className="pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-950/60 text-amber-200 border border-amber-400/40 rounded-xl text-xs font-bold">
                <ShoppingBag className="w-3.5 h-3.5 text-amber-300" />
                <span>المخبز المزود: <strong className="text-white">{family.bakeryName || 'مخبز الخبزة الرئيسي'}</strong></span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all border border-white/20 backdrop-blur-xs"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل خروج</span>
            </button>
          </div>
        </div>

        {/* Subscription Days & Package Badge */}
        <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-amber-100">
            <Calendar className="w-4 h-4 text-amber-300" />
            <span>الاشتراك: <strong>30 يوماً</strong></span>
            <span>|</span>
            <span className="flex items-center gap-1 font-bold text-amber-200">
              <Crown className="w-4 h-4 text-amber-300" />
              <span>
                {family.packageType === 'medium'
                  ? 'الباقة المتوسطة (25 طلب)'
                  : family.packageType === 'unlimited'
                  ? 'الباقة المفتوحة (طلبات غير محدودة)'
                  : 'باقة توفير (15 طلب)'}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-white/90 text-amber-900 px-3.5 py-1.5 rounded-2xl shadow-md font-black text-xs md:text-sm flex items-center gap-1.5">
              <span>المتبقي:</span>
              <span className="text-base text-amber-600 font-mono">
                {family.packageType === 'unlimited'
                  ? 'مفتوح'
                  : family.remainingOrders ?? 15}
              </span>
              <span>{family.packageType === 'unlimited' ? '' : 'طلب'}</span>
            </div>

            <div className="bg-amber-900/80 text-amber-100 border border-amber-400/30 px-3.5 py-1.5 rounded-2xl font-black text-xs md:text-sm flex items-center gap-1.5">
              <span>الأيام:</span>
              <span className="text-base text-amber-300 font-mono">{family.daysRemaining}</span>
              <span>يوم</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mandoub info card for family */}
      <div className="bg-amber-50 border-2 border-amber-300/80 rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4 text-right shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-600 text-white rounded-2xl shadow-md shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] font-extrabold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-md inline-block">
              المندوب المسؤول عن منطقتك ({family.vlanCode})
            </span>
            <h4 className="font-black text-stone-900 text-lg">
              {assignedMandoub ? assignedMandoub.name : 'جاري تعيين مندوب للمنطقة...'}
            </h4>
            {assignedMandoub && assignedMandoub.phone ? (
              <p className="text-xs font-bold text-stone-700 flex items-center gap-1" dir="ltr">
                <Phone className="w-3.5 h-3.5 text-amber-600" />
                <span>{assignedMandoub.phone}</span>
              </p>
            ) : (
              <p className="text-xs text-stone-500 font-medium">رقم الهاتف يظهر هنا فور إدخاله</p>
            )}
          </div>
        </div>

        {assignedMandoub && assignedMandoub.phone && (
          <a
            href={`tel:${assignedMandoub.phone}`}
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 shrink-0"
          >
            <Phone className="w-4 h-4" />
            <span>اتصال بالمندوب</span>
          </a>
        )}
      </div>

      {/* Live Arrival Confirmation Alert Banner */}
      {pendingConfirmations.length > 0 && (
        <div className="space-y-3">
          {pendingConfirmations.map((ord) => (
            <div
              key={ord.id}
              className="bg-amber-500 text-white p-5 rounded-2xl shadow-xl border-2 border-amber-300 animate-pulse flex flex-col md:flex-row items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white text-amber-600 rounded-full shadow-md shrink-0">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-extrabold text-base">إشعار وصول الطلب من المندوب!</h4>
                  <p className="text-xs text-amber-100 mt-0.5">
                    طلب رقم <strong className="font-mono text-white">{ord.id}</strong> ({ord.quantity} {ord.unitText}) - هل وصلك الطلب الآن؟
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleConfirmArrival(ord.id)}
                className="w-full md:w-auto px-6 py-3 bg-stone-900 hover:bg-black text-white font-black text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 shrink-0"
              >
                <Check className="w-5 h-5 text-green-400" />
                <span>تأكيد وصول الطلب</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Success Modal Notification */}
      {orderSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start justify-between gap-3 text-emerald-900 text-sm font-bold">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{orderSuccessMessage}</span>
          </div>
          <button
            onClick={() => setOrderSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-mono text-base"
          >
            ✕
          </button>
        </div>
      )}

      {/* Renewal Request Dynamic Status Banner */}
      {latestRenewal && (
        <>
          {latestRenewal.status === 'pending_mandoub' && (
            <div className="p-4 bg-amber-500 text-white rounded-2xl flex items-center justify-between gap-3 text-sm font-bold shadow-lg border-2 border-amber-300 animate-pulse">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-5 h-5 text-amber-200 shrink-0 animate-spin" />
                <span>
                  تم إرسال طلب تجديد الاشتراك بنجاح! سيقوم المندوب بتأكيد التجديد واستلام المبلغ عند زيارتكم.
                </span>
              </div>
            </div>
          )}

          {latestRenewal.status === 'confirmed' && (
            <div className="p-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 text-white rounded-2xl flex items-center justify-between gap-3 text-sm font-bold shadow-xl border-2 border-emerald-300">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0 animate-bounce" />
                <span>
                  تم تجديد الاشتراك بنجاح! 🎉 تم تفعيل باقتكم واستلام المبلغ لدى المندوب بنجاح.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDismissRenewal(latestRenewal.id)}
                className="text-emerald-100 hover:text-white font-mono text-base px-2 py-0.5 rounded-lg bg-emerald-800/40 hover:bg-emerald-800/80 transition-colors"
                title="إغلاق التنبيه"
              >
                ✕
              </button>
            </div>
          )}

          {(latestRenewal.status === 'rejected_mandoub' || latestRenewal.status === 'rejected_admin') && (
            <div className="p-4 bg-red-600 text-white rounded-2xl flex items-center justify-between gap-3 text-sm font-bold shadow-lg border-2 border-red-300">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-red-200 shrink-0" />
                <span>
                  تم رفض طلب التجديد. السبب: {latestRenewal.rejectionReason || 'يرجى التواصل مع المندوب أو إدارة المخبز.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDismissRenewal(latestRenewal.id)}
                className="text-red-100 hover:text-white font-mono text-base px-2 py-0.5 rounded-lg bg-red-800/40 hover:bg-red-800/80 transition-colors"
                title="إغلاق التنبيه"
              >
                ✕
              </button>
            </div>
          )}
        </>
      )}

      {/* Main Order Request Panel */}
      <div id="bread-order-section" className="bg-white rounded-3xl shadow-lg border border-stone-200 p-6 md:p-8 space-y-6">
        <div className="border-b border-stone-100 pb-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-stone-900 flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-amber-600" />
              <span>تقديم طلب خبز جديد</span>
            </h3>
            <p className="text-xs font-semibold text-stone-500 mt-1">
              اختر نوع الطلب والكمية والوقت المناسب للاستلام
            </p>
          </div>

          {selectedType && (
            <button
              type="button"
              onClick={() => setSelectedType(null)}
              className="flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تغيير نوع الاختيار</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmitOrder} className="space-y-6">
          {/* Middle Choice Buttons / Inputs */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-stone-800">
              نوع وكمية الخبز المطلوبة:
            </label>

            {/* Options grid / form */}
            {!selectedType ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Option 1: By Kg */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedType('kg');
                    setQuantity(2);
                  }}
                  className="p-5 bg-stone-50 hover:bg-amber-50/80 border-2 border-stone-200 hover:border-amber-500 rounded-2xl text-right transition-all group flex flex-col justify-between shadow-xs hover:shadow-md cursor-pointer"
                >
                  <div className="space-y-2">
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-extrabold text-[11px] rounded-full inline-block">
                      الخيار الأول (أقل كمية: ٢ كيلو)
                    </span>
                    <h4 className="text-base font-black text-stone-900 group-hover:text-amber-700">
                      طلب بالكيلو
                    </h4>
                    <p className="text-xs text-stone-500">
                      تحديد كمية الخبز المطلوبة بالكيلوغرامات (أقل طلب كيلوين)
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-end text-xs font-bold text-amber-600">
                    <span>اختيار طلب كيلو</span>
                    <ChevronLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* Option 2: By Loaf */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedType('loaf');
                    setQuantity(10);
                  }}
                  className="p-5 bg-stone-50 hover:bg-amber-50/80 border-2 border-stone-200 hover:border-amber-500 rounded-2xl text-right transition-all group flex flex-col justify-between shadow-xs hover:shadow-md cursor-pointer"
                >
                  <div className="space-y-2">
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-extrabold text-[11px] rounded-full inline-block">
                      الخيار الثاني (أقل عدد: ١٠ خبزات)
                    </span>
                    <h4 className="text-base font-black text-stone-900 group-hover:text-amber-700">
                      طلب رغيف من الخبز
                    </h4>
                    <p className="text-xs text-stone-500">
                      تحديد العدد الدقيق لأقراص الخبز المطلوبة (أقل طلب ١٠ خبزات)
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-end text-xs font-bold text-amber-600">
                    <span>اختيار طلب بالعدد</span>
                    <ChevronLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* Option 3: By Amount (New) */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedType('amount');
                    setPriceAmount(1000);
                  }}
                  className="p-5 bg-stone-50 hover:bg-amber-50/80 border-2 border-amber-200 hover:border-amber-500 rounded-2xl text-right transition-all group flex flex-col justify-between shadow-xs hover:shadow-md cursor-pointer"
                >
                  <div className="space-y-2">
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-extrabold text-[11px] rounded-full inline-block">
                      الخيار الثالث (٦ خبزات / ١٠٠٠ د.ع)
                    </span>
                    <h4 className="text-base font-black text-stone-900 group-hover:text-amber-700">
                      طلب الخبز مقابل مبلغ مادي
                    </h4>
                    <p className="text-xs text-stone-500">
                      إدخال المبلغ المادي بالدينار مع احتساب عدد الخبز تلقائياً
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-end text-xs font-bold text-emerald-600">
                    <span>اختيار طلب بمبلغ مادي</span>
                    <ChevronLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>
            ) : selectedType === 'amount' ? (
              /* Amount-based order input field */
              <div className="p-5 bg-amber-50/80 border-2 border-amber-400 rounded-2xl space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-amber-950 text-sm">
                    طلب الخبز مقابل مبلغ مادي (٦ خبزات مقابل كل ١,٠٠٠ دينار)
                  </span>
                  <span className="text-xs text-stone-500">
                    (اختفاء الخيارات الأخرى تلقائياً)
                  </span>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-bold text-stone-800">
                    أدخل المبلغ المادي المطلق (أقل مبلغ: ١,٠٠٠ دينار):
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1000}
                      step={500}
                      value={priceAmount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setPriceAmount(val);
                      }}
                      className="w-40 px-4 py-2.5 bg-white border-2 border-amber-300 rounded-xl text-center font-black text-xl text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-inner"
                      placeholder="1000"
                    />
                    <span className="text-base font-extrabold text-stone-900">دينار عراقي</span>
                  </div>

                  {/* Quick Select Preset Buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[1000, 2000, 3000, 4000, 5000, 10000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setPriceAmount(amt)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          priceAmount === amt
                            ? 'bg-amber-600 text-white font-extrabold shadow-sm'
                            : 'bg-white border border-amber-200 text-amber-900 hover:bg-amber-100'
                        }`}
                      >
                        {amt.toLocaleString()} د.ع ({Math.round((amt / 1000) * 6)} خبزات)
                      </button>
                    ))}
                  </div>

                  {/* Live Calculation Output */}
                  <div className="p-3 bg-amber-100/90 border border-amber-300 rounded-xl text-right flex items-center justify-between text-xs font-black text-amber-950">
                    <span>عدد الخبز الناتج من هذا المبلغ:</span>
                    <span className="text-sm font-black text-amber-900 bg-white px-3 py-1 rounded-lg border border-amber-300 shadow-xs">
                      {Math.round((priceAmount / 1000) * 6)} خبزة طازجة 🥖
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* When kg or loaf option is selected */
              <div className="p-5 bg-amber-50/70 border-2 border-amber-400 rounded-2xl space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-amber-900 text-sm">
                    {selectedType === 'kg' ? 'طلب بالكيلو (أقل طلب: 2 كيلو)' : 'طلب رغيف من الخبز (أقل طلب: 10 خبزات)'}
                  </span>
                  <span className="text-xs text-stone-500">
                    (اختفاء الخيارات الأخرى تلقائياً)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-lg font-black text-stone-900">طلب</span>
                  <input
                    type="number"
                    min={selectedType === 'kg' ? 2 : 10}
                    max="100"
                    value={quantity}
                    onChange={(e) => {
                      const minVal = selectedType === 'kg' ? 2 : 10;
                      setQuantity(Math.max(1, parseInt(e.target.value) || minVal));
                    }}
                    className="w-28 px-4 py-2.5 bg-white border-2 border-amber-300 rounded-xl text-center font-black text-xl text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-inner"
                  />
                  <span className="text-lg font-black text-amber-800">
                    {getUnitText(selectedType, quantity)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Time Slots Section */}
          <div className="space-y-3 pt-2">
            <label className="block text-sm font-bold text-stone-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>خانة الوقت المطلوبة للاستلام:</span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                  selectedTimeSlot === 'morning'
                    ? 'bg-amber-50 border-amber-500 shadow-sm'
                    : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <div className="space-y-0.5">
                  <span className="font-black text-stone-900 block text-sm">صباحاً</span>
                  <span className="text-xs font-semibold text-stone-600">من ٩ إلى ١١ صباحاً</span>
                </div>
                <input
                  type="radio"
                  name="timeSlot"
                  checked={selectedTimeSlot === 'morning'}
                  onChange={() => setSelectedTimeSlot('morning')}
                  className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                />
              </label>

              <label
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                  selectedTimeSlot === 'afternoon'
                    ? 'bg-amber-50 border-amber-500 shadow-sm'
                    : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <div className="space-y-0.5">
                  <span className="font-black text-stone-900 block text-sm">ظهراً</span>
                  <span className="text-xs font-semibold text-stone-600">من ٣ إلى ٦ عصراً</span>
                </div>
                <input
                  type="radio"
                  name="timeSlot"
                  checked={selectedTimeSlot === 'afternoon'}
                  onChange={() => setSelectedTimeSlot('afternoon')}
                  className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                />
              </label>

              <label
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                  selectedTimeSlot === 'evening'
                    ? 'bg-amber-50 border-amber-500 shadow-sm'
                    : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <div className="space-y-0.5">
                  <span className="font-black text-stone-900 block text-sm">ليلاً</span>
                  <span className="text-xs font-semibold text-stone-600">من ٨ إلى ١٠ ليلاً</span>
                </div>
                <input
                  type="radio"
                  name="timeSlot"
                  checked={selectedTimeSlot === 'evening'}
                  onChange={() => setSelectedTimeSlot('evening')}
                  className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                />
              </label>
            </div>
          </div>

          {/* Submit Order or Renew Subscription Button */}
          {orderValidationError && (
            <div className="p-3.5 bg-red-50 border border-red-300 text-red-800 text-xs font-bold rounded-xl flex items-center gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{orderValidationError}</span>
            </div>
          )}

          {isExpiredOrNoOrders ? (
            <div className="space-y-3 pt-2">
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs md:text-sm font-bold flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>
                  انتهت أيام الاشتراك أو نفد رصيد الطلبات المجانية لهذه العائلة. يرجى التجديد للاستمرار بالطلب.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowRenewalModal(true)}
                className="w-full py-4 bg-gradient-to-r from-amber-600 via-amber-700 to-stone-900 hover:from-amber-700 hover:to-black text-white font-black text-lg rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <RefreshCw className="w-6 h-6 text-amber-300" />
                <span>تجديد الاشتراك الخبز</span>
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={!selectedType || isOrderSubmitted || isSubmittingOrder}
              className={`w-full py-4 font-black text-lg rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                isOrderSubmitted
                  ? 'bg-emerald-600 text-white shadow-emerald-500/30 font-black'
                  : selectedType
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white shadow-amber-500/25 active:scale-[0.98]'
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              }`}
            >
              {isOrderSubmitted ? (
                <>
                  <CheckCircle className="w-6 h-6 text-white animate-pulse" />
                  <span>تم الطلب</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-5 h-5" />
                  <span>طلب</span>
                </>
              )}
            </button>
          )}
        </form>
      </div>

      {/* Customer's Recent Orders List */}
      <div id="orders-history-section" className="bg-white rounded-3xl shadow-sm border border-stone-200 p-6 space-y-4">
        <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-600" />
          <span>طلبات الخبز الأخيرة لهذه العائلة</span>
        </h3>

        {customerOrders.length === 0 ? (
          <p className="text-center py-6 text-sm text-stone-400 font-semibold">
            لا توجد طلبات سابقة مسجلة. قم بتقديم أول طلب لك أعلاه!
          </p>
        ) : (
          <div className="space-y-3">
            {customerOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-4 rounded-2xl border border-stone-200 bg-stone-50/50 flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-lg text-xs">
                      {ord.id}
                    </span>
                    <span className="font-extrabold text-stone-900">
                      طلب {ord.quantity} {ord.unitText}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-stone-500">
                    موعد الاستلام: {ord.timeSlotText}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {ord.status === 'pending' && (
                    <span className="px-3 py-1 bg-amber-100 text-amber-900 text-xs font-bold rounded-full">
                      قيد الانتظار للمندوب
                    </span>
                  )}
                  {ord.status === 'under_review' && (
                    <button
                      onClick={() => handleConfirmArrival(ord.id)}
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <Bell className="w-3.5 h-3.5 animate-bounce" />
                      <span>تأكيد وصول الطلب</span>
                    </button>
                  )}
                  {ord.status === 'completed_confirmed' && (
                    <span className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 animate-fadeIn">
                      <CheckCircle className="w-4 h-4 text-emerald-200" />
                      <span>مكتمل (تم الاستلام)</span>
                    </span>
                  )}
                  {['processing_unpaid', 'unpaid_confirmed'].includes(ord.status) && (
                    <span className="px-3 py-1 bg-stone-200 text-stone-700 text-xs font-bold rounded-full">
                      قيد المعالجة الإدارية
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Renewal Package Selection Modal */}
      {showRenewalModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 space-y-6 shadow-2xl border border-amber-200 relative">
            <button
              onClick={() => setShowRenewalModal(false)}
              className="absolute left-6 top-6 p-2 text-stone-400 hover:text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-right space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-black">
                <Crown className="w-4 h-4 text-amber-600" />
                <span>اختر باقة الاشتراك المناسبة</span>
              </div>
              <h3 className="text-2xl font-black text-stone-900">تجديد اشتراك العائلة</h3>
              <p className="text-xs text-stone-500 font-semibold">
                حدد الباقة المطلوبة. سيصل الطلب فوراً للمندوب المختص لتأكيد الاستلام والتفعيل.
              </p>
            </div>

            <form onSubmit={handleConfirmRenewal} className="space-y-4">
              {/* Option 1: Saver Package */}
              <label
                onClick={() => setSelectedPackageForRenewal('saver')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between block ${
                  selectedPackageForRenewal === 'saver'
                    ? 'border-amber-600 bg-amber-50/80 shadow-md ring-2 ring-amber-500/20'
                    : 'border-stone-200 bg-stone-50 hover:bg-stone-100'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-stone-900 text-base">باقة توفير</span>
                    <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-extrabold rounded-md">
                      15 طلب مجاني
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 font-medium">
                    تتيح لك 15 طلب خبز مجاني على مدار الشهر
                  </p>
                  <div className="text-sm font-black text-amber-700 font-mono">
                    10,000 د.ع / شهرياً
                  </div>
                </div>

                <input
                  type="radio"
                  name="renewalPackage"
                  checked={selectedPackageForRenewal === 'saver'}
                  onChange={() => setSelectedPackageForRenewal('saver')}
                  className="w-5 h-5 text-amber-600 focus:ring-amber-500 shrink-0"
                />
              </label>

              {/* Option 2: Medium Package */}
              <label
                onClick={() => setSelectedPackageForRenewal('medium')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between block ${
                  selectedPackageForRenewal === 'medium'
                    ? 'border-amber-600 bg-amber-50/80 shadow-md ring-2 ring-amber-500/20'
                    : 'border-stone-200 bg-stone-50 hover:bg-stone-100'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-stone-900 text-base">الباقة المتوسطة</span>
                    <span className="px-2 py-0.5 bg-amber-600 text-white text-[10px] font-extrabold rounded-md shadow-xs">
                      الأكثر شعبية ✨ (25 طلب)
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 font-medium">
                    تتيح لك 25 طلب خبز مجاني للعوائل المتوسطة
                  </p>
                  <div className="text-sm font-black text-amber-700 font-mono">
                    15,000 د.ع / شهرياً
                  </div>
                </div>

                <input
                  type="radio"
                  name="renewalPackage"
                  checked={selectedPackageForRenewal === 'medium'}
                  onChange={() => setSelectedPackageForRenewal('medium')}
                  className="w-5 h-5 text-amber-600 focus:ring-amber-500 shrink-0"
                />
              </label>

              {/* Option 3: Unlimited Package */}
              <label
                onClick={() => setSelectedPackageForRenewal('unlimited')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between block ${
                  selectedPackageForRenewal === 'unlimited'
                    ? 'border-amber-600 bg-amber-50/80 shadow-md ring-2 ring-amber-500/20'
                    : 'border-stone-200 bg-stone-50 hover:bg-stone-100'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-stone-900 text-base">الباقة المفتوحة</span>
                    <span className="px-2 py-0.5 bg-stone-900 text-amber-300 text-[10px] font-extrabold rounded-md shadow-xs">
                      طلبات غير محدودة 👑
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 font-medium">
                    طلبات خبز مجانية غير محدودة طوال الـ 30 يوماً
                  </p>
                  <div className="text-sm font-black text-amber-700 font-mono">
                    20,000 د.ع / شهرياً
                  </div>
                </div>

                <input
                  type="radio"
                  name="renewalPackage"
                  checked={selectedPackageForRenewal === 'unlimited'}
                  onChange={() => setSelectedPackageForRenewal('unlimited')}
                  className="w-5 h-5 text-amber-600 focus:ring-amber-500 shrink-0"
                />
              </label>

              <button
                type="submit"
                className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white font-black text-base rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <CheckCircle className="w-5 h-5" />
                <span>إرسال طلب التجديد للمندوب</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Toast: App Already Installed */}
      {installedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-amber-300 font-extrabold text-xs px-5 py-3 rounded-2xl shadow-2xl border border-amber-500/40 animate-bounce flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>تطبيق الخبزة مثبّت بالفعل على الشاشة الرئيسية لهذا الهاتف ✨</span>
        </div>
      )}

      {/* Direct 1-Click Install Modal: iOS iPhone & iPad */}
      {showIosInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-stone-200">
            <div className="p-4 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-200" />
                <h3 className="font-black text-sm">تثبيت تطبيق الخبزة على الآيفون</h3>
              </div>
              <button
                onClick={() => setShowIosInstallModal(false)}
                className="p-1 text-amber-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4">
              {/* Prominent App Icon & Logo */}
              <div className="relative w-20 h-20 mx-auto">
                <img
                  src="/icon-192.png"
                  alt="لوغو تطبيق الخبزة"
                  className="w-20 h-20 rounded-2xl shadow-xl border-2 border-amber-300 object-cover mx-auto"
                />
                <span className="absolute -bottom-1 -right-1 bg-amber-600 text-white p-1 rounded-full text-xs shadow-md">
                  ✨
                </span>
              </div>

              <div>
                <h4 className="font-black text-stone-900 text-base">تطبيق الخبزة الذكي</h4>
                <p className="text-xs font-bold text-amber-900 mt-1">جاهز للتثبيت المباشر على شاشة هاتفك</p>
              </div>

              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-right text-xs font-bold text-stone-800 leading-relaxed flex items-center gap-2">
                <Share2 className="w-5 h-5 text-amber-600 shrink-0" />
                <span>اضغط خيار <strong>"مشاركة" (Share)</strong> ثم <strong>"إضافة إلى الشاشة الرئيسية"</strong> ليظهر التطبيق مع الأيقونة فوراً!</span>
              </div>

              <button
                type="button"
                onClick={() => setShowIosInstallModal(false)}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <CheckCircle className="w-4 h-4" />
                <span>تم التثبيت على الشاشة الرئيسية 🚀</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct 1-Click Install Modal: Android */}
      {showAndroidInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-stone-200">
            <div className="p-4 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-200" />
                <h3 className="font-black text-sm">تثبيت تطبيق الخبزة على الأندرويد</h3>
              </div>
              <button
                onClick={() => setShowAndroidInstallModal(false)}
                className="p-1 text-amber-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4">
              {/* Prominent App Icon & Logo */}
              <div className="relative w-20 h-20 mx-auto">
                <img
                  src="/icon-192.png"
                  alt="لوغو تطبيق الخبزة"
                  className="w-20 h-20 rounded-2xl shadow-xl border-2 border-amber-300 object-cover mx-auto"
                />
                <span className="absolute -bottom-1 -right-1 bg-amber-600 text-white p-1 rounded-full text-xs shadow-md">
                  ⚡
                </span>
              </div>

              <div>
                <h4 className="font-black text-stone-900 text-base">تطبيق الخبزة الذكي</h4>
                <p className="text-xs font-bold text-amber-900 mt-1">تثبيت بنقرة واحدة على الشاشة الرئيسية</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if ((window as any).deferredPrompt) {
                    try {
                      (window as any).deferredPrompt.prompt();
                      (window as any).deferredPrompt.userChoice.then((choice: any) => {
                        if (choice.outcome === 'accepted') {
                          setInstalledToast(true);
                          setTimeout(() => setInstalledToast(false), 4000);
                        }
                      });
                    } catch (e) {}
                  } else {
                    alert('تأكد من فتح التطبيق من المتصفح مباشرة للتثبيت التلقائي');
                  }
                  setShowAndroidInstallModal(false);
                }}
                className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-2xl shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Download className="w-5 h-5" />
                <span>تثبيت التطبيق الآن بنقرة واحدة 📱</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
