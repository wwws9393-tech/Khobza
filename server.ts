import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const DATA_FILE = path.join(process.cwd(), 'data_store.json');

// Database Interface
interface DatabaseSchema {
  admins: any[];
  mandoubs: any[];
  families: any[];
  blockedPhones: string[];
  orders: any[];
  renewals: any[];
  versionConfig: any;
  pushSubscriptions?: any[];
  fcmTokens?: any[];
  vapidKeys?: { publicKey: string; privateKey: string };
  updatedAt: string;
}

// Default initial data seed
const defaultDb: DatabaseSchema = {
  admins: [
    {
      id: 'admin-1',
      username: 'admin123',
      password: 'admin123',
      fullName: 'المدير العام (الأدمن الرئيس)',
    },
  ],
  mandoubs: [],
  families: [],
  blockedPhones: [],
  orders: [],
  renewals: [],
  pushSubscriptions: [],
  fcmTokens: [],
  versionConfig: {
    currentVersion: '1.0.1',
    latestVersion: '1.0.1',
    isMandatory: false,
    releaseNotes: 'تحديث الجودة المباشر وحفظ البيانات السحابية المركزية',
    releasedAt: new Date().toISOString(),
  },
  updatedAt: new Date().toISOString(),
};

// Helper to merge arrays by id with status weights, timestamp, and metadata preservation
function mergeById<T extends { id: string }>(current: T[], incoming: T[], entityType: string = 'general'): T[] {
  if (!Array.isArray(incoming)) return current || [];
  if (!Array.isArray(current)) return incoming || [];
  const map = new Map<string, T>();
  for (const item of current) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of incoming) {
    if (item && item.id) {
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
      } else {
        if (entityType === 'orders') {
          const getStatusWeight = (st: string) => {
            if (st === 'completed_confirmed' || st === 'unpaid_confirmed') return 5;
            if (st === 'processing_unpaid') return 4;
            if (st === 'under_review') return 3;
            if (st === 'pending') return 1;
            return 0;
          };
          const existingWeight = getStatusWeight((existing as any).status || '');
          const itemWeight = getStatusWeight((item as any).status || '');

          let merged: any;
          if (itemWeight > existingWeight) {
            merged = { ...existing, ...item };
          } else if (existingWeight > itemWeight) {
            merged = { ...item, ...existing };
          } else {
            const existingTime = (existing as any).updatedAt || (existing as any).createdAt || '';
            const itemTime = (item as any).updatedAt || (item as any).createdAt || '';
            merged = itemTime >= existingTime ? { ...existing, ...item } : { ...item, ...existing };
          }

          // Preserve critical assigned mandoub fields if set
          if ((existing as any).mandoubId && !(merged as any).mandoubId) {
            merged.mandoubId = (existing as any).mandoubId;
          }
          if ((existing as any).mandoubName && !(merged as any).mandoubName) {
            merged.mandoubName = (existing as any).mandoubName;
          }
          if ((existing as any).mandoubPhone && !(merged as any).mandoubPhone) {
            merged.mandoubPhone = (existing as any).mandoubPhone;
          }
          if ((existing as any).mandoubCompletedAt && !(merged as any).mandoubCompletedAt) {
            merged.mandoubCompletedAt = (existing as any).mandoubCompletedAt;
          }
          if ((existing as any).customerConfirmedAt && !(merged as any).customerConfirmedAt) {
            merged.customerConfirmedAt = (existing as any).customerConfirmedAt;
          }
          map.set(item.id, merged);
        } else if (entityType === 'renewals') {
          const getRenewalWeight = (st: string) => {
            if (st === 'confirmed' || st === 'rejected_mandoub' || st === 'rejected_admin') return 5;
            if (st === 'pending_mandoub') return 1;
            return 0;
          };
          const existingWeight = getRenewalWeight((existing as any).status || '');
          const itemWeight = getRenewalWeight((item as any).status || '');

          let merged: any;
          if (itemWeight > existingWeight) {
            merged = { ...existing, ...item };
          } else if (existingWeight > itemWeight) {
            merged = { ...item, ...existing };
          } else {
            merged = { ...existing, ...item };
          }
          map.set(item.id, merged);
        } else {
          map.set(item.id, { ...existing, ...item });
        }
      }
    }
  }
  return Array.from(map.values());
}

function normalizeServerDigits(str: any): string {
  if (!str) return '';
  return String(str)
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .trim();
}

function isServerVlanMatch(vlanA: any, vlanB: any): boolean {
  if (!vlanA || !vlanB) return false;
  const rawA = normalizeServerDigits(vlanA).toLowerCase();
  const rawB = normalizeServerDigits(vlanB).toLowerCase();
  if (rawA === rawB) return true;

  const cleanA = rawA.replace(/[\s\-_/\\,.]+/g, '');
  const cleanB = rawB.replace(/[\s\-_/\\,.]+/g, '');
  if (cleanA === cleanB) return true;

  const digitsA = rawA.replace(/\D/g, '');
  const digitsB = rawB.replace(/\D/g, '');
  if (digitsA && digitsB) {
    if (digitsA === digitsB) return true;
    if (cleanA.endsWith(digitsB) || cleanB.endsWith(digitsA)) return true;
  }

  const simplify = (s: string) =>
    s
      .replace(/^vlan/i, '')
      .replace(/^منطقة\s*/i, '')
      .replace(/^حي\s*/i, '')
      .replace(/^مكتب\s*/i, '')
      .replace(/[\s\-_/\\,.]+/g, '')
      .trim();

  const simpA = simplify(rawA);
  const simpB = simplify(rawB);
  if (simpA && simpB && simpA === simpB) return true;

  if (simpA.length >= 3 && simpB.length >= 3) {
    if (simpA.includes(simpB) || simpB.includes(simpA)) return true;
  }
  if (cleanA.length >= 3 && cleanB.length >= 3) {
    if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
  }

  return false;
}

