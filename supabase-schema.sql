-- 代儲管理系統 Supabase Schema
-- Run this in Supabase SQL Editor to create all tables

-- 商品定價表
create table if not exists products (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  platform text not null,
  version text not null default '',
  duration text not null default '',
  cost numeric not null default 0,
  price numeric not null default 0,
  fee_type text not null default '百分比',
  fee_value numeric not null default 0,
  status text not null default '啟用',
  required_info text default '',
  notes text default '',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 出單人設定
create table if not exists agents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  commission_type text not null default '百分比',
  commission_value numeric not null default 0,
  notes text default '',
  created_at timestamptz default now()
);

-- 客戶管理
create table if not exists customers (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  contact text default '',
  platform text default '',
  notes text default '',
  created_at timestamptz default now()
);

-- 訂單記錄
create table if not exists orders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  order_date date not null default current_date,
  order_no text not null,
  agent_id uuid references agents(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  channel text not null default '8591',  -- 8591 | 個人
  status text not null default '處理中',
  product_id uuid references products(id) on delete set null,
  platform text not null default '',
  version text not null default '',
  duration text not null default '',
  qty int not null default 1,
  unit_price numeric not null default 0,
  unit_cost numeric not null default 0,
  fee_type text not null default '百分比',
  fee_value numeric not null default 0,
  commission_type text not null default '百分比',
  commission_value numeric not null default 0,
  expiry_date date,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 廣告支出
create table if not exists ads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  ad_date date not null default current_date,
  amount numeric not null default 0,
  ad_platform text default '',
  notes text default '',
  created_at timestamptz default now()
);

-- RLS policies
alter table products enable row level security;
alter table agents enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table ads enable row level security;

create policy "Users manage own products" on products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own agents" on agents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own customers" on customers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own orders" on orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own ads" on ads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Indexes
create index if not exists idx_orders_user_date on orders(user_id, order_date desc);
create index if not exists idx_orders_status on orders(user_id, status);
create index if not exists idx_products_user on products(user_id, status);
create index if not exists idx_ads_user_date on ads(user_id, ad_date desc);
