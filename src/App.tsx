import React, { useState, useEffect } from 'react';
import {
  AdminUser,
  Family,
  LocationData,
  Mandoub,
  UserRole,
} from './types';
import {
  clearSession,
  getAdminAccounts,
  getFamilies,
  getFamilyByPhone,
  getMandoubs,
  getMandoubById,
  getSavedSession,
  initializeAppData,
  saveSession,
  updateFamilyLocation,
} from './services/storage';
import { requestNotificationPermission } from './services/notifications';
import { checkAppUpdateInBackground, UpdateCheckResult } from './services/updateService';
import { initAnimatedFavicon } from './utils/animatedFavicon';

import { Navbar } from './components/Navbar';
import { CustomerVerificationView } from './components/CustomerVerificationView';
import { CustomerMainView } from './components/CustomerMainView';
import { MandoubView } from './components/MandoubView';
import { AdminView } from './components/AdminView';
import { StaffLoginModal } from './components/StaffLoginModal';
import { MandatoryUpdateModal } from './components/MandatoryUpdateModal';
import { AndroidInstallModal } from './components/AndroidInstallModal';
import { NotificationAlertModal } from './components/NotificationAlertModal';
import { SplashScreen } from './components/SplashScreen';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [role, setRole] = useState<UserRole>('guest');
  const [currentFamily, setCurrentFamily] = useState<Family | null>(null);
  const [currentMandoub, setCurrentMandoub] = useState<Mandoub | null>(null);
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);

  const [currentLocation, setCurrentLocation] = useState<LocationData>({
    lat: 33.3128,
    lng: 44.3615,
    addressText: 'الموقع الجغرافي المسجل',
  });

  const [showStaffModal, setShowStaffModal] = useState(false);

  // Background update check state
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckResult | null>(null);
  const [, setIsCheckingUpdate] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Android PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showAndroidInstallModal, setShowAndroidInstallModal] = useState(false);

  // Initialize seed data and restore session
  const restoreSession = () => {
    initializeAppData();
    const session = getSavedSession();

    if (session.role === 'customer' && session.phone) {
      const fam = getFamilyByPhone(session.phone);
      if (fam) {
        if (fam.isBlocked || (fam.subscriptionStatus === 'expired' && fam.daysRemaining <= 0)) {
          clearSession();
          setRole('guest');
          setCurrentFamily(null);
          return;
        }
        setRole('customer');
        setCurrentFamily(fam);
        setCurrentLocation(fam.location);
        return;
      } else {
        // Keep session active while cloud sync runs in background
        setRole('customer');
        setCurrentFamily({
          id: `fam-session-${session.phone}`,
          phone: session.phone,
          fullName: 'عائلة متصلة',
          vlanCode: '',
          areaName: 'المنطقة الرئيسية',
          activationDate: new Date().toISOString().split('T')[0],
          daysRemaining: 30,
          subscriptionStatus: 'active',
          isBlocked: false,
          location: currentLocation,
        });
        return;
      }
    }

    if (session.role === 'mandoub' && session.mandoubId) {
      const mand = getMandoubById(session.mandoubId);
      if (mand) {
        if (mand.status !== 'active') {
          clearSession();
          setRole('guest');
          setCurrentMandoub(null);
          return;
        }
        setRole('mandoub');
        setCurrentMandoub(mand);
        return;
      } else {
        // Keep mandoub session active while cloud sync completes
        setRole('mandoub');
        setCurrentMandoub({
          id: session.mandoubId,
          name: 'مندوب التوصيل',
          username: 'mandoub',
          password: '',
          vlanCode: '',
          areaName: 'المنطقة المخصصة',
          status: 'active',
        });
        return;
      }
    }

    if (session.role === 'admin' && session.adminId) {
      const admins = getAdminAccounts();
      const adm = admins.find((a) => a.id === session.adminId);
      if (adm) {
        setRole('admin');
        setCurrentAdmin(adm);
        return;
      } else if (admins.length > 0) {
        setRole('admin');
        setCurrentAdmin(admins[0]);
        return;
      }
    }

    // Default back to guest / verification view
    setRole('guest');
    setCurrentFamily(null);
    setCurrentMandoub(null);
    setCurrentAdmin(null);
  };

  useEffect(() => {
    requestNotificationPermission();
    restoreSession();

    // Start animated dynamic SVG app icon favicon
    const cleanupFavicon = initAnimatedFavicon();

    // Listen for Android/iOS PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
      setDeferredPrompt(e);

      // Auto-trigger native prompt if user came from iframe "Open in direct window" button
      const urlParams = new URLSearchParams(window.location.search);
      const shouldAuto = urlParams.get('autoInstall') === '1' || localStorage.getItem('khobza_auto_install') === 'true';
      if (shouldAuto) {
        localStorage.removeItem('khobza_auto_install');
        setTimeout(() => {
          try {
            (e as any).prompt();
          } catch (err) {
            console.warn('Auto install prompt failed:', err);
          }
        }, 600);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Perform background update check on app launch
    const runUpdateCheck = async () => {
      setIsCheckingUpdate(true);
      try {
        const result = await checkAppUpdateInBackground();
        setUpdateCheckResult(result);
        if (result.hasUpdate) {
          setShowUpdateModal(true);
        }
      } catch (err) {
        console.error('Update check failed:', err);
      } finally {
        setIsCheckingUpdate(false);
      }
    };

    runUpdateCheck();

    window.addEventListener('khobza_data_change', restoreSession);
    window.addEventListener('storage', restoreSession);
    window.addEventListener('khobza_version_change', runUpdateCheck);

    return () => {
      cleanupFavicon();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('khobza_data_change', restoreSession);
      window.removeEventListener('storage', restoreSession);
      window.removeEventListener('khobza_version_change', runUpdateCheck);
    };
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        setDeferredPrompt(null);
        setShowAndroidInstallModal(false);
      });
    } else {
      setShowAndroidInstallModal(true);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    clearSession();
    setRole('guest');
    setCurrentFamily(null);
    setCurrentMandoub(null);
    setCurrentAdmin(null);
  };

  // Handle Verification Success
  const handleCustomerVerified = (family: Family, location: LocationData) => {
    updateFamilyLocation(family.id, location);
    const updatedFamily = { ...family, location };
    setRole('customer');
    setCurrentFamily(updatedFamily);
    setCurrentLocation(location);
    saveSession({ role: 'customer', phone: family.phone });
  };

  // Handle Staff Login Success
  const handleStaffLoginSuccess = (loginRole: UserRole, userObj: Mandoub | AdminUser) => {
    setShowStaffModal(false);
    if (loginRole === 'mandoub') {
      const m = userObj as Mandoub;
      setRole('mandoub');
      setCurrentMandoub(m);
      saveSession({ role: 'mandoub', mandoubId: m.id });
    } else if (loginRole === 'admin') {
      const a = userObj as AdminUser;
      setRole('admin');
      setCurrentAdmin(a);
      saveSession({ role: 'admin', adminId: a.id });
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-['Cairo',sans-serif] flex flex-col justify-between">
      <div>
        <Navbar
          role={role}
          title={
            role === 'customer' && currentFamily
              ? `مرحباً ${currentFamily.fullName}`
              : role === 'mandoub' && currentMandoub
              ? `المندوب: ${currentMandoub.name}`
              : role === 'admin'
              ? 'لوحة الإدارة الرئيسية'
              : 'تسجيل دخول الزبون'
          }
          onSwitchRoleClick={() => setShowStaffModal(true)}
          onInstallAndroidClick={handleInstallClick}
        />

        <main className="pb-12">
          {role === 'guest' && (
            <CustomerVerificationView
              onVerified={handleCustomerVerified}
              onOpenStaffLogin={() => setShowStaffModal(true)}
            />
          )}

          {role === 'customer' && currentFamily && (
            <CustomerMainView
              family={currentFamily}
              location={currentLocation}
              onLogout={handleLogout}
            />
          )}

          {role === 'mandoub' && currentMandoub && (
            <MandoubView
              mandoub={currentMandoub}
              onLogout={handleLogout}
            />
          )}

          {role === 'admin' && currentAdmin && (
            <AdminView
              admin={currentAdmin}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Staff Login Modal */}
      {showStaffModal && (
        <StaffLoginModal
          onClose={() => setShowStaffModal(false)}
          onLoginSuccess={handleStaffLoginSuccess}
        />
      )}

      {/* Android App Installation Modal */}
      {showAndroidInstallModal && (
        <AndroidInstallModal
          deferredPrompt={deferredPrompt}
          onClose={() => setShowAndroidInstallModal(false)}
          onTriggerInstall={handleInstallClick}
        />
      )}

      {/* 3-Second Modern Animated Splash Screen */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Mandatory Update Modal */}
      {showUpdateModal && updateCheckResult?.hasUpdate && (
        <MandatoryUpdateModal
          installedVersion={updateCheckResult.installedVersion}
          latestVersion={updateCheckResult.latestVersion}
          releaseNotes={updateCheckResult.releaseNotes}
          isMandatory={updateCheckResult.isMandatory}
          onDismissOptional={() => setShowUpdateModal(false)}
        />
      )}

      {/* Active Notification Alert Modal */}
      <NotificationAlertModal />

      {/* App Footer */}
      <footer className="bg-white border-t border-stone-200 py-4 text-center text-xs font-semibold text-stone-500">
        <p>تطبيق <strong className="text-amber-600 font-bold">خبزة</strong> - جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