function isServerOrderMatchedToMandoub(order: any, mandoub: any, allMandoubs: any[]): boolean {
  if (!mandoub) return false;
  if (order.mandoubId && order.mandoubId === mandoub.id) return true;
  if (order.mandoubName && mandoub.name && order.mandoubName.trim() === mandoub.name.trim()) return true;

  const activeMandoubs = (allMandoubs || []).filter((m: any) => !m.status || m.status === 'active');
  if (activeMandoubs.length <= 1) return true;

  if (isServerVlanMatch(order.vlanCode, mandoub.vlanCode)) return true;
  if (isServerVlanMatch(order.areaName, mandoub.areaName)) return true;
  if (isServerVlanMatch(order.vlanCode, mandoub.areaName)) return true;
  if (isServerVlanMatch(order.areaName, mandoub.vlanCode)) return true;

  // If order is unassigned, allow all active mandoubs in default zones
  if (!order.mandoubId && (!order.vlanCode || !mandoub.vlanCode || order.vlanCode === 'vlan1')) {
    return true;
  }

  return false;
}

// Helper to read database
function readDb(): DatabaseSchema {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        admins: parsed.admins || defaultDb.admins,
        mandoubs: parsed.mandoubs || defaultDb.mandoubs,
        families: parsed.families || defaultDb.families,
        blockedPhones: parsed.blockedPhones || defaultDb.blockedPhones,
        orders: parsed.orders || defaultDb.orders,
        renewals: parsed.renewals || defaultDb.renewals,
        pushSubscriptions: parsed.pushSubscriptions || [],
        fcmTokens: parsed.fcmTokens || [],
        vapidKeys: parsed.vapidKeys,
        versionConfig: parsed.versionConfig || defaultDb.versionConfig,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error('Error reading data_store.json:', err);
  }
  return defaultDb;
}

