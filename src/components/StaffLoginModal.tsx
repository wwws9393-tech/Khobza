import React, { useState } from 'react';
import { loginStaff, normalizeDigits } from '../services/storage';
import { UserRole, Mandoub, AdminUser } from '../types';
import { Lock, User, KeyRound, X, ShieldCheck, RefreshCw, Eye, EyeOff, Info } from 'lucide-react';

interface Props {
  onClose: () => void;
  onLoginSuccess: (role: UserRole, userObj: Mandoub | AdminUser) => void;
}

export const StaffLoginModal: React.FC<Props> = ({ onClose, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      setError('يرجى إدخال اسم المستخدم أو رقم الهاتف وكلمة السر');
      return;
    }

    setIsAuthenticating(true);

    try {
      const result = await loginStaff(cleanUser, cleanPass);

      if (result.success && result.role && result.user) {
        onLoginSuccess(result.role, result.user);
        return;
      }

      setError(result.error || 'اسم المستخدم أو كلمة السر غير صحيحة');
    } catch (err) {
      setError('حدث خطأ أثناء الاتصال بالسيرفر. يرجى التحقق من الاتصال بالإنترنت والمحاولة مجدداً');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200">
        <div className="p-6 bg-gradient-to-r from-amber-600 to-stone-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-xs">
              <ShieldCheck className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg">تسجيل دخول الكادر</h3>
              <p className="text-xs text-amber-100">المندوبون والمشرفون والإدارة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-300 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleLogin} className="p-6 md:p-8 space-y-5 text-right">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5 pr-1">
              اسم المستخدم / رقم الهاتف / رمز VLAN
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم أو رقم هاتفك أو رمز VLAN"
                className="w-full pl-4 pr-11 py-3.5 bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-bold text-stone-900 text-sm placeholder-stone-400"
                autoComplete="username"
                dir="auto"
              />
              <User className="w-5 h-5 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
            <div className="flex items-center gap-1 mt-1 pr-1 text-[11px] text-stone-500 font-semibold">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>يمكن للمندوب الدخول باسم المستخدم أو رقم الهاتف المسجل</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5 pr-1">
              كلمة السر
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة السر"
                className="w-full pl-11 pr-11 py-3.5 bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-bold text-stone-900 text-sm placeholder-stone-400 font-mono"
                autoComplete="current-password"
              />
              <KeyRound className="w-5 h-5 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1.5 text-stone-400 hover:text-stone-700 absolute left-3 top-1/2 -translate-y-1/2 rounded-lg transition-colors"
                title={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 text-center leading-relaxed">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isAuthenticating}
            className="w-full py-4 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-400 text-white font-extrabold text-base rounded-xl shadow-md shadow-amber-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {isAuthenticating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin text-amber-100" />
                <span>جاري التحقق والمزامنة السحابية...</span>
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                <span>تسجيل الدخول</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
