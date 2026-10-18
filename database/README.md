# 本次增量結構

這四份 SQL 為同一批正式更新的可審查來源，按檔名前綴順序合併並由維護者在一筆交易中套用。尚未套用正式資料庫。

1. `20261018124833_phase1_quick_notes.sql`
2. `20261018125328_phase1_shared_state_products.sql`
3. `20261018131210_finance_persistence_audit.sql`
4. `20261018132424_operations_history.sql`

先完成正式資料備份與恢復驗證，再更新結構，最後更新前端。不可重複套用已成功的同批 Migration；也不可把 `20261012051019_local_baseline.sql` 套到正式庫。舊業務資料不重建；同專案其他小工具的表格不變動。

回退前端時保留增量結構及新資料，不自行執行 DROP 或用舊備份覆蓋新訂單。正式套用後，記錄實際 Migration 名稱與版本，後續維護先核對 migration history。