// Helper to write database with smart merging
function writeDb(data: any) {
  try {
    const current = readDb();

    let updatedFamilies = current.families;
    let updatedMandoubs = current.mandoubs;
    let updatedOrders = current.orders;
    let updatedAdmins = current.admins;
    let updatedBlockedPhones = current.blockedPhones;
    let updatedRenewals = current.renewals;
    let updatedPushSubscriptions = current.pushSubscriptions || [];
    let updatedFcmTokens = current.fcmTokens || [];

    if (data.action === 'admin_reset') {
      // Full administrative wipe of all non-admin data
      updatedFamilies = [];
      updatedMandoubs = [];
      updatedOrders = [];
      updatedRenewals = [];
      updatedBlockedPhones = [];
    } else if (data.action === 'admin_restore') {
      // Explicit restore from admin backup
      if (Array.isArray(data.families)) updatedFamilies = data.families;
      if (Array.isArray(data.mandoubs)) updatedMandoubs = data.mandoubs;
      if (Array.isArray(data.orders)) updatedOrders = data.orders;
      if (Array.isArray(data.admins) && data.admins.length > 0) updatedAdmins = data.admins;
      if (Array.isArray(data.blockedPhones)) updatedBlockedPhones = data.blockedPhones;
      if (Array.isArray(data.renewals)) updatedRenewals = data.renewals;
    } else if (data.action === 'overwrite') {
      // Explicit overwrite from client: update families/mandoubs/blockedPhones but ALWAYS merge orders & renewals safely
      if (Array.isArray(data.families)) updatedFamilies = data.families;
      if (Array.isArray(data.mandoubs)) updatedMandoubs = data.mandoubs;
      if (Array.isArray(data.orders)) {
        updatedOrders = mergeById(current.orders, data.orders, 'orders');
      }
      if (Array.isArray(data.admins) && data.admins.length > 0) updatedAdmins = data.admins;
      if (Array.isArray(data.blockedPhones)) updatedBlockedPhones = data.blockedPhones;
      if (Array.isArray(data.renewals)) {
        updatedRenewals = mergeById(current.renewals, data.renewals, 'renewals');
      }
    } else {
      // For general client sync: ONLY merge orders and renewals.
      // NEVER resurrect deleted families or mandoubs from client local cache!
      if (Array.isArray(data.orders)) {
        updatedOrders = mergeById(current.orders, data.orders, 'orders');
      }
      if (Array.isArray(data.renewals)) {
        updatedRenewals = mergeById(current.renewals, data.renewals, 'renewals');
      }
    }

    if (Array.isArray(data.pushSubscriptions)) {
      const subMap = new Map<string, any>();
      for (const s of updatedPushSubscriptions) {
        if (s && (s.endpoint || s.id)) subMap.set(s.endpoint || s.id, s);
      }
      for (const s of data.pushSubscriptions) {
        if (s && (s.endpoint || s.id)) subMap.set(s.endpoint || s.id, { ...(subMap.get(s.endpoint || s.id) || {}), ...s });
      }
      updatedPushSubscriptions = Array.from(subMap.values());
    }
    if (Array.isArray(data.fcmTokens)) {
      const tokenMap = new Map<string, any>();
      for (const t of updatedFcmTokens) {
        if (t && (t.token || t.id)) tokenMap.set(t.token || t.id, t);
      }
      for (const t of data.fcmTokens) {
        if (t && (t.token || t.id)) tokenMap.set(t.token || t.id, { ...(tokenMap.get(t.token || t.id) || {}), ...t });
      }
      updatedFcmTokens = Array.from(tokenMap.values());
    }

    const updated: DatabaseSchema = {
      admins: updatedAdmins,
      mandoubs: updatedMandoubs,
      families: updatedFamilies,
      orders: updatedOrders,
      renewals: updatedRenewals,
      blockedPhones: updatedBlockedPhones,
      pushSubscriptions: updatedPushSubscriptions,
      fcmTokens: updatedFcmTokens,
      vapidKeys: current.vapidKeys || data.vapidKeys,
      versionConfig: data.versionConfig || current.versionConfig,
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch (err) {
    console.error('Error writing data_store.json:', err);
    return readDb();
  }
}

// Initialize file if missing
if (!fs.existsSync(DATA_FILE)) {
  writeDb(defaultDb);
}

// --- API ENDPOINTS ---

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Full Database Sync (GET)
app.get('/api/db', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const db = readDb();
  res.json(db);
});

// Helper for normalizing Arabic/Persian digits and Iraqi phone numbers
function normalizeArabicDigits(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .trim();
}

function normalizeIraqiPhoneNumber(phone: string): string {
  if (!phone) return '';
  let d = normalizeArabicDigits(phone).replace(/\D/g, '');
  if (d.startsWith('00964')) d = d.slice(5);
  if (d.startsWith('964')) d = d.slice(3);
  if (d.length === 10 && d.startsWith('7')) d = '0' + d;
  return d;
}

// Dedicated Family & Customer Authentication API Endpoint
app.post('/api/auth/family', (req, res) => {
  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال رقم الهاتف' });
  }

  const rawPhone = String(phone).trim();
  const cleanPhone = normalizeArabicDigits(rawPhone);
  const normalizedPhone = normalizeIraqiPhoneNumber(rawPhone);
  const rawDigits = cleanPhone.replace(/\D/g, '');

  const db = readDb();

  // 1. Check if phone is blocked
  const blockedList = Array.isArray(db.blockedPhones) ? db.blockedPhones : [];
  const isBlocked = blockedList.some((bp: string) => {
    const bClean = normalizeArabicDigits(bp);
    const bNorm = normalizeIraqiPhoneNumber(bp);
    const bDigits = bClean.replace(/\D/g, '');
    return (
      bClean === cleanPhone ||
      bNorm === normalizedPhone ||
      (bDigits && rawDigits && bDigits === rawDigits)
    );
  });

  if (isBlocked) {
    return res.status(403).json({
      success: false,
      isBlocked: true,
      message: 'عذراً، هذا الرقم محظور من استخدام التطبيق. يرجى التواصل مع إدارة الخبزة.',
    });
  }

  // 2. Search for family in database
  const families = Array.isArray(db.families) ? db.families : [];
  const family = families.find((f: any) => {
    const fRaw = String(f.phone || '').trim();
    const fClean = normalizeArabicDigits(fRaw);
    const fNorm = normalizeIraqiPhoneNumber(fRaw);
    const fDigits = fClean.replace(/\D/g, '');

    return (
      fRaw === rawPhone ||
      fClean === cleanPhone ||
      fNorm === normalizedPhone ||
      (fDigits && rawDigits && fDigits === rawDigits) ||
      (fDigits && rawDigits && (fDigits.endsWith(rawDigits) || rawDigits.endsWith(fDigits)))
    );
  });

  if (family) {
    if (family.isBlocked) {
      return res.status(403).json({
        success: false,
        isBlocked: true,
        message: 'عذراً، تم حظر هذا الحساب من قبل الإدارة. يرجى التواصل مع إدارة الخبزة.',
      });
    }

    return res.json({
      success: true,
      family: family,
    });
  }

  return res.status(404).json({
    success: false,
    message: 'رقم الهاتف غير مسجل في قاعدة البيانات. يرجى التأكد من الرقم أو مراجعة إدارة الخبزة لتسجيل الاشتراك.',
  });
});

