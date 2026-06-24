-- ============================================
-- 分店系統遷移 SQL
-- 在 Supabase SQL Editor 中執行
-- ============================================

-- 1. 建立 stores 表
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  is_default BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own stores" ON stores
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. 各資料表新增 store_id 欄位
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE ad_spends ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE ad_configs ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE service_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);

-- 3. 為現有資料建立預設分店（需要手動替換 YOUR_USER_ID）
-- 執行後請記下產生的 store id，填入下方 UPDATE

-- 取得你的 user_id（執行這段看結果）:
-- SELECT id FROM auth.users LIMIT 5;

-- 建立預設分店（替換 'YOUR_USER_ID'）:
-- INSERT INTO stores (user_id, name, avatar, is_default, sort_order)
-- VALUES
--   ('YOUR_USER_ID', '貓玩聚', 'icon.png', true, 0),
--   ('YOUR_USER_ID', '胡桃代購', 'hutao.png', false, 1);

-- 將現有資料指向預設分店（替換 'DEFAULT_STORE_ID' 為貓玩聚的 store id）:
-- UPDATE products SET store_id = 'DEFAULT_STORE_ID' WHERE store_id IS NULL;
-- UPDATE orders SET store_id = 'DEFAULT_STORE_ID' WHERE store_id IS NULL;
-- UPDATE customers SET store_id = 'DEFAULT_STORE_ID' WHERE store_id IS NULL;
-- UPDATE agents SET store_id = 'DEFAULT_STORE_ID' WHERE store_id IS NULL;
-- UPDATE ad_spends SET store_id = 'DEFAULT_STORE_ID' WHERE store_id IS NULL;
-- UPDATE ad_configs SET store_id = 'DEFAULT_STORE_ID' WHERE store_id IS NULL;
-- UPDATE service_accounts SET store_id = 'DEFAULT_STORE_ID' WHERE store_id IS NULL;
