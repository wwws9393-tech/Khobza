import React from 'react';
import { UserRole } from '../types';
import { Shield, Truck, User, Smartphone, Apple, Sparkles } from 'lucide-react';
import { AnimatedLogo } from './AnimatedLogo';

interface Props {
  role: UserRole;
  title?: string;
  onSwitchRoleClick?: () => void;
  onInstallAndroidClick?: () => void;
}

export const Navbar: React.FC<Props> = ({ role, title, onInstallAndroidClick }) => {
  return (
    <header className="bg-white/70 dark:bg-stone-900/70 backdrop-blur-md border-b border-stone-200/60 dark:border-stone-800/60 sticky top-0 z-40 transition-all safe-pt shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-12 flex items-center justify-between">
        {/* Right Section (Start in RTL): Animated Brand Logo & Context Title */}
        <div className="flex items-center gap-2.5 my-auto">
          <AnimatedLogo size="sm" showText={true} />
          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 text-[10px] font-black rounded-md border border-amber-300 dark:border-amber-700/60">
            v1.0.4
          </span>
          {title && (
            <span className="hidden sm:inline-flex items-center text-[10px] font-extrabold text-stone-600 dark:text-stone-300 bg-stone-100/80 dark:bg-stone-800/80 px-2 py-0.5 rounded-md border border-stone-200/80 dark:border-stone-700/80 my-auto">
              {title}
            </span>
          )}
        </div>

        {/* Left Section (End in RTL): Role Indicator & Modernized Mobile Apps Button */}
        <div className="flex items-center gap-2 my-auto">
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-100/80 dark:bg-stone-800/80 border border-stone-200/80 dark:border-stone-700/80 text-[10px] font-bold text-stone-700 dark:text-stone-300 my-auto">
            {role === 'customer' && (
              <>
                <User className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>الزبون</span>
              </>
            )}
            {role === 'mandoub' && (
              <>
                <Truck className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>المندوب</span>
              </>
            )}
            {role === 'admin' && (
              <>
                <Shield className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>الإدارة</span>
              </>
            )}
            {role === 'guest' && (
              <>
                <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>التحقق</span>
              </>
            )}
          </div>

          {/* Modernized Install App Pill Button */}
          {onInstallAndroidClick && (
            <button
              onClick={onInstallAndroidClick}
              className="group relative px-3 py-1.5 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-black text-xs rounded-xl shadow-md border border-amber-300 transition-all duration-300 flex items-center gap-1.5 active:scale-95 my-auto"
              title="تثبيت التطبيق على الهواتف (Android & iOS)"
            >
              <div className="flex items-center gap-1 text-stone-950">
                <Smartphone className="w-3.5 h-3.5" />
                <Apple className="w-3 h-3" />
              </div>
              <span className="tracking-tight">تثبيت التطبيق</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