// Dedicated Staff & Mandoub Authentication API Endpoint
app.post('/api/auth/staff', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة السر' });
  }

  const rawUser = String(username).trim();
  const cleanUser = normalizeArabicDigits(rawUser).toLowerCase();
  const rawPass = String(password).trim();
  const cleanPass = normalizeArabicDigits(rawPass);

  const db = readDb();

  // 1. Check Admins
  const adminList = Array.isArray(db.admins) ? db.admins : defaultDb.admins;
  const admin = adminList.find((a: any) => {
    const aUser = normalizeArabicDigits(a.username || '').toLowerCase();
    const aName = normalizeArabicDigits(a.fullName || '').toLowerCase();
    const aPass = String(a.password || '').trim();
    const aPassClean = normalizeArabicDigits(aPass);
    const userMatch = aUser === cleanUser || aName === cleanUser || aUser === rawUser.toLowerCase();
    const passMatch = aPass === rawPass || aPassClean === cleanPass || aPass === cleanPass;
    return userMatch && passMatch;
  });

  if (admin) {
    return res.json({
      success: true,
      role: 'admin',
      user: admin,
    });
  }

  // 2. Check Mandoubs
  const mandoubList = Array.isArray(db.mandoubs) ? db.mandoubs : [];
  const mandoub = mandoubList.find((m: any) => {
    const mUser = normalizeArabicDigits(m.username || '').toLowerCase();
    const mName = normalizeArabicDigits(m.name || '').toLowerCase();
    const mPhone = normalizeArabicDigits(m.phone || '').replace(/\D/g, '');
    const mVlan = normalizeArabicDigits(m.vlanCode || '').toLowerCase();
    const userDigits = cleanUser.replace(/\D/g, '');

    const userMatch =
      mUser === cleanUser ||
      mUser === rawUser.toLowerCase() ||
      (mPhone && userDigits && mPhone === userDigits) ||
      (mPhone && (cleanUser === mPhone || rawUser === m.phone)) ||
      mName === cleanUser ||
      mName === rawUser.toLowerCase() ||
      mVlan === cleanUser ||
      mVlan === rawUser.toLowerCase();

    const mPass = String(m.password || '').trim();
    const mPassClean = normalizeArabicDigits(mPass);
    const passMatch = mPass === rawPass || mPassClean === cleanPass || mPass === cleanPass;

    return userMatch && passMatch;
  });

  if (mandoub) {
    if (mandoub.status === 'disabled' || mandoub.status === 'inactive') {
      return res.status(403).json({
        success: false,
        message: 'عذراً، تم تعطيل حساب المندوب هذا من قبل الإدارة. يرجى مراجعة المسؤول.',
      });
    }
    return res.json({
      success: true,
      role: 'mandoub',
      user: mandoub,
    });
  }

  // Check if username/phone exists but password was wrong
  const foundUserWrongPass = mandoubList.find((m: any) => {
    const mUser = normalizeArabicDigits(m.username || '').toLowerCase();
    const mPhone = normalizeArabicDigits(m.phone || '').replace(/\D/g, '');
    const userDigits = cleanUser.replace(/\D/g, '');
    return mUser === cleanUser || (mPhone && userDigits && mPhone === userDigits);
  });

  if (foundUserWrongPass) {
    return res.status(401).json({
      success: false,
      message: 'كلمة السر غير صحيحة. يرجى التأكد من كلمة السر والمحاولة مجدداً',
    });
  }

  return res.status(401).json({
    success: false,
    message: 'اسم المستخدم أو كلمة السر غير صحيحة',
  });
});

// Full Database Sync (POST)
app.post('/api/db', (req, res) => {
  const updated = writeDb(req.body);
  try {
    broadcastSSE({ type: 'DB_MUTATION', action: req.body?.action, updatedAt: new Date().toISOString() });
  } catch (e) {}
  res.json({ success: true, data: updated });
});

// Atomic Cloud CRUD Endpoints:

// 1. Families Save / Update
app.post('/api/families/save', (req, res) => {
  try {
    const familyData = req.body || {};
    if (!familyData.phone || !familyData.fullName) {
      return res.status(400).json({ success: false, message: 'معلومات العائلة غير مكتملة' });
    }
    const db = readDb();
    let families = Array.isArray(db.families) ? [...db.families] : [];
    
    let targetIndex = -1;
    if (familyData.id) {
      targetIndex = families.findIndex((f) => f.id === familyData.id);
    }
    if (targetIndex === -1 && familyData.phone) {
      targetIndex = families.findIndex((f) => f.phone === familyData.phone);
    }

    const today = new Date().toISOString().split('T')[0];
    let savedFamily: any;

    if (targetIndex >= 0) {
      const existing = families[targetIndex];
      savedFamily = {
        ...existing,
        ...familyData,
        id: existing.id || familyData.id,
        updatedAt: new Date().toISOString(),
      };
      families[targetIndex] = savedFamily;
    } else {
      savedFamily = {
        id: familyData.id || `fam-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ...familyData,
        registeredAt: familyData.registeredAt || today,
        activationDate: familyData.activationDate || today,
        subscriptionStatus: familyData.subscriptionStatus || 'active',
        isBlocked: !!familyData.isBlocked,
        updatedAt: new Date().toISOString(),
      };
      families.push(savedFamily);
    }

    db.families = families;
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');

    try {
      broadcastSSE({ type: 'DB_MUTATION', entity: 'families', action: 'save', family: savedFamily });
    } catch (e) {}

    res.json({ success: true, family: savedFamily });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'فشل حفظ العائلة' });
  }
});

// 2. Families Delete
app.post('/api/families/delete', (req, res) => {
  try {
    const { id, phone } = req.body || {};
    if (!id && !phone) return res.status(400).json({ success: false, message: 'معرف أو هاتف العائلة مطلوب' });
    const db = readDb();
    db.families = (db.families || []).filter((f: any) => {
      if (id && f.id === id) return false;
      if (phone && f.phone === phone) return false;
      return true;
    });
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');

    try {
      broadcastSSE({ type: 'DB_MUTATION', entity: 'families', action: 'delete', id, phone });
    } catch (e) {}

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message });
  }
});

// 3. Mandoubs Save / Update
app.post('/api/mandoubs/save', (req, res) => {
  try {
    const mandoubData = req.body || {};
    if (!mandoubData.name || !mandoubData.username || !mandoubData.password) {
      return res.status(400).json({ success: false, message: 'معلومات المندوب غير مكتملة' });
    }
    const db = readDb();
    let mandoubs = Array.isArray(db.mandoubs) ? [...db.mandoubs] : [];

    let targetIndex = -1;
    if (mandoubData.id) {
      targetIndex = mandoubs.findIndex((m) => m.id === mandoubData.id);
    }
    if (targetIndex === -1 && mandoubData.username) {
      targetIndex = mandoubs.findIndex((m) => m.username === mandoubData.username);
    }

    let savedMandoub: any;
    if (targetIndex >= 0) {
      const existing = mandoubs[targetIndex];
      savedMandoub = {
        ...existing,
        ...mandoubData,
        id: existing.id || mandoubData.id,
        updatedAt: new Date().toISOString(),
      };
      mandoubs[targetIndex] = savedMandoub;
    } else {
      savedMandoub = {
        id: mandoubData.id || `mnd-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ...mandoubData,
        status: mandoubData.status || 'active',
        updatedAt: new Date().toISOString(),
      };
      mandoubs.push(savedMandoub);
    }

    db.mandoubs = mandoubs;
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');

    try {
      broadcastSSE({ type: 'DB_MUTATION', entity: 'mandoubs', action: 'save', mandoub: savedMandoub });
    } catch (e) {}

    res.json({ success: true, mandoub: savedMandoub });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'فشل حفظ المندوب' });
  }
});

