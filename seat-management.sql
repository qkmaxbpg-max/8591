-- 座位管理系統 — 資料庫變更 (2026-06-20)
-- 請在 Supabase SQL Editor 執行

-- 關閉 RLS
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- 1. 建立 service_accounts 表
CREATE TABLE IF NOT EXISTS service_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  platform TEXT NOT NULL,
  email TEXT NOT NULL,
  max_seats INT NOT NULL DEFAULT 5,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT '啟用',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE service_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own service_accounts"
  ON service_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. orders 表新增欄位
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_account_id UUID REFERENCES service_accounts(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seat_number INT;

-- 重新啟用 RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
