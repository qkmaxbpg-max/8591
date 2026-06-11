-- 廣告設定表（取代手動逐筆記錄）
create table if not exists ad_configs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  platform text not null default '',
  daily_cost numeric not null default 0,
  start_date date not null default current_date,
  end_date date default null,
  active boolean not null default true,
  notes text default '',
  created_at timestamptz default now()
);

alter table ad_configs enable row level security;
create policy "Users manage own ad_configs" on ad_configs for all using (auth.uid() = user_id);