// 4. Mandoubs Delete
app.post('/api/mandoubs/delete', (req, res) => {
  try {
    const { id, username } = req.body || {};
    if (!id && !username) return res.status(400).json({ success: false, message: 'معرف أو اسم مستخدم المندوب مطلوب' });
    const db = readDb();
    db.mandoubs = (db.mandoubs || []).filter((m: any) => {
      if (id && m.id === id) return false;
      if (username && m.username === username) return false;
      return true;
    });
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');

    try {
      broadcastSSE({ type: 'DB_MUTATION', entity: 'mandoubs', action: 'delete', id, username });
    } catch (e) {}

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message });
  }
});

// 5. Orders Save / Create / Update
app.post('/api/orders/save', (req, res) => {
  try {
    const orderData = req.body || {};
    if (!orderData.id || !orderData.familyPhone) {
      return res.status(400).json({ success: false, message: 'بيانات الطلب غير مكتملة' });
    }
    const db = readDb();
    let orders = Array.isArray(db.orders) ? [...db.orders] : [];
    const index = orders.findIndex((o) => o.id === orderData.id);

    // Auto-resolve mandoub assignment on server if missing
    if (!orderData.mandoubId) {
      const mandoubs = Array.isArray(db.mandoubs) ? db.mandoubs : [];
      const activeMandoubs = mandoubs.filter((m: any) => !m.status || m.status === 'active');
      const matched = activeMandoubs.find((m: any) =>
        isServerOrderMatchedToMandoub(orderData, m, activeMandoubs)
      );
      const fallback = !matched && activeMandoubs.length === 1 ? activeMandoubs[0] : null;
      const assigned = matched || fallback;
      if (assigned) {
        orderData.mandoubId = assigned.id;
        orderData.mandoubName = assigned.name;
      }
    }

    let savedOrder: any;
    if (index >= 0) {
      savedOrder = {
        ...orders[index],
        ...orderData,
        updatedAt: new Date().toISOString(),
      };
      orders[index] = savedOrder;
    } else {
      savedOrder = {
        ...orderData,
        createdAt: orderData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      orders.unshift(savedOrder);
    }

    db.orders = orders;
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');

    try {
      broadcastSSE({ type: 'DB_MUTATION', entity: 'orders', action: 'save', order: savedOrder });
    } catch (e) {}

    // When a brand new order is placed, immediately wake up Mandoub via Server WebPush / Cloudflare Push
    if (index < 0 && savedOrder.status === 'pending') {
      try {
        const notifTitle = 'طلب خبز جديد وصل للمندوب! 🥖🔔';
        const notifBody = `وصل طلب خبز جديد (${savedOrder.quantity} ${savedOrder.unitText || 'خبزة'}) لعائلة ${savedOrder.familyName}`;
        dispatchServerPushNotification({
          title: notifTitle,
          body: notifBody,
          targetRole: 'mandoub',
          vlanCode: savedOrder.vlanCode,
          orderId: savedOrder.id,
        }).catch(() => {});
      } catch (e) {}
    }

    res.json({ success: true, order: savedOrder });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'فشل حفظ الطلب' });
  }
});

// 6. Orders Status Update
app.post('/api/orders/status', (req, res) => {
  try {
    const { id, status, updates } = req.body || {};
    if (!id || !status) return res.status(400).json({ success: false, message: 'معرف الطلب والحالة مطلوبان' });
    const db = readDb();
    let orders = Array.isArray(db.orders) ? [...db.orders] : [];
    const index = orders.findIndex((o) => o.id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    const existing = orders[index];
    const updatedOrder = {
      ...existing,
      ...(updates || {}),
      status,
      updatedAt: new Date().toISOString(),
    };
    orders[index] = updatedOrder;

    db.orders = orders;
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');

    try {
      broadcastSSE({ type: 'DB_MUTATION', entity: 'orders', action: 'status_update', order: updatedOrder });
    } catch (e) {}

    // When status changes to under_review, wake up the specific target FAMILY
    if (status === 'under_review') {
      try {
        const notifTitle = '🎉 وصل الخبز إلى منزلكم!';
        const notifBody = `قام المندوب بتوصيل طلب الخبز (${updatedOrder.quantity} ${updatedOrder.unitText || 'خبزة'}). يرجى تأكيد الاستلام الآن!`;
        dispatchServerPushNotification({
          title: notifTitle,
          body: notifBody,
          targetRole: 'family',
          targetPhone: updatedOrder.familyPhone,
          orderId: updatedOrder.id,
        }).catch(() => {});
      } catch (e) {}
    } else if (status === 'completed_confirmed') {
      try {
        const notifTitle = '✅ تم تأكيد استلام الخبز';
        const notifBody = `تم تأكيد استلام طلب الخبز (${updatedOrder.quantity} ${updatedOrder.unitText || 'خبزة'}) من قبل عائلة ${updatedOrder.familyName}.`;
        dispatchServerPushNotification({
          title: notifTitle,
          body: notifBody,
          targetRole: 'mandoub',
          targetPhone: updatedOrder.mandoubPhone,
          vlanCode: updatedOrder.vlanCode,
          orderId: updatedOrder.id,
        }).catch(() => {});
      } catch (e) {}
    }

    res.json({ success: true, order: updatedOrder });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message });
  }
});

