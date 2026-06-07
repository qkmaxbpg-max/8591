-- 將 ads 表重命名為 ad_spends（避免廣告攔截器封鎖）
-- 在 Supabase SQL Editor 執行

ALTER TABLE ads RENAME TO ad_spends;

-- 更新索引名稱
ALTER INDEX IF EXISTS idx_ads_user_date RENAME TO idx_ad_spends_user_date;

-- RLS policy 會自動跟著表走，不需要手動改
