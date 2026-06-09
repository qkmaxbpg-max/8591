-- Add expiry_date and account_info columns to orders table
-- Run this in Supabase SQL Editor

ALTER TABLE orders ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS account_info TEXT DEFAULT '';

-- Create index for efficient expiry queries
CREATE INDEX IF NOT EXISTS idx_orders_expiry ON orders (expiry_date) WHERE expiry_date IS NOT NULL;