// 7. Renewals Save / Update
app.post('/api/renewals/save', (req, res) => {
  try {
    const renewalData = req.body || {};
    if (!renewalData.id) return res.status(400).json({ success: false, message: 'معرف طلب التجديد مطلوب' });
    const db = readDb();
    let renewals = Array.isArray(db.renewals) ? [...db.renewals] : [];
    const index = renewals.findIndex((r) => r.id === renewalData.id);

    let savedRenewal: any;
    if (index >= 0) {
      savedRenewal = {
        ...renewals[index],
        ...renewalData,
        updatedAt: new Date().toISOString(),
      };
      renewals[index] = savedRenewal;
    } else {
      savedRenewal = {
        ...renewalData,
        createdAt: renewalData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      renewals.unshift(savedRenewal);
    }

    db.renewals = renewals;
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');

    try {
      broadcastSSE({ type: 'DB_MUTATION', entity: 'renewals', action: 'save', renewal: savedRenewal });
    } catch (e) {}

    res.json({ success: true, renewal: savedRenewal });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message });
  }
});

// 8. Admins Save / Update
app.post('/api/admins/save', (req, res) => {
  try {
    const adminData = req.body || {};
    if (!adminData.username || !adminData.password) {
      return res.status(400).json({ success: false, message: 'بيانات الأدمن غير مكتملة' });
    }
    const db = readDb();
    let admins = Array.isArray(db.admins) ? [...db.admins] : [...defaultDb.admins];
    const index = admins.findIndex((a) => a.id === adminData.id || a.username === adminData.username);

    let savedAdmin: any;
    if (index >= 0) {
      savedAdmin = { ...admins[index], ...adminData, id: admins[index].id || adminData.id };
      admins[index] = savedAdmin;
    } else {
      savedAdmin = { id: adminData.id || `adm-${Date.now()}`, ...adminData };
      admins.push(savedAdmin);
    }

    db.admins = admins;
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');

    try {
      broadcastSSE({ type: 'DB_MUTATION', entity: 'admins', action: 'save' });
    } catch (e) {}

    res.json({ success: true, admin: savedAdmin });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message });
  }
});

// 9. Blocked Phones Toggle
app.post('/api/blocked-phones/toggle', (req, res) => {
  try {
    const { phone, isBlocked } = req.body || {};
    if (!phone) return res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب' });
    const cleanPhone = normalizeArabicDigits(String(phone)).replace(/\D/g, '');
    const db = readDb();
    let list: string[] = Array.isArray(db.blockedPhones) ? [...db.blockedPhones] : [];

    if (isBlocked) {
      if (!list.includes(cleanPhone)) list.push(cleanPhone);
    } else {
      list = list.filter((p) => normalizeArabicDigits(p).replace(/\D/g, '') !== cleanPhone);
    }

    db.blockedPhones = list;
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');

    try {
      broadcastSSE({ type: 'DB_MUTATION', entity: 'blockedPhones', action: 'toggle' });
    } catch (e) {}

    res.json({ success: true, blockedPhones: list });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message });
  }
});

// Reset Database (Full wipe of families, mandoubs, orders, renewals, blocked phones - keep only Admins)
app.post('/api/db/reset', (req, res) => {
  const current = readDb();
  const resetData = {
    admins: current.admins && current.admins.length > 0 ? current.admins : defaultDb.admins,
    mandoubs: [],
    families: [],
    orders: [],
    renewals: [],
    blockedPhones: [],
    versionConfig: current.versionConfig || defaultDb.versionConfig,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(resetData, null, 2), 'utf-8');
  try {
    broadcastSSE({ type: 'DB_MUTATION', action: 'admin_reset', updatedAt: new Date().toISOString() });
  } catch (e) {}
  res.json({ success: true, data: resetData });
});

