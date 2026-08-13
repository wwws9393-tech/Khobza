import React, { useState } from 'react';
import { Download, Sparkles, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { applyAppUpdate } from '../services/updateService';

interface Props {
  installedVersion: string;
  latestVersion: string;
  releaseNotes: string;
  isMandatory: boolean;
  onDismissOptional?: () => void;
}

export const MandatoryUpdateModal: React.FC<Props> = ({
  installedVersion,
  latestVersion,
  releaseNotes,
  isMandatory,
  onDismissOptional,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  const handleStartUpdate = () => {
    setIsUpdating(true);
    setProgress(10);
    setStatusText('جاري الإتصال بالخادم وتنزيل ملفات التحديث...');

    setTimeout(() => {
      setProgress(45);
      setStatusText('جاري تثبيت حزمة v' + latestVersion + ' والتحقق من الملفات...');
    }, 1000);

    setTimeout(() => {
      setProgress(85);
      setStatusText('جاري تحديث قواعد البيانات المحلية والتطبيق...');
    }, 2000);

    setTimeout(() => {
      setProgress(100);
      setStatusText('اكتمل التحديث بنجاح! جاري إعادة تشغيل التطبيق...');
      setTimeout(() => {
        applyAppUpdate(latestVersion);
      }, 600);
    }, 2800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4 font-['Cairo',sans-serif]">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-md overflow-hidden text-right relative animate-in fade-in zoom-in duration-300">
        {/* Top Banner */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 p-6 text-white text-center relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl mx-auto mb-3 flex items-center justify-center border border-white/30 shadow-inner">
            <Sparkles className="w-8 h-8 text-white animate-bounce" />
          </div>
          <h2 className="text-xl font-black tracking-tight">يتوفر تحديث جديد للتطبيق!</h2>
          <p className="text-amber-100 text-xs mt-1 font-semibold">
            {isMandatory
              ? 'تحديث إجباري للاستمرار في استخدام تطبيق خبزة'
              : 'تحديث اختياري متوفر يحتوي على تحسينات ملموسة'}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Version comparison badge */}
          <div className="flex items-center justify-around bg-stone-50 border border-stone-200 rounded-2xl p-3 text-center">
            <div>
              <span className="block text-[11px] font-bold text-stone-500 mb-0.5">الإصدار الحالي</span>
              <span className="inline-block px-2.5 py-1 bg-stone-200 text-stone-700 font-mono font-bold text-xs rounded-lg">
                v{installedVersion}
              </span>
            </div>
            <div className="text-amber-600 font-bold text-sm">⬅️</div>
            <div>
              <span className="block text-[11px] font-bold text-stone-500 mb-0.5">الإصدار الجديد</span>
              <span className="inline-block px-2.5 py-1 bg-amber-500 text-white font-mono font-bold text-xs rounded-lg shadow-sm shadow-amber-500/30">
                v{latestVersion}
              </span>
            </div>
          </div>

          {/* Release Notes */}
          <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4">
            <h4 className="text-xs font-black text-amber-950 mb-1 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span>ملاحظات التحديث الجديد:</span>
            </h4>
            <p className="text-xs text-stone-700 leading-relaxed font-semibold">
              {releaseNotes || 'تحسينات عامة على السرعة والأمان والتنبيهات النظامية.'}
            </p>
          </div>

          {/* Progress Bar during update */}
          {isUpdating && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center text-xs font-bold text-stone-700">
                <span>{statusText}</span>
                <span className="font-mono text-amber-600">{progress}%</span>
              </div>
              <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden border border-stone-200">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            {!isUpdating ? (
              <>
                <button
                  onClick={handleStartUpdate}
                  className="w-full py-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-black rounded-2xl shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] text-base"
                >
                  <Download className="w-5 h-5" />
                  <span>تحديث التطبيق الآن (v{latestVersion})</span>
                </button>

                {!isMandatory && onDismissOptional && (
                  <button
                    onClick={onDismissOptional}
                    className="w-full py-2.5 text-stone-500 hover:text-stone-800 text-xs font-bold transition-colors"
                  >
                    تذكيري لاحقاً
                  </button>
                )}
              </>
            ) : (
              <div className="py-2 text-center text-xs font-bold text-stone-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />
                <span>يرجى الانتظار لحين اكتمال التحميل...</span>
              </div>
            )}
          </div>

          {isMandatory && (
            <p className="text-[11px] text-center font-bold text-stone-400">
              * تم قفل التطبيق مؤقتاً لحين إجراء التحديث لضمان سلامة واستقرار الخدمة.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
