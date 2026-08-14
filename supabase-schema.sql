-- ==============================================================================
-- Khobza App - Full Supabase Database Schema & RLS Policies
-- تطبيق الخبزة - سكيما قاعدة البيانات السحابية الكاملة
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Families Table (جدول العوائل والمشتركين)
CREATE TABLE IF NOT EXISTS public.families (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    vlan_code TEXT NOT NULL,
    area_name TEXT NOT NULL,
    package_type TEXT NOT NULL DEFAULT 'saver', -- saver (15), medium (25), unlimited
    days_remaining INTEGER NOT NULL DEFAULT 30,
    remaining_orders INTEGER DEFAULT 15,
    subscription_status TEXT NOT NULL DEFAULT 'active', -- active, expired, blocked
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    bakery_name TEXT DEFAULT 'مخبز الخبزة الرئيسي',
    location JSONB,
    order_history JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Mandoubs Table (جدول المندوبين وسائقي التوصيل)
CREATE TABLE IF NOT EXISTS public.mandoubs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    vlan_code TEXT NOT NULL,
    area_name TEXT NOT NULL,
    bakery_name TEXT DEFAULT 'مخبز الخبزة الرئيسي',
    status TEXT NOT NULL DEFAULT 'active', -- active, inactive
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_location JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Admins Table (جدول المدراء والأدمن)
CREATE TABLE IF NOT EXISTS public.admins (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Admin if not exists
INSERT INTO public.admins (id, username, password, full_name)
VALUES ('admin-1', 'admin123', 'admin123', 'المدير العام (الأدمن الرئيس)')
ON CONFLICT (username) DO NOTHING;

-- 5. Orders Table (جدول الطلبات وسجل التوصيل)
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    family_name TEXT NOT NULL,
    family_phone TEXT NOT NULL,
    vlan_code TEXT NOT NULL,
    area_name TEXT NOT NULL,
    location JSONB,
    order_type TEXT NOT NULL, -- 'kg', 'loaf', 'amount'
    quantity NUMERIC NOT NULL,
    price_amount NUMERIC DEFAULT 0,
    unit_text TEXT NOT NULL,
    time_slot TEXT NOT NULL, -- 'morning', 'afternoon', 'evening'
    time_slot_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, under_review, completed_confirmed, processing_unpaid, unpaid_confirmed, rejected_unpaid_returned
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    mandoub_id TEXT,
    mandoub_name TEXT,
    customer_confirmed_at TIMESTAMPTZ,
    admin_note TEXT,
    unpaid_amount NUMERIC,
    unpaid_resolved BOOLEAN DEFAULT FALSE,
    deducted_from_package BOOLEAN DEFAULT FALSE
);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_orders_family_phone ON public.orders(family_phone);
CREATE INDEX IF NOT EXISTS idx_orders_vlan_code ON public.orders(vlan_code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- 6. Renewals Table (جدول طلبات تجديد الاشتراكات)
CREATE TABLE IF NOT EXISTS public.renewals (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    family_name TEXT NOT NULL,
    family_phone TEXT NOT NULL,
    vlan_code TEXT NOT NULL,
    area_name TEXT NOT NULL,
    requested_package TEXT NOT NULL,
    package_name TEXT NOT NULL,
    package_price_iqd NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_mandoub', -- pending_mandoub, confirmed, rejected_mandoub, rejected_admin
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    mandoub_id TEXT,
    mandoub_name TEXT,
    rejection_reason TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Blocked Phones Table (جدول الأرقام المحظورة)
CREATE TABLE IF NOT EXISTS public.blocked_phones (
    phone TEXT PRIMARY KEY,
    reason TEXT,
    blocked_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. App Configuration Table (جدول إعدادات النظام والتحديثات)
CREATE TABLE IF NOT EXISTS public.app_config (
    id TEXT PRIMARY KEY,
    config_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Version Config
INSERT INTO public.app_config (id, config_json)
VALUES (
    'version_config',
    '{"currentVersion":"1.0.4","latestVersion":"1.0.4","isMandatory":false,"releaseNotes":"الإصدار المستقر والآمن للخبزة v1.0.4.final","releasedAt":"2026-08-14T00:00:00.000Z"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 9. Push Subscriptions Table (جدول اشتراكات الإشعارات الخارجية عندما يكون التطبيق مغلقاً)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_phone TEXT,
    role TEXT NOT NULL, -- 'family', 'mandoub', 'admin'
    vlan_code TEXT,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Enable Row Level Security (RLS) & Grant Access
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mandoubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow Public Access via Anon Key for Applet
CREATE POLICY "Allow public read-write for families" ON public.families FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for mandoubs" ON public.mandoubs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for admins" ON public.admins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for renewals" ON public.renewals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for blocked_phones" ON public.blocked_phones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for app_config" ON public.app_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for push_subscriptions" ON public.push_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime publication for tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.families;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mandoubs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.renewals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_config;
