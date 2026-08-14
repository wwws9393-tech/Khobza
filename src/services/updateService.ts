import { AppVersionConfig } from '../types';
import { isSupabaseConfigured, saveVersionConfigToSupabase } from './supabase';
import { broadcastExternalPush } from './pushService';

export const CURRENT_INSTALLED_VERSION = '1.0.4';

const UPDATE_CONFIG_KEY = 'khobza_version_config_v1';
const INSTALLED_VERSION_KEY = 'khobza_installed_version_v1';

export interface StableRestorePointItem {
  id: string;
  version: string;
  title: string;
  releaseNotes: string;
  isMandatory: boolean;
  createdAt?: string;
  isOfficial?: boolean;
}

export const DEFAULT_STABLE_POINTS: StableRestorePointItem[] = [
  {
    id: 'v1.0.4.final',
    version: '1.0.4.final',
    title: 'v1.0.4.final - الإصدار النهائي المستقر والآمن (رسمي ⭐)',
    releaseNotes: 'الإصدار الرسمي النهائي المستقر وآمن v1.0.4.final - تم تحديث واستقرار نظام إدارة الخبزة وتصفيات الحسابات واللوحة الذكية',
    isMandatory: false,
    isOfficial: true,
  },
  {
    id: 'v1.0.4.screen',
    version: '1.0.4.screen',
    title: 'v1.0.4.screen - نقطة شاشات الخبزة المستقرة (رسمي ⭐)',
    releaseNotes: 'الإصدار الرسمي المستقر v1.0.4.screen - تم تحديث واستقرار نظام إدارة الخبزة وتصفيات الحسابات واللوحة الذكية',
    isMandatory: false,
    isOfficial: true,
  },
  {
    id: 'v1.0.4',
    version: '1.0.4',
    title: 'v1.0.4 - الإصدار الفائق مع التثبيت وإشعار الخبزة (رسمي ⭐)',
    releaseNotes: 'الإصدار v1.0.4 - التثبيت الفوري الفائق بدون أي خطوات على جميع الهواتف (Android & iOS)، وإشعار فوري بشعار الخبزة.',
    isMandatory: true,
    isOfficial: true,
  },
  {
    id: 'v1.0.3',
    version: '1.0.3',
    title: 'v1.0.3 - نقطة العودة المستقرة',
    releaseNotes: 'الاستعادة إلى نقطة العودة المستقرة v1.0.3 وتحديثات واجهة المستخدم',
    isMandatory: false,
    isOfficial: true,
  },
  {
    id: 'v1.0.2',
    version: '1.0.2',
    title: 'v1.0.2 - تحسينات إدارة السائقين والموقع',
    releaseNotes: 'تحديث نظام المندوبين والموقع وتصفيات الحسابات v1.0.2',
    isMandatory: false,
    isOfficial: false,
  },
  {
    id: 'v1.0.1',
    version: '1.0.1',
    title: 'v1.0.1 - النواة الأساسية للنظام',
    releaseNotes: 'الإصدار الأول والأساسي لخدمة توصيل الخبزة v1.0.1',
    isMandatory: false,
    isOfficial: false,
  },
];

const STABLE_POINTS_KEY = 'khobza_stable_points_v1';

export function getStableRestorePoints(): StableRestorePointItem[] {
  try {
    const raw = localStorage.getItem(STABLE_POINTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge defaults to ensure official ones are always available
        const map = new Map<string, StableRestorePointItem>();
        DEFAULT_STABLE_POINTS.forEach((p) => map.set(p.id, p));
        parsed.forEach((p: StableRestorePointItem) => map.set(p.id || p.version, p));
        return Array.from(map.values());
      }
    }
  } catch (err) {
    console.error('Failed to load stable points:', err);
  }
  return DEFAULT_STABLE_POINTS;
}

export function saveStableRestorePoint(point: StableRestorePointItem): void {
  try {
    const current = getStableRestorePoints();
    const existingIndex = current.findIndex((p) => p.id === point.id || p.version === point.version);
    if (existingIndex >= 0) {
      current[existingIndex] = { ...current[existingIndex], ...point };
    } else {
      current.unshift(point);
    }
    localStorage.setItem(STABLE_POINTS_KEY, JSON.stringify(current));
  } catch (err) {
    console.error('Failed to save stable point:', err);
  }
}

export const DEFAULT_VERSION_CONFIG: AppVersionConfig = {
  currentVersion: CURRENT_INSTALLED_VERSION,
  latestVersion: '1.0.4',
  isMandatory: true,
  releaseNotes: 'الإصدار v1.0.4 - التثبيت الفوري الفائق بدون أي خطوات على جميع الهواتف (Android & iOS)، نقطة استعادة وتراجع مستقرة v1.0.3، وإشعار فوري بشعار الخبزة.',
  releasedAt: new Date().toISOString(),
};

export function getAppVersionConfig(): AppVersionConfig {
  try {
    const raw = localStorage.getItem(UPDATE_CONFIG_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to read version config:', err);
  }
  return DEFAULT_VERSION_CONFIG;
}

export function saveAppVersionConfig(config: AppVersionConfig): void {
  try {
    localStorage.setItem(UPDATE_CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new Event('khobza_version_change'));

    // Persist to Supabase app_version_config table
    if (isSupabaseConfigured()) {
      saveVersionConfigToSupabase(config).catch(() => {});
    }

    // Broadcast external push notification for instant update awareness
    broadcastExternalPush({
      title: `🥖 تحديث جديد لتطبيق الخبزة (v${config.latestVersion})`,
      body: config.releaseNotes || 'تم إصدار تحديث جديد ومستقر لتطبيق الخبزة! يرجى فتح التطبيق لتطبيقه فورا.',
      targetRole: 'all',
    });
  } catch (err) {
    console.error('Failed to save version config:', err);
  }
}

export function getInstalledVersion(): string {
  try {
    return localStorage.getItem(INSTALLED_VERSION_KEY) || CURRENT_INSTALLED_VERSION;
  } catch {
    return CURRENT_INSTALLED_VERSION;
  }
}

export function setInstalledVersion(version: string): void {
  try {
    localStorage.setItem(INSTALLED_VERSION_KEY, version);
  } catch (err) {
    console.error('Failed to set installed version:', err);
  }
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  installedVersion: string;
  latestVersion: string;
  isMandatory: boolean;
  releaseNotes: string;
}

// Background async update check
export async function checkAppUpdateInBackground(): Promise<UpdateCheckResult> {
  // Simulate background network request latency (e.g. 800ms)
  await new Promise((resolve) => setTimeout(resolve, 800));

  const config = getAppVersionConfig();
  const installed = getInstalledVersion();

  // Compare version strings (e.g. "1.1.0" > "1.0.0")
  const hasUpdate = isVersionGreater(config.latestVersion, installed);

  return {
    hasUpdate,
    installedVersion: installed,
    latestVersion: config.latestVersion,
    isMandatory: config.isMandatory,
    releaseNotes: config.releaseNotes,
  };
}

// Helper to compare semver versions like "1.1.0" vs "1.0.0"
export function isVersionGreater(v1: string, v2: string): boolean {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return true;
    if (p1 < p2) return false;
  }
  return false;
}

// Perform update action
export function applyAppUpdate(newVersion: string): void {
  setInstalledVersion(newVersion);
  // Clear any temporary caches or refresh service workers if present
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.update();
      }
    });
  }
  // Hard reload
  window.location.reload();
}
