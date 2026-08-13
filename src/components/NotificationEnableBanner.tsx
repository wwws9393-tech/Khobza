import React, { useState, useEffect } from 'react';
import { requestNotificationPermission, playNotificationChimeSound } from '../services/notifications';
import { Bell, Volume2, CheckCircle2 } from 'lucide-react';

interface Props {
  roleText?: string;
}

export const NotificationEnableBanner: React.FC<Props> = ({ roleText = 'المستخدم' }) => {
  const [permission, setPermission] = useState<NotificationPermission | 'unknown'>('unknown');
  const [tested, setTested] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const handleEnable = async () => {
    const res = await requestNotificationPermission();
    setPermission(res as NotificationPermission);
    playNotificationChimeSound();
    setTested(true);
    setTimeout(() => setTested(false), 3000);
  };

  const handleTestSound = () => {
    playNotificationChimeSound();
    setTested(true);
    setTimeout(() => setTested(false), 3000);
  };

  if (permission === 'granted') {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>تنبيهات الموبايل والصوت مفعّلة بنجاح لـ {roleText} 🔔</span>
        </div>
        <button
          onClick={handleTestSound}
          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-xl transition-all flex items-center gap-1 shadow-xs active:scale-95"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>{tested ? 'تم تشغيل الصوت 🎵' : 'تجربة التنبيه الصوتي'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-3 text-stone-950 shadow-md flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div className="p-2 bg-stone-950 text-amber-400 rounded-xl flex-shrink-0 animate-pulse">
          <Bell className="w-4 h-4" />
        </div>
        <div>
          <h4 className="font-black text-xs">تفعيل إشعارات الموبايل والصوت 🔔</h4>
          <p className="text-[11px] font-semibold text-stone-900 leading-tight">
            تنبيه فور الخروج من التطبيق عند وصول طلب خبز جديد أو تحديث حالته.
          </p>
        </div>
      </div>

      <button
        onClick={handleEnable}
        className="px-3.5 py-2 bg-stone-950 hover:bg-stone-900 text-amber-300 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 active:scale-95"
      >
        <Volume2 className="w-3.5 h-3.5" />
        <span>{tested ? 'تم التفعيل بـ صوت 🎵' : 'تفعيل الإشعارات الآن'}</span>
      </button>
    </div>
  );
};
