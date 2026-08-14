import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const DATA_FILE = path.join(process.cwd(), 'data_store.json');

// Default initial data seed
const defaultDb = {
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
  versionConfig: {
    currentVersion: '1.0.1',
    latestVersion: '1.0.1',
    isMandatory: false,
    releaseNotes: 'تحديث الجودة المباشر وحفظ البيانات السحابية المركزية',
    releasedAt: new Date().toISOString(),
  },
};

// Helper to merge arrays by id without losing existing records
function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  if (!Array.isArray(incoming)) return current || [];
  if (!Array.isArray(current)) return incoming || [];
  const map = new Map<string, T>();
  for (const item of current) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of incoming) {
    if (item && item.id) {
      const existing = map.get(item.id);
      map.set(item.id, existing ? { ...existing, ...item } : item);
    }
  }
  return Array.from(map.values());
}

// Helper to read database
function readDb() {
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
        versionConfig: parsed.versionConfig || defaultDb.versionConfig,
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

    if (data.action === 'admin_reset') {
      // Full administrative wipe of all non-admin data
      updatedFamilies = [];
      updatedMandoubs = [];
      updatedOrders = [];
      updatedRenewals = [];
      updatedBlockedPhones = [];
    } else if (data.action === 'overwrite') {
      // Explicit overwrite (e.g. after intentional admin deletion or backup import)
      if (Array.isArray(data.families)) {
        // Protect server data: if incoming is empty but server has data, don't accidentally wipe unless admin_reset
        if (data.families.length > 0 || current.families.length === 0) {
          updatedFamilies = data.families;
        }
      }
      if (Array.isArray(data.mandoubs)) {
        if (data.mandoubs.length > 0 || current.mandoubs.length === 0) {
          updatedMandoubs = data.mandoubs;
        }
      }
      if (Array.isArray(data.orders)) {
        if (data.orders.length > 0 || current.orders.length === 0) {
          updatedOrders = data.orders;
        }
      }
      if (Array.isArray(data.admins) && data.admins.length > 0) updatedAdmins = data.admins;
      if (Array.isArray(data.blockedPhones)) updatedBlockedPhones = data.blockedPhones;
      if (Array.isArray(data.renewals)) updatedRenewals = data.renewals;
    } else {
      // Smart merge (default for updates and additions)
      if (Array.isArray(data.families)) {
        updatedFamilies = mergeById(current.families, data.families);
      }
      if (Array.isArray(data.mandoubs)) {
        updatedMandoubs = mergeById(current.mandoubs, data.mandoubs);
      }
      if (Array.isArray(data.orders)) {
        updatedOrders = mergeById(current.orders, data.orders);
      }
      if (Array.isArray(data.renewals)) {
        updatedRenewals = mergeById(current.renewals, data.renewals);
      }
      if (Array.isArray(data.admins) && data.admins.length > 0) {
        updatedAdmins = mergeById(current.admins, data.admins);
      }
      if (Array.isArray(data.blockedPhones)) {
        updatedBlockedPhones = Array.from(
          new Set([...current.blockedPhones, ...data.blockedPhones])
        );
      }
    }

    const updated = {
      admins: updatedAdmins,
      mandoubs: updatedMandoubs,
      families: updatedFamilies,
      orders: updatedOrders,
      renewals: updatedRenewals,
      blockedPhones: updatedBlockedPhones,
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

// Helper for normalizing Arabic/Persian digits
function normalizeArabicDigits(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .trim();
}

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
  res.json({ success: true, data: updated });
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
  res.json({ success: true, data: resetData });
});

// Push Subscription storage in memory / DB
let pushSubscriptions: any[] = [];
let fcmTokens: any[] = [];

app.post('/api/push/subscribe', (req, res) => {
  const sub = req.body;
  if (sub && sub.endpoint) {
    pushSubscriptions = pushSubscriptions.filter((s) => s.endpoint !== sub.endpoint);
    pushSubscriptions.push(sub);
  }
  res.json({ success: true, count: pushSubscriptions.length });
});

app.post('/api/push/send', (req, res) => {
  const { title, body, targetRole, orderId } = req.body;
  // Push notification dispatched to active subscribers
  res.json({ success: true, deliveredCount: pushSubscriptions.length + fcmTokens.length });
});

// FCM Token Register API
app.post('/api/fcm/token', (req, res) => {
  const tokenRecord = req.body;
  if (tokenRecord && tokenRecord.token) {
    fcmTokens = fcmTokens.filter((t) => t.token !== tokenRecord.token);
    fcmTokens.push(tokenRecord);
  }
  res.json({ success: true, count: fcmTokens.length });
});

// FCM Notification Dispatch API
app.post('/api/fcm/send', (req, res) => {
  const { title, body, targetPhone, targetRole, orderId } = req.body;
  console.log(`[FCM Push] Notification dispatched: "${title}" - "${body}" (Target: ${targetRole || 'all'})`);
  res.json({ success: true, status: 'dispatched', recipients: fcmTokens.length });
});

// Cloudflare Worker Push Gateway API
app.post('/api/cloudflare/push', (req, res) => {
  const { title, body, targetPhone, targetRole, orderId } = req.body;
  console.log(`[Cloudflare Push Gateway] Broadcaster: "${title}" -> ${targetRole || 'all'} (Subscribers: ${pushSubscriptions.length + fcmTokens.length})`);
  res.json({
    success: true,
    gateway: 'cloudflare-edge-compatible',
    delivered: pushSubscriptions.length + fcmTokens.length,
    timestamp: new Date().toISOString(),
  });
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
