# 🔔 دليل إعداد إشعارات الهاتف مع Supabase و Firebase Cloud Messaging (FCM)

هذا الدليل يشرح لصديقك المبرمج بالتفصيل كيفية تشغيل إشعارات الهواتف (Android & iPhone iOS) باستخدام **Firebase Cloud Messaging (FCM)** و **Supabase** لضمان وصول التنبيهات واهتزاز ورنين الهاتف فوراً حتى عندما يكون التطبيق مغلقاً تماماً في الخلفية.

---

## 📱 1. كيف تعمل المنظومة؟
1. **تسجيل الجهاز (Client Side)**:
   - عند فتح تطبيق الخبزة، يتم طلب إذن الإشعارات من المستخدم وتوليد **FCM Token** أو Web Push Subscription.
   - يتم حفظ هذا التوكن تلقائياً في جدول **`fcm_tokens`** و **`push_subscriptions`** في **Supabase** مع رقم هاتف العائلة أو المندوب ونوع الجهاز (`ios` أو `android`).
2. **استقبال الإشعارات عند الإغلاق (Background Service Worker)**:
   - يعمل ملف الـ Service Worker (`public/firebase-messaging-sw.js` و `public/sw.js`) في خلفية نظام التشغيل لاستقبال رسائل الـ Push الصامتة وعرض الإشعار فوراً مع الاهتزاز والنغمة المخصصة.

---

## 🚀 2. خطوات إعداد Firebase Cloud Messaging (FCM) مجاناً

### الخطوة 1: إنشاء مشروع على Firebase
1. ادخل إلى [Firebase Console](https://console.firebase.google.com) وسجّل الدخول بحساب Google.
2. اضغط على **"Add Project"** وسمّ المشروع (مثلاً: `khobza-notifications`).
3. اضغط على **"Create Project"**.

### الخطوة 2: إضافة Web App والحصول على مفاتيح الربط
1. من الصفحة الرئيسية للمشروع، اضغط على أيقونة الويب (`</>`).
2. ضع اسماً للتطبيق واضغط على **Register App**.
3. ستظهر لك بيانات التهيئة (`firebaseConfig`)، مثل:
   ```javascript
   apiKey: "AIzaSy...",
   authDomain: "khobza-notifications.firebaseapp.com",
   projectId: "khobza-notifications",
   storageBucket: "khobza-notifications.appspot.com",
   messagingSenderId: "1234567890",
   appId: "1:1234567890:web:abcdef..."
   ```

### الخطوة 3: توليد مفتاح Web Push (VAPID Key)
1. من قائمة الإعدادات (أيقونة الترس ⚙️) أعلى اليسار، اختر **Project Settings**.
2. انتقل إلى تبويب **Cloud Messaging**.
3. انزل لأسفل إلى قسم **Web configuration** (Web Push certificates).
4. اضغط على زر **"Generate key pair"**.
5. انسخ المفتاح الذي تم إنشاؤه (VAPID Key).

---

## 🔑 3. وضع المفاتيح في ملف البيئة (`.env`)

افتح ملف `.env` في المشروع وأضف المفاتيح التالية:

```env
# Supabase Keys
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"

# Firebase Cloud Messaging Keys
VITE_FIREBASE_API_KEY="ضع_apiKey_هنا"
VITE_FIREBASE_AUTH_DOMAIN="ضع_authDomain_هنا"
VITE_FIREBASE_PROJECT_ID="ضع_projectId_هنا"
VITE_FIREBASE_STORAGE_BUCKET="ضع_storageBucket_هنا"
VITE_FIREBASE_MESSAGING_SENDER_ID="ضع_messagingSenderId_هنا"
VITE_FIREBASE_APP_ID="ضع_appId_هنا"
VITE_FIREBASE_VAPID_KEY="ضع_VAPID_Key_هنا"
```

---

## ⚡ 4. إرسال الإشعارات من خادم Supabase (Edge Functions / Webhooks)

لإرسال إشعار للمستخدمين عند إنشاء طلب جديد أو وصول المندوب، يمكن لصديقك المبرمج إنشاء Supabase Edge Function أو استدعاء FCM API عبر Node.js:

### كود إرسال إشعار عبر Node.js / Backend (Firebase Admin SDK):
```javascript
const admin = require('firebase-admin');

// إرسال إشعار لعائلة معينة بناءً على الـ Token المحفوظ في Supabase
async function sendDeliveryNotification(fcmToken, orderDetails) {
  const message = {
    token: fcmToken,
    notification: {
      title: '🎉 وصل الخبز إلى منزلكم!',
      body: `قام المندوب بتوصيل طلب الخبز (${orderDetails.quantity} ${orderDetails.unitText}). يرجى فتح التطبيق وتأكيد الاستلام!`
    },
    data: {
      url: '/',
      orderId: orderDetails.id,
      targetRole: 'family'
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'khobza_orders_channel',
        vibrateTimingsMillis: [500, 200, 500, 200, 500]
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      }
    }
  };

  const response = await admin.messaging().send(message);
  console.log('Successfully sent push notification:', response);
}
```

---

## 🍏 5. ملاحظة خاصة بهواتف الآيفون (iOS Safari)
- في أجهزة iPhone التي تعمل بنظام iOS 16.4 فما فوق:
  1. يقوم المستخدم بفتح الرابط في متصفح Safari.
  2. يضغط على زر المشاركة ثم **"إضافة إلى الشاشة الرئيسية" (Add to Home Screen)**.
  3. عند فتح التطبيق من الشاشة الرئيسية، يطلب الإذن وتعمل الإشعارات الفورية حتى لو كان التطبيق مغلقاً تماماً!

---

الملفات المخصصة للإشعارات في المشروع:
- `public/firebase-messaging-sw.js` : الـ Service Worker لفايربيس.
- `public/sw.js` : الـ Service Worker لـ PWA و Web Push.
- `src/services/fcmService.ts` : محرك التسجيل والمزامنة مع Supabase.
- `supabase-schema.sql` : جدول `fcm_tokens` و `push_subscriptions`.
