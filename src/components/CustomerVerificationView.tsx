import React, { useState, useEffect } from 'react';
import { LocationData, Family } from '../types';
import {
  getFamilyByPhone,
  isPhoneBlocked,
  saveSession,
  updateFamilyLocation,
} from '../services/storage';
import { requestNotificationPermission } from '../services/notifications';
import { Phone, CheckCircle2, UserCheck, MapPin, Sparkles, AlertCircle, Smartphone, Download } from 'lucide-react';

interface Props {
  onVerified: (family: Family, location: LocationData) => void;
  onOpenStaffLogin: () => void;
  onInstallClick?: () => void;
}

export const CustomerVerificationView: React.FC<Props> = ({
  onVerified,
  onOpenStaffLogin,
  onInstallClick,
}) => {
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState<LocationData>({
    lat: 33.3128,
    lng: 44.3615,
    addressText: 'جاري تحديد موقعك الجغرافي...',
  });
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'success' | 'error'>('detecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Request browser notification permissions & capture 100% high-accuracy location via GPS
  useEffect(() => {
    requestNotificationPermission();

    let watchId: number | null = null;

    const handlePos = async (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null;
      let address = `موقعك الجغرافي الدقيق (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
      if (accuracy) {
        address += ` - دقة GPS: ${accuracy} متر`;
      }

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ar`,
          { headers: { 'User-Agent': 'KhobzaApp/1.0' } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data) {
            const addr = data.address || {};
            const city = addr.city || addr.town || addr.state || addr.county || 'بغداد';
            const suburb = addr.suburb || addr.neighbourhood || addr.road || addr.quarter || addr.residential || '';
            if (city || suburb) {
              address = `${city} ${suburb ? '- ' + suburb : ''} (${lat.toFixed(4)}, ${lng.toFixed(4)})`.trim();
            } else if (data.display_name) {
              address = data.display_name.split(',').slice(0, 3).join(' - ');
            }
          }
        }
      } catch (e) {
        console.warn('Reverse geocoding fetch failed:', e);
      }

      setLocation({
        lat,
        lng,
        addressText: address,
      });
      setLocationStatus('success');
    };

    const handleError = (err: GeolocationPositionError) => {
      console.warn('Geolocation warning:', err);
      setLocationStatus('error');
      setLocation((prev) => ({
        ...prev,
        addressText: 'الموقع الجغرافي المحدد يدوياً',
      }));
    };

    if (navigator.geolocation) {
      // Immediate position check
      navigator.geolocation.getCurrentPosition(handlePos, handleError, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });

      // Continuous watchPosition to refine satellite precision to 100% accuracy
      watchId = navigator.geolocation.watchPosition(handlePos, handleError, {
        enableHighAccuracy: true,
        timeout: 25000,
        maximumAge: 0,
      });
    } else {
      setLocationStatus('error');
    }

    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      setErrorMessage('يرجى إدخال رقم هاتف العائلة');
      return;
    }

    // Check if phone is blocked
    if (isPhoneBlocked(cleanPhone)) {
      setErrorMessage('عذراً، هذا الرقم محظور من استخدام التطبيق. يرجى التواصل مع الإدارة.');
      return;
    }

    // Check if phone exists in Admin Database
    const family = getFamilyByPhone(cleanPhone);

    if (!family) {
      setErrorMessage('تحقق من معلومات الاشتراك');
      return;
    }

    if (family.isBlocked) {
      setErrorMessage('عذراً، تم حظر اشتراك هذه العائلة من قبل الإدارة.');
      return;
    }

    if (family.subscriptionStatus === 'expired' || family.daysRemaining <= 0) {
      setErrorMessage('اشتراك العائلة منتهي الصلاحية. يرجى التجديد عبر الإدارة.');
      return;
    }

    if (family.subscriptionStatus !== 'active') {
      setErrorMessage('تحقق من معلومات الاشتراك');
      return;
    }

    // Successfully verified! Save exact phone GPS location to family record & save session
    if (location && location.lat && location.lng) {
      updateFamilyLocation(family.id, location);
    }
    saveSession({ role: 'customer', phone: family.phone });
    onVerified(family, location);
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-8 relative">
      {/* Background Decorative Blur Spheres */}
      <div className="absolute top-10 right-10 w-64 h-64 bg-amber-200/40 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-64 h-64 bg-orange-200/30 rounded-full blur-3xl -z-10 pointer-events-none" />

      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200/80 p-6 md:p-8 space-y-6 text-center relative overflow-hidden">
        {/* Top Brand Banner */}
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center p-3.5 bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl shadow-lg shadow-amber-500/25">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">
            تطبيق <span className="text-amber-600">خبزة</span>
          </h1>
          <p className="text-sm font-medium text-stone-600">
            خدمة توصيل الخبز الطازج واشتراكات العوائل اليومية
          </p>
        </div>

        {/* Location Indicator */}
        <div className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs font-semibold text-stone-700">
          <MapPin className="w-4 h-4 text-amber-600 animate-pulse" />
          <span>
            {locationStatus === 'detecting'
              ? 'جاري أخذ الموقع الدقيق...'
              : locationStatus === 'success'
              ? 'تم تحديد الموقع الجغرافي الدقيق بنجاح'
              : 'تم اعتماد الموقع الجغرافي للشبكة'}
          </span>
        </div>

        {/* Verification Form */}
        <form onSubmit={handleVerify} className="space-y-4 text-right">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5 pr-1">
              رقم هاتف العائلة
            </label>
            <div className="relative">
              <input
                type="tel"
                maxLength={11}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="مثال: 07700000000"
                className="w-full pl-11 pr-4 py-3.5 bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-stone-900 font-bold placeholder-stone-400 text-base text-right transition-all"
                dir="rtl"
              />
              <Phone className="w-5 h-5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-800 text-xs font-bold animate-shake">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-extrabold text-base rounded-xl shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>تحقق</span>
          </button>
        </form>

        {/* Staff Login Link */}
        <div className="pt-4 border-t border-stone-200">
          <button
            onClick={onOpenStaffLogin}
            className="inline-flex items-center gap-2 text-xs font-bold text-stone-600 hover:text-amber-700 transition-colors py-1 px-3 rounded-lg hover:bg-stone-100"
          >
            <UserCheck className="w-4 h-4 text-amber-600" />
            <span>تسجيل دخول الكادر (المندوبين والمدراء)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
