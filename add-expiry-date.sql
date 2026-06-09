-- Add expiry_date column to orders table (if not already exists)
-- Run this in Supabase SQL Editor

ALTER TABLE orders ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Create index for efficient expiry queries
CREATE INDEX IF NOT EXISTS idx_orders_expiry ON orders (expiry_date) WHERE expiry_date IS NOT NULL;