// Push Subscription storage in memory / DB
import webpush from 'web-push';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServerKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const pushSupabase: SupabaseClient | null =
  supabaseUrl && supabaseServerKey
    ? createClient(supabaseUrl, supabaseServerKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

function toSupabasePushRecord(sub: any) {
  return {
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    user_phone: sub.userPhone || sub.user_phone || null,
    role: sub.role === 'customer' ? 'family' : (sub.role || 'family'),
    vlan_code: sub.vlanCode || sub.vlan_code || null,
    updated_at: new Date().toISOString(),
  };
}

function fromSupabasePushRecord(sub: any) {
  return {
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    userPhone: sub.user_phone,
    role: sub.role,
    vlanCode: sub.vlan_code,
    updatedAt: sub.updated_at,
  };
}

async function loadDurablePushSubscriptions(localFallback: any[]): Promise<any[]> {
  if (!pushSupabase) return localFallback;
  try {
    const { data, error } = await pushSupabase
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth,user_phone,role,vlan_code,updated_at');
    if (error) throw error;
    return Array.isArray(data) ? data.map(fromSupabasePushRecord) : localFallback;
  } catch (error) {
    console.warn('[Push Server] Supabase subscription read failed; using local fallback:', error);
    return localFallback;
  }
}

const initialDb = readDb();
let vapidKeys = initialDb.vapidKeys || {
  publicKey: process.env.VAPID_PUBLIC_KEY || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || '',
};

try {
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    const generated = webpush.generateVAPIDKeys();
    vapidKeys = generated;
    writeDb({ vapidKeys });
  }
  webpush.setVapidDetails(
    'mailto:support@khobza-app.local',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
} catch (err) {
  console.warn('Web-push VAPID initialization note:', err);
}

let pushSubscriptions: any[] = initialDb.pushSubscriptions || [];
let fcmTokens: any[] = initialDb.fcmTokens || [];
let sseClients: any[] = [];

// SSE (Server-Sent Events) live streaming for instant sync across all tabs/devices
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const clientId = Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter((c) => c.id !== clientId);
  });
});

function broadcastSSE(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.res.write(payload);
    } catch (e) {
      // client disconnected
    }
  });
}

app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post('/api/push/subscribe', async (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.p256dh || !sub?.auth) {
    return res.status(400).json({ success: false, error: 'Invalid push subscription' });
  }

  const db = readDb();
  let currentSubs = Array.isArray(db.pushSubscriptions) ? [...db.pushSubscriptions] : [];
  currentSubs = currentSubs.filter((item) => item.endpoint !== sub.endpoint);
  const newEntry = {
    ...sub,
    id: sub.endpoint,
    role: sub.role === 'customer' ? 'family' : (sub.role || 'family'),
    updatedAt: new Date().toISOString(),
  };
  currentSubs.push(newEntry);
  pushSubscriptions = currentSubs;
  db.pushSubscriptions = currentSubs;
  db.updatedAt = new Date().toISOString();

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[Push Server] Local subscription fallback write failed:', error);
  }

  if (pushSupabase) {
    const { error } = await pushSupabase
      .from('push_subscriptions')
      .upsert(toSupabasePushRecord(newEntry), { onConflict: 'endpoint' });
    if (error) {
      console.error('[Push Server] Supabase subscription save failed:', error);
      return res.status(503).json({ success: false, error: 'Could not persist push subscription' });
    }
  }

  console.log(`[Push Server] Registered subscriber for ${newEntry.role} (${newEntry.userPhone || 'anon'}).`);
  return res.json({ success: true, count: currentSubs.length, durable: Boolean(pushSupabase) });
});

// Dedicated GET /api/orders endpoint for fast atomic fetching
app.get('/api/orders', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const db = readDb();
  res.json({ success: true, orders: db.orders || [] });
});

async function dispatchServerPushNotification(options: {
  title: string;
  body: string;
  targetRole?: 'mandoub' | 'family' | 'admin' | 'all' | 'customer' | string;
  targetPhone?: string;
  vlanCode?: string;
  orderId?: string;
}) {
  const { title, body, targetRole, targetPhone, vlanCode, orderId } = options;

  // 1. Broadcast via SSE (instant UI update for connected tabs)
  broadcastSSE({
    type: 'NOTIFICATION_PUSH',
    title,
    body,
    targetRole,
    targetPhone,
    vlanCode,
    orderId,
    timestamp: Date.now(),
  });

  // 2. Refresh pushSubscriptions from storage
  const currentDb = readDb();
  const localSubs: any[] = Array.isArray(currentDb.pushSubscriptions) && currentDb.pushSubscriptions.length > 0
    ? currentDb.pushSubscriptions
    : pushSubscriptions;
  const allSubs: any[] = await loadDurablePushSubscriptions(localSubs);

  // 3. Filter Web Push subscribers with robust role and phone matching
  const matchingSubs = allSubs.filter((sub) => {
    // Role filter: 'all' matches everyone. 'family' matches 'family' or 'customer'.
    if (targetRole && targetRole !== 'all') {
      const subRole = sub.role === 'customer' ? 'family' : sub.role;
      const tRole = targetRole === 'customer' ? 'family' : targetRole;
      if (subRole && subRole !== tRole) {
        return false;
      }
    }

    // VLAN / delivery-area filter: a new order must only wake the responsible mandoub.
    if (vlanCode && sub.vlanCode && !isServerVlanMatch(vlanCode, sub.vlanCode)) {
      return false;
    }

    // Phone / Identifier filter
    if (targetPhone && sub.userPhone) {
      const rawTarget = String(targetPhone).trim().toLowerCase();
      const rawSub = String(sub.userPhone).trim().toLowerCase();
      if (rawTarget !== rawSub) {
        const p1 = normalizeIraqiPhoneNumber(rawSub) || normalizeArabicDigits(rawSub).replace(/\D/g, '');
        const p2 = normalizeIraqiPhoneNumber(rawTarget) || normalizeArabicDigits(rawTarget).replace(/\D/g, '');
        if (p1 && p2 && p1 !== p2 && !p1.endsWith(p2) && !p2.endsWith(p1)) {
          return false;
        }
      }
    }

    return true;
  });

  console.log(`[Push Dispatcher] Sending notification "${title}" to ${matchingSubs.length} of ${allSubs.length} subscribers (targetRole: ${targetRole || 'all'}, targetPhone: ${targetPhone || 'all'})`);

  const payload = JSON.stringify({
    title: title || 'تطبيق الخبزة 🥖',
    body: body || 'لديك إشعار جديد في تطبيق الخبزة',
    tag: orderId ? `khobza-order-${orderId}` : `khobza-notif-${Date.now()}`,
    icon: '/icon-192.png',
    badge: '/favicon.png',
    data: {
      orderId,
      url: '/',
      targetRole,
      timestamp: Date.now(),
    },
  });

  const deadEndpoints: string[] = [];
  if (vapidKeys.publicKey && vapidKeys.privateKey && matchingSubs.length > 0) {
    await Promise.allSettled(
      matchingSubs.map(async (sub) => {
        try {
          if (sub.endpoint && sub.p256dh && sub.auth) {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              },
              payload,
              {
                TTL: 86400, // Keep in queue on push server for 24 hours if device is offline
                urgency: 'high',
              }
            );
            console.log(`[Push Dispatcher] WebPush successfully delivered to endpoint: ${sub.endpoint.substring(0, 45)}...`);
          }
        } catch (err: any) {
          console.warn(`[Push Dispatcher] WebPush delivery warning for endpoint (${err.statusCode || err.message}):`, err.statusCode);
          if (err.statusCode === 404 || err.statusCode === 410) {
            deadEndpoints.push(sub.endpoint);
          }
        }
      })
    );
  }

  if (deadEndpoints.length > 0) {
    pushSubscriptions = pushSubscriptions.filter((s) => !deadEndpoints.includes(s.endpoint));
    writeDb({ pushSubscriptions });
    if (pushSupabase) {
      await pushSupabase.from('push_subscriptions').delete().in('endpoint', deadEndpoints);
    }
  }

  return { targetedCount: matchingSubs.length, activeSubscribers: pushSubscriptions.length };
}

