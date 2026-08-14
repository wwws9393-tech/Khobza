import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ShoppingBag, ShieldCheck, Wheat, ArrowLeft } from 'lucide-react';

interface Props {
  onComplete: () => void;
}

export const SplashScreen: React.FC<Props> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const hasFinishedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const finishSplash = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    setIsExiting(true);
    setTimeout(() => {
      onCompleteRef.current();
    }, 250);
  };

  useEffect(() => {
    // 1.8 seconds timer (1800ms) with smooth progress increments
    const startTime = Date.now();
    const duration = 1800;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const currentProgress = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(currentProgress);

      if (elapsed >= duration) {
        clearInterval(interval);
        finishSplash();
      }
    }, 25);

    // Hard fallback safety: force finish after 2.2 seconds maximum
    const safetyTimeout = setTimeout(() => {
      clearInterval(interval);
      finishSplash();
    }, 2200);

    return () => {
      clearInterval(interval);
      clearTimeout(safetyTimeout);
    };
  }, []);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-stone-950 text-white p-6 overflow-hidden select-none"
        >
          {/* Animated Background Gradients & Glow Circles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute top-1/2 -left-20 w-80 h-80 bg-orange-600/15 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-amber-600/15 rounded-full blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(217,119,6,0.12)_0%,transparent_70%)]" />
          </div>

          {/* Top Brand Tag & Skip Button */}
          <div className="w-full flex items-center justify-between pt-3 z-20">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold backdrop-blur-md">
              <Wheat className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              <span>نظام توصيل الخبز والاشتراكات المباشر</span>
            </div>

            <button
              type="button"
              onClick={finishSplash}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-stone-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1 backdrop-blur-md"
            >
              <span>تخطي</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Center Main Badge & Emblem */}
          <div className="flex flex-col items-center justify-center text-center z-10 my-auto space-y-6">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, type: 'spring', bounce: 0.3 }}
              className="relative"
            >
              {/* Outer Pulsing Ring */}
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 opacity-40 blur-lg animate-pulse" />

              {/* Main Glowing 3D Emblem Container */}
              <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-3xl bg-gradient-to-br from-amber-500 via-amber-600 to-orange-700 p-0.5 shadow-2xl shadow-amber-600/40 flex items-center justify-center">
                <div className="w-full h-full bg-stone-900 rounded-[22px] flex items-center justify-center p-4 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent" />
                  <img
                    src="/apple-touch-icon.png"
                    alt="خبزة"
                    className="w-20 h-20 md:w-24 md:h-24 object-contain drop-shadow-[0_10px_15px_rgba(217,119,6,0.5)] transform hover:scale-105 transition-transform"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <ShoppingBag className="w-14 h-14 text-amber-400 absolute opacity-0 fallback-icon" />
                </div>
              </div>
            </motion.div>

            {/* Title & App Name */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="space-y-2"
            >
              <h1 className="text-4xl md:text-5xl font-black text-white tracking-wide font-['Cairo'] flex items-center justify-center gap-2">
                <span>تطبيق</span>
                <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent drop-shadow-sm">
                  خبزة
                </span>
              </h1>
              <p className="text-stone-400 text-xs md:text-sm font-semibold max-w-xs mx-auto leading-relaxed">
                التطبيق الذكي الأول لتوصيل الخبز اليومي وإدارة اشتراكات العوائل
              </p>
            </motion.div>
          </div>

          {/* Bottom Progress Bar & Loading Indicator */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-xs space-y-3 z-10 pb-6 text-center"
          >
            {/* Progress Percentage Display */}
            <div className="flex items-center justify-between text-xs font-mono font-bold text-stone-400">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Sparkles className="w-3.5 h-3.5 animate-bounce" />
                <span>جاري التشغيل...</span>
              </span>
              <span className="text-amber-300 font-extrabold">{progress}%</span>
            </div>

            {/* Bar Container */}
            <div
              onClick={finishSplash}
              className="w-full h-2.5 bg-stone-900 border border-stone-800 rounded-full p-0.5 overflow-hidden shadow-inner cursor-pointer"
              title="اضغط للدخول فوراً"
            >
              <div
                className="h-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-300 rounded-full transition-all duration-75 ease-out shadow-[0_0_12px_rgba(245,158,11,0.8)]"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Footer Trust Indicator */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-500 font-semibold pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500/80" />
              <span>إصدار مستقر v1.0.4 - جميع الحقوق محفوظة</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
