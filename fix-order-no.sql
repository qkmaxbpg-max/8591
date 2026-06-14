-- 將既有訂單的 order_no 更新為 MWJ-00001 格式
-- 按建立時間排序，依序編號
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM orders
)
UPDATE orders
SET order_no = 'MWJ-' || LPAD(numbered.rn::text, 5, '0')
FROM numbered
WHERE orders.id = numbered.id;
