-- 商品表新增蝦皮售價欄位
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopee_price numeric NOT NULL DEFAULT 0;

-- 更新 8591 售價（根據最新定價表）
-- YouTube Premium
UPDATE products SET price = 380 WHERE platform = 'YouTube Premium' AND version = '個人版' AND duration = '3個月';
UPDATE products SET price = 900 WHERE platform = 'YouTube Premium' AND version = '個人版' AND duration = '6個月';
UPDATE products SET price = 1450 WHERE platform = 'YouTube Premium' AND version = '個人版' AND duration = '12個月';
UPDATE products SET price = 110 WHERE platform = 'YouTube Premium' AND version = '家庭版' AND duration = '1個月';
UPDATE products SET price = 650 WHERE platform = 'YouTube Premium' AND version = '家庭版' AND duration = '6個月';
UPDATE products SET price = 850 WHERE platform = 'YouTube Premium' AND version = '家庭版' AND duration = '12個月';

-- Spotify Premium
UPDATE products SET price = 1080 WHERE platform = 'Spotify Premium' AND version = '家庭版' AND duration = '12個月';

-- Discord Nitro
UPDATE products SET price = 170 WHERE platform = 'Discord Nitro' AND version = '登入版' AND duration = '1個月';
UPDATE products SET price = 1350 WHERE platform = 'Discord Nitro' AND version = '登入版' AND duration = '12個月';
UPDATE products SET price = 1450 WHERE platform = 'Discord Nitro' AND version = '免登版' AND duration = '12個月';
UPDATE products SET price = 250 WHERE platform = 'Discord Nitro' AND version = '贈禮版' AND duration = '1個月';
UPDATE products SET price = 2450 WHERE platform = 'Discord Nitro' AND version = '贈禮版' AND duration = '12個月';
UPDATE products SET price = 320 WHERE platform = 'Discord Nitro' AND version = '兩次加成' AND duration = '3個月';

-- Netflix
UPDATE products SET price = 180 WHERE platform = 'Netflix' AND version = '獨享使用者' AND duration = '1個月';
UPDATE products SET price = 480 WHERE platform = 'Netflix' AND version = '獨享使用者' AND duration = '3個月';
UPDATE products SET price = 900 WHERE platform = 'Netflix' AND version = '獨享使用者' AND duration = '6個月';
UPDATE products SET price = 1680 WHERE platform = 'Netflix' AND version = '獨享使用者' AND duration = '12個月';
UPDATE products SET price = 160 WHERE platform = 'Netflix' AND version = '共用使用者' AND duration = '1個月';
UPDATE products SET price = 400 WHERE platform = 'Netflix' AND version = '共用使用者' AND duration = '3個月';
UPDATE products SET price = 700 WHERE platform = 'Netflix' AND version = '共用使用者' AND duration = '6個月';
UPDATE products SET price = 1280 WHERE platform = 'Netflix' AND version = '共用使用者' AND duration = '12個月';
UPDATE products SET price = 700 WHERE platform = 'Netflix' AND version = '額外成員' AND duration = '3個月';
UPDATE products SET price = 1300 WHERE platform = 'Netflix' AND version = '額外成員' AND duration = '6個月';
UPDATE products SET price = 2400 WHERE platform = 'Netflix' AND version = '額外成員' AND duration = '12個月';

-- 同步更新成本
UPDATE products SET cost = 250 WHERE platform = 'YouTube Premium' AND version = '個人版' AND duration = '3個月';
UPDATE products SET cost = 500 WHERE platform = 'YouTube Premium' AND version = '個人版' AND duration = '6個月';
UPDATE products SET cost = 900 WHERE platform = 'YouTube Premium' AND version = '個人版' AND duration = '12個月';
UPDATE products SET cost = 80 WHERE platform = 'YouTube Premium' AND version = '家庭版' AND duration = '1個月';
UPDATE products SET cost = 450 WHERE platform = 'YouTube Premium' AND version = '家庭版' AND duration = '6個月';
UPDATE products SET cost = 700 WHERE platform = 'YouTube Premium' AND version = '家庭版' AND duration = '12個月';
UPDATE products SET cost = 900 WHERE platform = 'Spotify Premium' AND version = '家庭版' AND duration = '12個月';
UPDATE products SET cost = 150 WHERE platform = 'Discord Nitro' AND version = '登入版' AND duration = '1個月';
UPDATE products SET cost = 1100 WHERE platform = 'Discord Nitro' AND version = '登入版' AND duration = '12個月';
UPDATE products SET cost = 1050 WHERE platform = 'Discord Nitro' AND version = '免登版' AND duration = '12個月';
UPDATE products SET cost = 225 WHERE platform = 'Discord Nitro' AND version = '贈禮版' AND duration = '1個月';
UPDATE products SET cost = 2250 WHERE platform = 'Discord Nitro' AND version = '贈禮版' AND duration = '12個月';
UPDATE products SET cost = 105 WHERE platform = 'Discord Nitro' AND version = '兩次加成' AND duration = '3個月';
UPDATE products SET cost = 92 WHERE platform = 'Netflix' AND version = '獨享使用者' AND duration = '1個月';
UPDATE products SET cost = 276 WHERE platform = 'Netflix' AND version = '獨享使用者' AND duration = '3個月';
UPDATE products SET cost = 552 WHERE platform = 'Netflix' AND version = '獨享使用者' AND duration = '6個月';
UPDATE products SET cost = 1104 WHERE platform = 'Netflix' AND version = '獨享使用者' AND duration = '12個月';
UPDATE products SET cost = 92 WHERE platform = 'Netflix' AND version = '共用使用者' AND duration = '1個月';
UPDATE products SET cost = 276 WHERE platform = 'Netflix' AND version = '共用使用者' AND duration = '3個月';
UPDATE products SET cost = 552 WHERE platform = 'Netflix' AND version = '共用使用者' AND duration = '6個月';
UPDATE products SET cost = 1104 WHERE platform = 'Netflix' AND version = '共用使用者' AND duration = '12個月';
UPDATE products SET cost = 300 WHERE platform = 'Netflix' AND version = '額外成員' AND duration = '3個月';
UPDATE products SET cost = 600 WHERE platform = 'Netflix' AND version = '額外成員' AND duration = '6個月';
UPDATE products SET cost = 1200 WHERE platform = 'Netflix' AND version = '額外成員' AND duration = '12個月';
