import React, { useState } from 'react';
import { authenticateAdmin, authenticateMandoub, saveSession, syncWithServer } from '../services/storage';
import { UserRole, Mandoub, AdminUser } from '../types';
import { Lock, User, KeyRound, X, ShieldCheck, RefreshCw } from 'lucide-react';

interface Props {
  onClose: () => void;
  onLoginSuccess: (role: UserRole, userObj: Mandoub | AdminUser) => void;
}

export const StaffLoginModal: React.FC<Props> = ({ onClose, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setError('يرجى إدخال اسم المستخدم وكلمة السر');
      return;
    }

    setIsAuthenticating(true);

    try {
      // Sync with cloud database first to ensure newly added staff are loaded
      await syncWithServer();

      // First try Admin authentication
      const admin = authenticateAdmin(cleanUser, password);
      if (admin) {
        saveSession({ role: 'admin', adminId: admin.id });
        onLoginSuccess('admin', admin);
        setIsAuthenticating(false);
        return;
      }

      // Next try Mandoub authentication
      const mandoub = authenticateMandoub(cleanUser, password);
      if (mandoub) {
        if (mandoub.status === 'disabled' || mandoub.status === 'inactive') {
          setError('عذراً، تم تعطيل حساب المندوب هذا من قبل الإدارة. يرجى التواصل مع مسؤول النظام.');
          setIsAuthenticating(false);
          return;
        }
        saveSession({ role: 'mandoub', mandoubId: mandoub.id });
        onLoginSuccess('mandoub', mandoub);
        setIsAuthenticating(false);
        return;
      }

      setError('اسم المستخدم أو كلمة السر غير صحيحة');
    } catch (err) {
      setError('حدث خطأ أثناء الاتصال بالسيرفر. يرجى المحاولة لاحقاً');
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
              اسم المستخدم / الاسم
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                className="w-full pl-4 pr-11 py-3 bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-bold text-stone-900 text-sm placeholder-stone-400"
              />
              <User className="w-5 h-5 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5 pr-1">
              كلمة السر
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة السر"
                className="w-full pl-4 pr-11 py-3 bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-bold text-stone-900 text-sm placeholder-stone-400"
              />
              <KeyRound className="w-5 h-5 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isAuthenticating}
            className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-400 text-white font-extrabold text-base rounded-xl shadow-md shadow-amber-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {isAuthenticating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin text-amber-100" />
                <span>جاري التحقق والمزامنة...</span>
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
