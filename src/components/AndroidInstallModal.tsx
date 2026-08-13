import React, { useState, useEffect } from 'react';
import { Smartphone, Download, CheckCircle2, X, Share2, PlusSquare, ShieldCheck, Sparkles, Apple, Copy, Check } from 'lucide-react';

interface Props {
  deferredPrompt: any;
  onClose: () => void;
  onTriggerInstall: () => void;
}

export const AndroidInstallModal: React.FC<Props> = ({
  deferredPrompt,
  onClose,
  onTriggerInstall,
}) => {
  const [activeOS, setActiveOS] = useState<'android' | 'ios'>('android');
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    // Auto-detect user device OS on modal load
    const isIOSDevice =
      typeof navigator !== 'undefined' &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
      !(window as any).MSStream;

    if (isIOSDevice) {
      setActiveOS('ios');
    } else {
      setActiveOS('android');
    }
  }, []);

  const handleCopyOrShareLink = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'تطبيق خبزة khobza',
          text: 'تطبيق الخبزة للعوائل والمندوبين',
          url: window.location.href,
        });
        return;
      } catch (e) {}
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch (e) {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-md p-4 font-['Cairo',sans-serif] text-right">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-lg overflow-hidden relative animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-stone-900 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute left-4 top-4 p-1.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-inner">
              {activeOS === 'ios' ? <Apple className="w-8 h-8 text-white" /> : <Smartphone className="w-8 h-8 text-white" />}
            </div>
            <div>
              <span className="px-2 py-0.5 bg-amber-400/30 text-amber-100 text-[10px] font-bold rounded-full border border-amber-300/30">
                تطبيق للهواتف الذكية (PWA Native App)
              </span>
              <h2 className="text-xl font-black mt-0.5">تثبيت تطبيق خبزة على الموبايل</h2>
            </div>
          </div>
          <p className="text-xs text-amber-100 font-semibold leading-relaxed">
            احصل على تجربة التطبيق الأصلي على جهازك (بدون شريط متصفح، سرعة فائقة، وإشعار الموبايل).
          </p>

          {/* Tab Selector */}
          <div className="flex items-center gap-2 mt-4 p-1 bg-black/20 backdrop-blur-md rounded-xl border border-white/10">
            <button
              onClick={() => setActiveOS('android')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                activeOS === 'android'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-stone-300 hover:text-white'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>تطبيق أندرويد (Android)</span>
            </button>

            <button
              onClick={() => setActiveOS('ios')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                activeOS === 'ios'
                  ? 'bg-stone-900 text-white shadow-md border border-stone-700'
                  : 'text-stone-300 hover:text-white'
              }`}
            >
              <Apple className="w-4 h-4 text-stone-200" />
              <span>تطبيق آيفون (iOS / iPhone)</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* TAB 1: ANDROID */}
          {activeOS === 'android' && (
            <>
              {deferredPrompt ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl mx-auto flex items-center justify-center shadow-md">
                    <Download className="w-6 h-6 animate-bounce" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-emerald-950">جهازك يدعم التثبيت الفوري بنقرة واحدة!</h3>
                    <p className="text-xs text-stone-600 font-semibold mt-1">
                      انقر على الزر الأخضر أدناه لإضافة تطبيق خبزة فوراً إلى قائمة التطبيقات وشاشة هاتف أندرويد.
                    </p>
                  </div>
                  <button
                    onClick={onTriggerInstall}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all active:scale-98"
                  >
                    <Download className="w-5 h-5" />
                    <span>تثبيت تطبيق أندرويد بنقرة واحدة الآن</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-stone-800 flex items-center gap-1.5 border-b border-stone-100 pb-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>خطوات تثبيت التطبيق على هاتف أندرويد (Android):</span>
                  </h3>

                  <div className="space-y-2.5 text-xs font-bold text-stone-700">
                    <div className="flex items-start gap-3 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                      <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0 font-mono">1</div>
                      <div>
                        <span className="block text-stone-900 font-black">افتح خيارات المتصفح (Chrome)</span>
                        <span className="text-stone-500 text-[11px]">اضغط على نقاط القائمة الثلاث <strong>(⋮)</strong> في أعلى المتصفح.</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                      <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                        <PlusSquare className="w-4 h-4 text-emerald-700" />
                      </div>
                      <div>
                        <span className="block text-stone-900 font-black">اختر "تثبيت التطبيق" أو "الإضافة للشاشة الرئيسية"</span>
                        <span className="text-stone-500 text-[11px]">انقر على خيار <strong>Install App</strong> أو <strong>Add to Home Screen</strong>.</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                      <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      </div>
                      <div>
                        <span className="block text-stone-900 font-black">استمتع بتطبيق أندرويد كامل!</span>
                        <span className="text-stone-500 text-[11px]">سيظهر رمز "خبزة" بين تطبيقات الهاتف الأصلية كـ Native App مع كافة الميزات.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: iOS / IPHONE */}
          {activeOS === 'ios' && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="text-xs font-black text-amber-950 block">مشاركة ورابط التثبيت المباشر:</span>
                  <span className="text-[11px] text-amber-800 font-semibold block">انقر لمشاركة التطبيق أو نسخه وفتحه في Safari</span>
                </div>
                <button
                  onClick={handleCopyOrShareLink}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 shrink-0"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-200" /> : <Share2 className="w-4 h-4" />}
                  <span>{copiedLink ? 'تم النسخ!' : 'مشاركة / نسخ'}</span>
                </button>
              </div>

              <h3 className="text-xs font-black text-stone-800 flex items-center gap-1.5 border-b border-stone-100 pb-2">
                <Apple className="w-4 h-4 text-stone-900" />
                <span>طريقة إضافة التطبيق على أجهزة الآيفون (iPhone):</span>
              </h3>

              <div className="space-y-2.5 text-xs font-bold text-stone-700">
                <div className="flex items-start gap-3 bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                  <div className="p-2.5 bg-stone-900 text-white rounded-xl shrink-0">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-stone-900 font-black">1. افتح الرابط في Safari واضغط زر "مشاركة"</span>
                    <span className="text-stone-500 text-[11px]">اضغط على أيقونة المشاركة <strong>(Share Icon)</strong> بالأسفل في Safari.</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                  <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0">
                    <PlusSquare className="w-4 h-4 text-amber-700" />
                  </div>
                  <div>
                    <span className="block text-stone-900 font-black">2. اختر "الإضافة إلى الشاشة الرئيسية"</span>
                    <span className="text-stone-500 text-[11px]">من القائمة المنسدلة اضغط على <strong>Add to Home Screen</strong>.</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                  <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div>
                    <span className="block text-stone-900 font-black">3. اضغط "إضافة" (Add) في الزاوية</span>
                    <span className="text-stone-500 text-[11px]">سيثبت تطبيق "خبزة" فوراً على شاشة الآيفون كـ App بدون شريط متصفح!</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Features badge list */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-stone-600 pt-2 border-t border-stone-100">
            <div className="flex items-center gap-1.5 p-2 bg-amber-50/60 rounded-xl border border-amber-200/60">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <span>تحديثات تلقائية وحفظ بيانات</span>
            </div>
            <div className="flex items-center gap-1.5 p-2 bg-amber-50/60 rounded-xl border border-amber-200/60">
              <Share2 className="w-4 h-4 text-amber-600 shrink-0" />
              <span>عرض ملء الشاشة بدون أشرطة</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-colors"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
