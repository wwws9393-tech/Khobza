import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle2, Loader2, Volume2 } from 'lucide-react';
import { playNotificationChimeSound, requestNotificationPermission } from '../services/notifications';
import { registerFcmToken } from '../services/fcmService';
import { registerPushSubscription } from '../services/pushService';

interface Props {
  roleText?: string;
  role: 'family' | 'mandoub' | 'admin';
  userPhone?: string;
  vlanCode?: string;
}

export const NotificationEnableBanner: React.FC<Props> = ({
  roleText = 'المستخدم',
  role,
  userPhone,
  vlanCode,
}) => {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRegistered, setIsRegistered] = useState(
    () => Boolean(localStorage.getItem('khobza_push_subscription') || localStorage.getItem('khobza_fcm_token'))
  );
  const [error, setError] = useState('');

  const syncDevice = useCallback(async () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;

    setIsRegistering(true);
    setError('');
    try {
      const [webPush, fcmToken] = await Promise.all([
        registerPushSubscription(userPhone, role, vlanCode),
        registerFcmToken(userPhone, role, vlanCode),
      ]);
      const ok = Boolean(webPush || fcmToken);
      setIsRegistered(ok);
      if (!ok) setError('تعذر تسجيل هذا الجهاز. افتح التطبيق من الشاشة الرئيسية وحاول مرة أخرى.');
      return ok;
    } catch {
      setError('تعذر ربط الجهاز بخدمة الإشعارات. تحقق من الإنترنت وحاول مرة أخرى.');
      setIsRegistered(false);
      return false;
    } finally {
      setIsRegistering(false);
    }
  }, [role, userPhone, vlanCode]);

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
      if (Notification.permission === 'granted') void syncDevice();
    }
  }, [syncDevice]);

  const handleEnable = async () => {
    const result = await requestNotificationPermission();
    const currentPermission =
      typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    setPermission(currentPermission);

    if (result === 'granted' || currentPermission === 'granted') {
      const ok = await syncDevice();
      if (ok) playNotificationChimeSound(true);
    } else if (currentPermission === 'denied') {
      setError('الإشعارات محظورة من إعدادات المتصفح. اسمح بها ثم أعد المحاولة.');
    }
  };

  if (permission === 'unsupported') return null;

  if (permission === 'granted' && isRegistered) {
    return (
      <div className="mx-4 mt-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-emerald-800 font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>الإشعارات الحقيقية مفعّلة لـ {roleText} 🔔</span>
        </div>
        <button
          onClick={() => playNotificationChimeSound(true)}
          className="px-2.5 py-1 bg-emerald-600 text-white font-bold text-[11px] rounded-xl flex items-center gap-1"
        >
          <Volume2 className="w-3.5 h-3.5" />
          تجربة الصوت
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-3 text-stone-950 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-stone-950 text-amber-400 rounded-xl">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-black text-xs">تفعيل الإشعارات الحقيقية 🔔</h4>
            <p className="text-[11px] font-semibold leading-tight">
              يصلك التنبيه عند الطلب وتحديث التوصيل حتى لو كان التطبيق مغلقاً.
            </p>
          </div>
        </div>
        <button
          onClick={handleEnable}
          disabled={isRegistering}
          className="px-3.5 py-2 bg-stone-950 text-amber-300 font-black text-xs rounded-xl flex items-center gap-1.5 disabled:opacity-60"
        >
          {isRegistering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
          {isRegistering ? 'جاري ربط الجهاز...' : 'تفعيل الآن'}
        </button>
      </div>
      {error && <p className="mt-2 text-[11px] font-bold text-red-950">{error}</p>}
    </div>
  );
};