app.post('/api/push/send', async (req, res) => {
  const result = await dispatchServerPushNotification(req.body);
  res.json({ success: true, ...result });
});

// FCM Token Register API
app.post('/api/fcm/token', (req, res) => {
  const tokenRecord = req.body;
  if (tokenRecord && tokenRecord.token) {
    const db = readDb();
    let currentTokens = Array.isArray(db.fcmTokens) ? [...db.fcmTokens] : [];
    currentTokens = currentTokens.filter((t) => t.token !== tokenRecord.token);
    currentTokens.push({
      ...tokenRecord,
      id: tokenRecord.token,
      updatedAt: new Date().toISOString(),
    });
    fcmTokens = currentTokens;
    db.fcmTokens = currentTokens;
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
      console.log(`[FCM Server] Registered FCM Token for ${tokenRecord.role || 'user'}. Total: ${currentTokens.length}`);
    } catch (e) {}
  }
  res.json({ success: true, count: fcmTokens.length });
});

// FCM Notification Dispatch API
app.post('/api/fcm/send', (req, res) => {
  const { title, body, targetPhone, targetRole, orderId } = req.body;
  dispatchServerPushNotification({ title, body, targetPhone, targetRole, orderId }).catch(() => {});
  res.json({ success: true, status: 'dispatched', recipients: fcmTokens.length });
});

// Cloudflare Worker Push Gateway API
app.post('/api/cloudflare/push', async (req, res) => {
  const { title, body, targetPhone, targetRole, orderId, vlanCode } = req.body;
  console.log(`[Cloudflare Push Gateway] Dispatched: "${title}" -> ${targetRole || 'all'}`);
  const result = await dispatchServerPushNotification({ title, body, targetPhone, targetRole, orderId, vlanCode });
  res.json({
    success: true,
    gateway: 'cloudflare-edge-compatible',
    delivered: result.targetedCount,
    timestamp: new Date().toISOString(),
  });
});

// Restore Official v1.0.5 Checkpoint
app.post('/api/db/restore-v105final', (req, res) => {
  const checkpoint = {
    admins: defaultDb.admins,
    mandoubs: [],
    families: [],
    orders: [],
    renewals: [],
    blockedPhones: [],
    versionConfig: {
      currentVersion: '1.0.5',
      latestVersion: '1.0.5',
      isMandatory: false,
      releaseNotes: 'الإصدار الرسمي المستقر وآمن v1.0.5',
      releasedAt: new Date().toISOString(),
    },
    action: 'overwrite'
  };
  writeDb(checkpoint);
  res.json({ success: true, data: checkpoint });
});

// Restore Official v1.0.4.final Checkpoint
app.post('/api/db/restore-v104final', (req, res) => {
  const checkpoint = {
    admins: defaultDb.admins,
    mandoubs: [],
    families: [],
    orders: [],
    renewals: [],
    blockedPhones: [],
    versionConfig: {
      currentVersion: '1.0.4',
      latestVersion: '1.0.4',
      isMandatory: false,
      releaseNotes: 'الإصدار الرسمي المستقر وآمن v1.0.4.final',
      releasedAt: new Date().toISOString(),
    },
    action: 'overwrite'
  };
  writeDb(checkpoint);
  res.json({ success: true, data: checkpoint });
});

// Reset Database to Default Seed
app.post('/api/db/reset-default', (req, res) => {
  writeDb({ ...defaultDb, action: 'overwrite' });
  res.json({ success: true, data: defaultDb });
});

// Start Server with Vite Middleware in Dev
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
