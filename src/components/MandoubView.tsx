import React, { useState, useEffect, useRef } from 'react';
import { LocationData, Mandoub, Order, RenewalRequest } from '../types';
import {
  confirmRenewalRequestByMandoub,
  getOrders,
  getRenewalRequests,
  rejectRenewalRequestByMandoub,
  saveMandoub,
  updateMandoubLocation,
  updateOrderStatus,
} from '../services/storage';
import { requestNotificationPermission, sendBrowserNotification } from '../services/notifications';
import { registerPushSubscription } from '../services/pushService';
import { registerFcmToken } from '../services/fcmService';
import { LocationPickerModal } from './LocationPickerModal';

import {
  Truck,
  Phone,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Clock,
  LogOut,
  RefreshCw,
  Search,
  MessageSquare,
  ShieldAlert,
  X,
  Send,
  Sparkles,
  DollarSign,
  Crown,
  Edit,
  ShoppingBag,
} from 'lucide-react';

interface Props {
  mandoub: Mandoub;
  onLogout: () => void;
}

export const MandoubView: React.FC<Props> = ({ mandoub, onLogout }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [showUnpaidModal, setShowUnpaidModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Rejection modal state
  const [rejectingRenewalId, setRejectingRenewalId] = useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');

  // Unpaid Amount Prompt State
  const [unpaidTargetOrder, setUnpaidTargetOrder] = useState<Order | null>(null);
  const [unpaidAmountInput, setUnpaidAmountInput] = useState<string>('');

  // Phone Edit Modal State
  const [showPhoneEditModal, setShowPhoneEditModal] = useState(false);
  const [mandoubPhoneInput, setMandoubPhoneInput] = useState(mandoub.phone || '');

  const handleSavePhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mandoubPhoneInput.trim()) return;
    saveMandoub({ ...mandoub, phone: mandoubPhoneInput.trim() });
    setShowPhoneEditModal(false);
    loadData();
  };

  const prevOrderIdsRef = useRef<Set<string>>(new Set());

  // Load orders and renewals for this Mandoub's VLAN
  const loadData = () => {
    const all = getOrders();
    const mandoubVlan = (mandoub.vlanCode || '').trim().toUpperCase();
    const vlanOrders = all.filter(
      (o) => (o.vlanCode || '').trim().toUpperCase() === mandoubVlan
    );

    // Check for new incoming orders and alert the Mandoub with chime sound, vibration, and system notification
    const notifiedKey = `khobza_mandoub_notified_orders_${mandoub.id}`;
    let notifiedIds: string[] = [];
    try {
      notifiedIds = JSON.parse(localStorage.getItem(notifiedKey) || '[]');
    } catch (e) {}

    const notifiedSet = new Set(notifiedIds);
    let newlyNotified = false;

    vlanOrders.forEach((o) => {
      if (o.status === 'pending' && !notifiedSet.has(o.id)) {
        const orderDesc = `طلب خبز جديد (${o.quantity} ${o.unitText}) - عائلة ${o.familyName}`;
        sendBrowserNotification('طلب خبز جديد وصل للمندوب! 🥖🔔', orderDesc, {
          orderId: o.id,
          targetRole: 'mandoub',
          force: true,
        });
        notifiedSet.add(o.id);
        newlyNotified = true;
      }
    });

    if (newlyNotified) {
      try {
        localStorage.setItem(notifiedKey, JSON.stringify(Array.from(notifiedSet)));
      } catch (e) {}
    }

    setOrders(vlanOrders);

    const allRenewals = getRenewalRequests();
    const vlanRenewals = allRenewals.filter(
      (r) => (r.vlanCode || '').trim().toUpperCase() === mandoubVlan || r.mandoubId === mandoub.id
    );
    setRenewalRequests(vlanRenewals);

    if (selectedOrder) {
      const refreshed = vlanOrders.find((o) => o.id === selectedOrder.id);
      if (
        !refreshed ||
        refreshed.status === 'completed_confirmed' ||
        refreshed.status === 'under_review' ||
        refreshed.status === 'unpaid_confirmed'
      ) {
        // Order confirmed or under review - close detail view immediately
        setSelectedOrder(null);
      } else {
        setSelectedOrder(refreshed);
      }
    }
  };

  useEffect(() => {
    requestNotificationPermission();
    if (mandoub?.phone) {
      registerFcmToken(mandoub.phone, 'mandoub', mandoub.vlanCode).catch(() => {});
      registerPushSubscription(mandoub.phone, 'mandoub', mandoub.vlanCode).catch(() => {});
    }
    loadData();
    handleShareGps();
    const handleStorageChange = () => loadData();

    window.addEventListener('khobza_data_change', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);

    // Continuous watchPosition for Mandoub live GPS location
    let watchId: number | null = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          updateMandoubLocation(
            mandoub.id,
            pos.coords.latitude,
            pos.coords.longitude,
            `موقع المندوب المباشر في منطقة ${mandoub.areaName}`
          );
        },
        (err) => console.warn('Mandoub GPS watch error:', err.message),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
      );
    }

    const interval = setInterval(() => {
      loadData();
      handleShareGps();
    }, 1000);

    return () => {
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      window.removeEventListener('khobza_data_change', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [mandoub.vlanCode]);

  const handleConfirmRenewal = (reqId: string) => {
    confirmRenewalRequestByMandoub(reqId, mandoub);
    loadData();
  };

  const handleRejectRenewal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingRenewalId) return;
    rejectRenewalRequestByMandoub(
      rejectingRenewalId,
      mandoub,
      rejectionReasonInput.trim() || 'تم رفض التجديد من قبل المندوب'
    );
    setRejectingRenewalId(null);
    setRejectionReasonInput('');
    loadData();
  };

  // Update Mandoub GPS location periodically
  const handleShareGps = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          updateMandoubLocation(
            mandoub.id,
            pos.coords.latitude,
            pos.coords.longitude,
            `موقع المندوب المباشر في منطقة ${mandoub.areaName}`
          );
        },
        (err) => console.warn('Mandoub GPS warning:', err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }
  };

  // Action: Click "مكتمل"
  const handleMarkCompleted = (order: Order) => {
    if (order.status === 'under_review') return; // Already under review

    updateOrderStatus(order.id, 'under_review', {
      mandoubId: mandoub.id,
      mandoubName: mandoub.name,
    });
    setSelectedOrder(null);
    loadData();
  };

  // Action: Open Unpaid Amount Prompt
  const handleOpenUnpaidPrompt = (order: Order) => {
    setUnpaidTargetOrder(order);
    setUnpaidAmountInput(order.unpaidAmount ? order.unpaidAmount.toString() : '');
  };

  // Submit Unpaid Amount
  const handleSubmitUnpaidAmount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unpaidTargetOrder) return;

    const parsedVal = parseFloat(unpaidAmountInput);
    if (isNaN(parsedVal) || parsedVal <= 0) {
      return;
    }

    updateOrderStatus(unpaidTargetOrder.id, 'processing_unpaid', {
      mandoubId: mandoub.id,
      mandoubName: mandoub.name,
      unpaidAmount: parsedVal,
    });

    setUnpaidTargetOrder(null);
    setUnpaidAmountInput('');
    loadData();
  };

  // Filter available active orders vs unpaid confirmed orders
  // Active available orders: pending, under_review, processing_unpaid, rejected_unpaid_returned
  const availableOrders = orders.filter(
    (o) =>
      ['pending', 'under_review', 'processing_unpaid', 'rejected_unpaid_returned'].includes(
        o.status
      ) &&
      (searchQuery === '' ||
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.familyName.includes(searchQuery) ||
        o.familyPhone.includes(searchQuery))
  );

  // Unpaid confirmed orders modal list
  const unpaidConfirmedOrders = orders.filter((o) => o.status === 'unpaid_confirmed');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Mandoub Header Banner */}
      <div className="bg-stone-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden border border-stone-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-amber-500 text-stone-900 rounded-2xl font-black shadow-lg shadow-amber-500/20">
              <Truck className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black">{mandoub.name}</h2>
                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-full">
                  نشط - اونلاين
                </span>
              </div>
              <p className="text-xs font-semibold text-stone-400 flex items-center gap-2 flex-wrap">
                <span>منطقة التغطية: <strong className="text-amber-400">{mandoub.areaName}</strong></span>
                <span>|</span>
                <span>VLAN: <span className="font-mono text-white bg-stone-800 px-2 py-0.5 rounded">{mandoub.vlanCode}</span></span>
                <span>|</span>
                <span dir="ltr" className="font-bold text-amber-300 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {mandoub.phone || 'لم يسجل رقم هاتف'}
                  <button
                    onClick={() => {
                      setMandoubPhoneInput(mandoub.phone || '');
                      setShowPhoneEditModal(true);
                    }}
                    className="p-1 text-stone-400 hover:text-white bg-stone-800 hover:bg-amber-600 rounded-md transition-colors mr-1"
                    title="تعديل رقم الهاتف"
                  >
                    <Edit className="w-3 h-3" />
                  </button>
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Unpaid Orders Top Button */}
            <button
              onClick={() => setShowUnpaidModal(true)}
              className="px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-xl font-extrabold text-xs transition-colors flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span>الطلبات الغير مسددة ({unpaidConfirmedOrders.length})</span>
            </button>

            <button
              onClick={handleShareGps}
              className="p-2.5 bg-stone-800 hover:bg-stone-700 text-amber-400 rounded-xl border border-stone-700 transition-colors"
              title="تحديث الموقع الجغرافي للمندوب"
            >
              <MapPin className="w-5 h-5" />
            </button>

            <button
              onClick={onLogout}
              className="p-2.5 bg-stone-800 hover:bg-red-950 text-stone-300 hover:text-red-400 rounded-xl border border-stone-700 transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Pending Family Subscription Renewal Requests */}
      {renewalRequests.filter((r) => r.status === 'pending_mandoub').length > 0 && (
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-3xl p-6 shadow-xl text-white space-y-4 border border-amber-400">
          <div className="flex items-center justify-between border-b border-white/20 pb-3">
            <div className="flex items-center gap-2">
              <Crown className="w-6 h-6 text-amber-200 animate-bounce" />
              <div>
                <h3 className="font-black text-lg">طلبات تجديد اشتراك العوائل</h3>
                <p className="text-xs text-amber-100 font-semibold">
                  يرجى تأكيد استلام المبلغ المالي لتجديد اشتراك العائلة فوراً
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-white text-amber-900 font-black text-xs rounded-full shadow-md">
              {renewalRequests.filter((r) => r.status === 'pending_mandoub').length} طلب معلق
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renewalRequests
              .filter((r) => r.status === 'pending_mandoub')
              .map((req) => (
                <div
                  key={req.id}
                  className="bg-white text-stone-900 rounded-2xl p-4 shadow-lg border border-amber-200 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                    <div>
                      <h4 className="font-black text-base text-amber-900">{req.familyName}</h4>
                      <p className="text-xs font-semibold text-stone-500" dir="ltr">
                        {req.familyPhone}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-900 font-mono font-black text-xs rounded-lg">
                      {req.id}
                    </span>
                  </div>

                  <div className="bg-amber-50/80 p-3 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-600 font-bold">الباقة المطلوبة:</span>
                      <span className="font-black text-amber-900">{req.packageName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-600 font-bold">المبلغ المطلوب استلامه:</span>
                      <span className="font-black text-emerald-700 font-mono text-sm">
                        {req.packagePriceIQD.toLocaleString()} د.ع
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleConfirmRenewal(req.id)}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>تأكيد استلام المبلغ وتجديد الاشتراك</span>
                    </button>

                    <button
                      onClick={() => {
                        setRejectingRenewalId(req.id);
                        setRejectionReasonInput('');
                      }}
                      className="px-3 py-2.5 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      <span>رفض</span>
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Main Feed Header & Search */}
      <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <span>طلبات الخبز الواردة لمنطقة ({mandoub.areaName})</span>
            </h3>
            <p className="text-xs font-semibold text-stone-500 mt-0.5">
              تظهر فقط طلبات العوائل ذات رمز الـ VLAN المماثل ({mandoub.vlanCode})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الطلب، اسم العائلة، أو رقم الهاتف..."
            className="w-full pr-10 pl-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
          <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        </div>

        {/* Available Orders Cards Grid */}
        {availableOrders.length === 0 ? (
          <div className="text-center py-12 text-stone-400 space-y-2">
            <CheckCircle className="w-12 h-12 text-stone-300 mx-auto" />
            <p className="font-bold text-sm text-stone-600">لا توجد طلبات جارية لهذه المنطقة حالياً</p>
            <p className="text-xs">سيتم إدراج الطلبات فور إرسال العوائل لها في هذه المنطقة</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableOrders.map((ord) => (
              <div
                key={ord.id}
                onClick={() => setSelectedOrder(ord)}
                className={`p-5 rounded-2xl border-2 text-right transition-all cursor-pointer space-y-3 relative overflow-hidden hover:shadow-md ${
                  ord.status === 'under_review'
                    ? 'bg-amber-50/70 border-amber-400'
                    : ord.status === 'processing_unpaid'
                    ? 'bg-orange-50/70 border-orange-300'
                    : ord.status === 'rejected_unpaid_returned'
                    ? 'bg-purple-50/70 border-purple-300'
                    : 'bg-stone-50/80 border-stone-200 hover:border-amber-500'
                }`}
              >
                {/* Top Card Bar */}
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-xs text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-lg border border-amber-200">
                    {ord.id}
                  </span>
                  <span className="text-xs font-semibold text-stone-500">
                    {ord.timeSlotText}
                  </span>
                </div>

                {/* Family Info */}
                <div>
                  <h4 className="font-black text-stone-900 text-base">{ord.familyName}</h4>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-bold">
                    <p className="text-stone-600 flex items-center gap-1" dir="ltr">
                      <Phone className="w-3.5 h-3.5 text-amber-600" />
                      <span>{ord.familyPhone}</span>
                    </p>
                    <p className="text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md text-[11px] font-extrabold flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3 text-amber-600" />
                      <span>{ord.bakeryName || 'مخبز الخبزة الرئيسي'}</span>
                    </p>
                  </div>
                </div>

                {/* Quantity Details */}
                <div className="p-2.5 bg-white rounded-xl border border-stone-200/80 flex items-center justify-between text-xs font-bold">
                  <span className="text-stone-700">الكمية المطلوبة:</span>
                  <span className="text-amber-800 text-sm">
                    {ord.quantity} {ord.unitText}
                  </span>
                </div>

                {/* Admin Note if Rejected Unpaid */}
                {ord.status === 'rejected_unpaid_returned' && ord.adminNote && (
                  <div className="p-2.5 bg-purple-100 text-purple-900 rounded-xl text-xs font-bold flex items-start gap-1.5 border border-purple-200">
                    <MessageSquare className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
                    <span>ملاحظة الأدمن: {ord.adminNote}</span>
                  </div>
                )}

                {/* Status Badges & Trigger Buttons */}
                <div className="pt-2 flex items-center justify-between">
                  <span className="text-xs font-extrabold text-amber-700 hover:underline">
                    انقر لعرض التفاصيل والموقع...
                  </span>

                  {ord.status === 'under_review' && (
                    <span className="px-2.5 py-1 bg-amber-500 text-white font-extrabold text-xs rounded-lg animate-pulse">
                      قيد المراجعة (بانتظار تأكيد العائلة)
                    </span>
                  )}

                  {ord.status === 'processing_unpaid' && (
                    <span className="px-2.5 py-1 bg-stone-700 text-white font-extrabold text-xs rounded-lg">
                      قيد المعالجة الإدارية
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Detailed Order View for Mandoub */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-stone-200 space-y-0">
            {/* Header */}
            <div className="p-5 bg-amber-600 text-white flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-amber-200">طلب الخبز رقم</span>
                <h3 className="font-mono font-black text-xl">{selectedOrder.id}</h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-amber-200 hover:text-white rounded-xl hover:bg-white/10"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-5 text-right">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                <div>
                  <label className="text-xs font-bold text-stone-500">اسم العائلة الثلاثي:</label>
                  <p className="text-lg font-black text-stone-900">{selectedOrder.familyName}</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-stone-200">
                  <div>
                    <label className="text-xs font-bold text-stone-500">رقم الهاتف:</label>
                    <p className="text-base font-bold text-stone-900 font-mono" dir="ltr">
                      {selectedOrder.familyPhone}
                    </p>
                  </div>
                  <a
                    href={`tel:${selectedOrder.familyPhone}`}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>اتصال تلفوني</span>
                  </a>
                </div>

                <div className="pt-2 border-t border-stone-200">
                  <label className="text-xs font-bold text-amber-800 flex items-center gap-1">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>اسم المخبز المزود للطلب:</span>
                  </label>
                  <p className="text-sm font-black text-stone-900 mt-0.5">
                    {selectedOrder.bakeryName || 'مخبز الخبزة الرئيسي'}
                  </p>
                </div>
              </div>

              {/* Order Quantities */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-xs font-bold text-amber-800">تفاصيل الكمية</span>
                  <p className="text-base font-black text-amber-950 mt-1">
                    {selectedOrder.quantity} {selectedOrder.unitText}
                  </p>
                </div>

                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                  <span className="text-xs font-bold text-stone-600">وقت الاستلام</span>
                  <p className="text-sm font-black text-stone-900 mt-1">
                    {selectedOrder.timeSlotText}
                  </p>
                </div>
              </div>

              {/* Admin note if returned */}
              {selectedOrder.adminNote && (
                <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 text-xs font-bold space-y-1">
                  <p className="text-purple-700 font-extrabold flex items-center gap-1">
                    <MessageSquare className="w-4 h-4" />
                    <span>ملاحظة الإدارة بخصوص الطلب:</span>
                  </p>
                  <p>{selectedOrder.adminNote}</p>
                </div>
              )}

              {/* Location Action Button */}
              <button
                onClick={() => setSelectedLocation(selectedOrder.location)}
                className="w-full py-3 bg-stone-100 hover:bg-stone-200 text-stone-900 font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 border border-stone-300"
              >
                <MapPin className="w-5 h-5 text-amber-600" />
                <span>إظهار الموقع الجغرافي الدقيق للزبون</span>
              </button>

              {/* Status Action Buttons */}
              <div className="pt-2 grid grid-cols-2 gap-3">
                {/* Completed Button */}
                <button
                  onClick={() => handleMarkCompleted(selectedOrder)}
                  disabled={selectedOrder.status === 'under_review' || selectedOrder.status === 'processing_unpaid' || selectedOrder.status === 'completed_confirmed'}
                  className={`py-3.5 font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
                    selectedOrder.status === 'completed_confirmed'
                      ? 'bg-emerald-600 text-white font-black'
                      : selectedOrder.status === 'under_review'
                      ? 'bg-amber-500 text-white font-black opacity-95'
                      : selectedOrder.status === 'processing_unpaid'
                      ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 active:scale-95'
                  }`}
                >
                  <CheckCircle className="w-5 h-5" />
                  <span>
                    {selectedOrder.status === 'completed_confirmed'
                      ? 'مكتمل (مؤكد)'
                      : selectedOrder.status === 'under_review'
                      ? 'قيد المراجعة'
                      : selectedOrder.status === 'processing_unpaid'
                      ? 'قيد المعالجة'
                      : 'مكتمل'}
                  </span>
                </button>

                {/* Unpaid Button */}
                <button
                  onClick={() => handleOpenUnpaidPrompt(selectedOrder)}
                  disabled={selectedOrder.status === 'processing_unpaid'}
                  className={`py-3.5 font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
                    selectedOrder.status === 'processing_unpaid'
                      ? 'bg-stone-700 text-white cursor-not-allowed opacity-90'
                      : 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/20 active:scale-95'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5" />
                  <span>
                    {selectedOrder.status === 'processing_unpaid' ? 'قيد المعالجة (غير مسدد)' : 'غير مسدد'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Mandoub Phone Number */}
      {showPhoneEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200">
            <div className="p-5 bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5" />
                <h3 className="font-extrabold text-base">تغيير رقم هاتف المندوب</h3>
              </div>
              <button
                onClick={() => setShowPhoneEditModal(false)}
                className="p-1 text-amber-100 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePhone} className="p-6 space-y-4 text-right">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-700">رقم الهاتف الجديد للمندوب:</label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  placeholder="07700000000"
                  value={mandoubPhoneInput}
                  onChange={(e) => setMandoubPhoneInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPhoneEditModal(false)}
                  className="px-4 py-2 bg-stone-100 text-stone-700 font-bold text-xs rounded-xl hover:bg-stone-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md"
                >
                  حفظ وتحديث سحابياً
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Input Unpaid Amount Prompt */}
      {unpaidTargetOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200">
            <div className="p-5 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                <h3 className="font-extrabold text-base">إدخال المبلغ الغير مسدد</h3>
              </div>
              <button
                onClick={() => setUnpaidTargetOrder(null)}
                className="p-1 text-red-100 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitUnpaidAmount} className="p-6 space-y-4 text-right">
              <div className="bg-red-50 p-3.5 rounded-2xl border border-red-200 text-xs font-bold text-red-900 space-y-1">
                <p>طلب رقم: <strong className="font-mono">{unpaidTargetOrder.id}</strong></p>
                <p>العائلة: <strong>{unpaidTargetOrder.familyName}</strong></p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-700">المبلغ الغير مسدد (د.ع):</label>
                <input
                  type="number"
                  required
                  min="250"
                  step="250"
                  placeholder="مثال: 3000"
                  value={unpaidAmountInput}
                  onChange={(e) => setUnpaidAmountInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 font-black text-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUnpaidTargetOrder(null)}
                  className="px-4 py-2 bg-stone-100 text-stone-700 font-bold text-xs rounded-xl hover:bg-stone-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl shadow-md"
                >
                  تأكيد وإرسال للإدارة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Unpaid Orders Window for Mandoub */}
      {showUnpaidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-stone-200">
            <div className="p-5 bg-red-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-red-200" />
                <h3 className="font-extrabold text-lg">الطلبات الغير مسددة المؤكدة من الإدارة</h3>
              </div>
              <button
                onClick={() => setShowUnpaidModal(false)}
                className="p-1.5 text-red-200 hover:text-white rounded-xl"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {unpaidConfirmedOrders.length === 0 ? (
                <p className="text-center py-8 text-stone-400 font-bold text-sm">
                  لا توجد طلبات غير مسددة مسجلة على حسابك حالياً.
                </p>
              ) : (
                <div className="space-y-3">
                  {unpaidConfirmedOrders.map((unp) => (
                    <div
                      key={unp.id}
                      className="p-4 bg-red-50/70 border border-red-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-sm text-right"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-red-900 bg-red-100 px-2 py-0.5 rounded text-xs">
                            {unp.id}
                          </span>
                          <span className="font-black text-stone-900">{unp.familyName}</span>
                        </div>
                        <p className="text-xs font-semibold text-stone-600" dir="ltr">
                          رقم الهاتف: {unp.familyPhone}
                        </p>
                      </div>

                      <div className="text-left space-y-1">
                        <span className="px-3 py-1 bg-red-600 text-white font-extrabold text-xs rounded-full inline-block">
                          غير مسدد (مسجل بالذمة)
                        </span>
                        <p className="text-xs font-bold text-stone-500">
                          الكمية: {unp.quantity} {unp.unitText}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-200 text-left">
              <button
                onClick={() => setShowUnpaidModal(false)}
                className="px-5 py-2 bg-stone-800 text-white font-bold text-xs rounded-xl hover:bg-stone-900"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Rejection Reason Modal */}
      {rejectingRenewalId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-red-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-black text-lg text-red-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span>سبب رفض تجديد الاشتراك</span>
              </h3>
              <button
                onClick={() => setRejectingRenewalId(null)}
                className="text-stone-400 hover:text-stone-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRejectRenewal} className="space-y-4">
              <div className="space-y-1 text-right">
                <label className="block text-xs font-bold text-stone-700">
                  يرجى كتابة سبب عدم تجديد الاشتراك لظهوره في شاشة الادمن:
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  placeholder="مثال: الزبون رفض تسليم المبلغ / لم يتم العثور على العائلة..."
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-medium text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-md transition-all"
                >
                  تأكيد رفض التجديد
                </button>
                <button
                  type="button"
                  onClick={() => setRejectingRenewalId(null)}
                  className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GPS Location Modal */}
      {selectedLocation && (
        <LocationPickerModal
          location={selectedLocation}
          driverLocation={
            mandoub.currentLocation
              ? { lat: mandoub.currentLocation.lat, lng: mandoub.currentLocation.lng }
              : null
          }
          onClose={() => setSelectedLocation(null)}
        />
      )}
    </div>
  );
};
