begin;
create table public.mwj_finance_state(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),store_id uuid references public.stores(id),
 payload jsonb not null,revision integer not null default 1,updated_at timestamptz not null default now()
);
create unique index mwj_finance_scope on public.mwj_finance_state(user_id,coalesce(store_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.mwj_finance_events(
 id uuid primary key,user_id uuid not null references auth.users(id),store_id uuid references public.stores(id),
 revision integer not null,reason text not null,changes jsonb not null,request_hash text not null,reverses uuid references public.mwj_finance_events(id),created_at timestamptz not null default now(),
 unique(reverses)
);
create index mwj_finance_events_scope on public.mwj_finance_events(user_id,store_id,revision desc);
alter table public.mwj_finance_state enable row level security;
alter table public.mwj_finance_events enable row level security;
revoke all on public.mwj_finance_state,public.mwj_finance_events from anon,authenticated;
grant select on public.mwj_finance_state,public.mwj_finance_events to authenticated;
create policy mwj_finance_read on public.mwj_finance_state for select to authenticated using(user_id=(select auth.uid()) and (store_id is null or exists(select 1 from public.stores s where s.id=store_id and s.user_id=(select auth.uid()))));
create policy mwj_finance_events_read on public.mwj_finance_events for select to authenticated using(user_id=(select auth.uid()) and (store_id is null or exists(select 1 from public.stores s where s.id=store_id and s.user_id=(select auth.uid()))));
-- Narrow privileged boundary: writes only through this fully scoped function, never via client table grants.
create function public.mwj_commit_finance(p_store uuid,p_payload jsonb,p_revision integer,p_operation uuid,p_reason text,p_reverses uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); old public.mwj_finance_state; prior public.mwj_finance_events; k text;r jsonb;a jsonb;b jsonb;diff jsonb:='{}';patch jsonb;before_rows jsonb;after_rows jsonb;total numeric;limit_amount numeric;today_taipei date:=(now() at time zone 'Asia/Taipei')::date;
begin
 if owner is null then raise exception 'Authentication required';end if;
 if p_revision is null or p_revision<0 then raise exception 'Revision required';end if;
 if p_store is not null and not exists(select 1 from public.stores where id=p_store and user_id=owner) then raise exception 'Invalid store';end if;
 if p_operation is null or length(btrim(coalesce(p_reason,'')))=0 or length(p_reason)>1000 then raise exception 'Operation and reason required';end if;
 perform pg_advisory_xact_lock(hashtextextended('finance/'||owner::text||coalesce(p_store::text,''),0));
 select * into old from public.mwj_finance_state where user_id=owner and store_id is not distinct from p_store for update;
 select * into prior from public.mwj_finance_events where id=p_operation;
 if prior.id is not null then
  if prior.user_id<>owner or prior.store_id is distinct from p_store or prior.request_hash<>md5(p_payload::text) then raise exception 'Operation conflict';end if;
  return jsonb_build_object('revision',old.revision,'payload',old.payload,'replayed',true);
 end if;
 if (old.id is null and p_revision<>0) or (old.id is not null and old.revision<>p_revision) then raise exception 'Finance changed; reload';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or coalesce(p_payload->>'version','')<>'1' or octet_length(p_payload::text)>8000000 then raise exception 'Invalid finance document';end if;
 foreach k in array array['suppliers','accounts','purchases','payments','allocations','defaults','transfers','cashEntries','platformMonths','afterSales','supplierCredits','settings'] loop
  a:=coalesce(p_payload->k,'[]');
  if jsonb_typeof(a)<>'array' or jsonb_array_length(a)>50000 then raise exception 'Invalid finance collection';end if;
  if k<>'allocations' and (exists(select 1 from jsonb_array_elements(a) x where coalesce(x->>'id','')='' and k<>'defaults') or (select count(distinct coalesce(x->>'id',x->>'product_id')) from jsonb_array_elements(a) x)<>jsonb_array_length(a)) then raise exception 'Duplicate finance IDs';end if;
  for r in select * from jsonb_array_elements(a) loop
   if jsonb_typeof(r)<>'object' then raise exception 'Finance rows must be objects';end if;
   if k in ('purchases','payments','allocations','transfers','cashEntries','supplierCredits') and coalesce(r->>'amount','')!~'^\d+$' then raise exception 'Amount required';end if;
   if k in ('purchases','payments','transfers','cashEntries','afterSales','supplierCredits') and coalesce(r->>'date','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Date required';end if;
   if k in ('purchases','payments','defaults','supplierCredits') and coalesce(r->>'supplier_id','')='' then raise exception 'Supplier required';end if;
   if k in ('payments','cashEntries','defaults') and coalesce(r->>'account_id','')='' then raise exception 'Account required';end if;
   if k='suppliers' and length(btrim(coalesce(r->>'name','')))=0 then raise exception 'Supplier name required';end if;
   if k='defaults' and coalesce(r->>'mode','') not in ('individual','shared') then raise exception 'Invalid default mode';end if;
   if k='transfers' and coalesce(r->>'kind','') not in ('bank_transfer','card_repayment') then raise exception 'Invalid transfer kind';end if;
   if k='supplierCredits' and coalesce(r->>'kind','') not in ('opening','compensation') then raise exception 'Invalid supplier credit kind';end if;
   if k='settings' and (r->>'id'<>'accounting' or coalesce(r->>'start_date','')!~'^\d{4}-\d{2}-\d{2}$') then raise exception 'Invalid accounting setting';end if;
   if r?'amount' and (coalesce(r->>'amount','')!~'^\d+$' or (r->>'amount')::numeric>99999999999) then raise exception 'Invalid cents';end if;
   if k in ('payments','transfers','cashEntries','supplierCredits') and coalesce((r->>'amount')::numeric,0)<=0 then raise exception 'Amount must be positive';end if;
   if k='purchases' and coalesce(r->>'mode','') not in ('individual','shared') then raise exception 'Invalid purchase mode';end if;
   if k='payments' and coalesce(r->>'kind','') not in ('advance','settlement') then raise exception 'Invalid payment kind';end if;
   if k='cashEntries' and coalesce(r->>'kind','') not in ('receipt','expense','refund','compensation','capital_in','capital_out') then raise exception 'Invalid cash kind';end if;
   if k='settings' then perform (r->>'start_date')::date;end if;
   if r?'date' then
    if (r->>'date')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date';end if;
    perform (r->>'date')::date;
    if not coalesce((r->>'opening')::boolean,false) and coalesce(r->>'kind','')<>'opening' and exists(select 1 from jsonb_array_elements(coalesce(p_payload->'settings','[]')) z where z->>'id'='accounting' and (r->>'date')::date<(z->>'start_date')::date) then raise exception 'Transaction predates accounting start';end if;
    if (r->>'date')::date>today_taipei and not coalesce((r->>'opening')::boolean,false) and coalesce(r->>'kind','')<>'opening' then raise exception 'Future cash transaction';end if;
   end if;
   if coalesce(r->>'order_id','')<>'' and not exists(select 1 from public.orders o where o.id::text=r->>'order_id' and o.user_id=owner and o.store_id is not distinct from p_store) then raise exception 'Invalid order reference';end if;
   if coalesce(r->>'service_account_id','')<>'' and not exists(select 1 from public.service_accounts s where s.id::text=r->>'service_account_id' and s.user_id=owner and s.store_id is not distinct from p_store) then raise exception 'Invalid service account reference';end if;
   if k='defaults' and not exists(select 1 from public.products p where p.id::text=r->>'product_id' and p.user_id=owner and p.store_id is not distinct from p_store) then raise exception 'Invalid product default';end if;
   if r?'supplier_id' and not exists(select 1 from jsonb_array_elements(p_payload->'suppliers') s where s->>'id'=r->>'supplier_id') then raise exception 'Invalid supplier';end if;
   if r?'account_id' and not exists(select 1 from jsonb_array_elements(p_payload->'accounts') s where s->>'id'=r->>'account_id') then raise exception 'Invalid account';end if;
   if r?'account_id' and r?'date' then
    select x into b from jsonb_array_elements(p_payload->'accounts') x where x->>'id'=r->>'account_id';
    if coalesce(b->>'opening_date','')='' or (r->>'date')::date<(b->>'opening_date')::date then raise exception 'Account opening required before transaction';end if;
    if k='cashEntries' and b->>'kind'='card' and r->>'kind' not in ('expense','compensation') then raise exception 'Use bank for this cash kind';end if;
   end if;
   if k='purchases' and r->>'mode'='shared' then
    if coalesce(r->>'service_account_id','')='' or coalesce(r->>'service_start','')='' or coalesce(r->>'service_end','')='' or (r->>'service_end')::date<(r->>'service_start')::date or coalesce(r->>'order_id','')<>'' then raise exception 'Invalid shared period';end if;
   end if;
   if k='accounts' then
    if coalesce(r->>'kind','') not in ('bank','card') or length(btrim(coalesce(r->>'name','')))=0 then raise exception 'Invalid account kind/name';end if;
    if r?'opening_amount' and (coalesce(r->>'opening_amount','')!~'^\d+$' or coalesce(r->>'opening_date','')='') then raise exception 'Invalid account opening';end if;
    if r?'opening_date' then perform (r->>'opening_date')::date;end if;
    if (r->>'opening_amount')::numeric>99999999999 then raise exception 'Opening too large';end if;
    if coalesce(r->>'debit_account_id','')<>'' and not exists(select 1 from jsonb_array_elements(p_payload->'accounts') x where x->>'id'=r->>'debit_account_id' and x->>'kind'='bank') then raise exception 'Invalid card debit account';end if;
    if r->>'kind'='card' and ((r->>'close_day')::integer not between 1 and 31 or (r->>'due_day')::integer not between 1 and 31) then raise exception 'Invalid card statement dates';end if;
    select x into b from jsonb_array_elements(coalesce(old.payload->'accounts','[]')) x where x->>'id'=r->>'id';
    if b is not null and (b->>'kind' is distinct from r->>'kind' or b->>'opening_date' is distinct from r->>'opening_date' or b->>'opening_amount' is distinct from r->>'opening_amount') and exists(select 1 from jsonb_array_elements(coalesce(old.payload->'payments','[]')||coalesce(old.payload->'cashEntries','[]')||coalesce(old.payload->'transfers','[]')) x where x->>'account_id'=r->>'id' or x->>'from_id'=r->>'id' or x->>'to_id'=r->>'id') then raise exception 'Used account opening is immutable';end if;
   end if;
   if k='transfers' and (r->>'from_id'=r->>'to_id' or not exists(select 1 from jsonb_array_elements(p_payload->'accounts') s where s->>'id'=r->>'from_id' and s->>'kind'='bank') or not exists(select 1 from jsonb_array_elements(p_payload->'accounts') s where s->>'id'=r->>'to_id' and s->>'kind'=case when r->>'kind'='card_repayment' then 'card' else 'bank' end)) then raise exception 'Invalid transfer accounts';end if;
  end loop;
 end loop;
 if exists(select 1 from unnest(array['purchases','payments','cashEntries','transfers','platformMonths','afterSales','supplierCredits']) as kinds(kind_name),jsonb_array_elements(coalesce(p_payload->kinds.kind_name,'[]')) x where not coalesce((x->>'opening')::boolean,false) and coalesce(x->>'kind','')<>'opening') and not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'settings','[]')) x where x->>'id'='accounting') then raise exception 'Accounting start required';end if;
 for r in select * from jsonb_array_elements(coalesce(p_payload->'allocations','[]')) loop
  select x into a from jsonb_array_elements(p_payload->'purchases') x where x->>'id'=r->>'purchase_id';
  select x into b from jsonb_array_elements((p_payload->'payments')||coalesce(p_payload->'supplierCredits','[]')) x where x->>'id'=r->>'payment_id';
  if a is null or b is null or a->>'supplier_id'<>b->>'supplier_id' or (r->>'amount')::numeric<=0 then raise exception 'Invalid allocation';end if;
 end loop;
 for r in select * from jsonb_array_elements(p_payload->'purchases') loop
  select coalesce(sum((x->>'amount')::numeric),0) into total from jsonb_array_elements(coalesce(p_payload->'allocations','[]')) x where x->>'purchase_id'=r->>'id';
  if total>(r->>'amount')::numeric then raise exception 'Purchase overpaid';end if;
 end loop;
 for r in select * from jsonb_array_elements((p_payload->'payments')||coalesce(p_payload->'supplierCredits','[]')) loop
  select coalesce(sum((x->>'amount')::numeric),0) into total from jsonb_array_elements(coalesce(p_payload->'allocations','[]')) x where x->>'payment_id'=r->>'id';
  if total>(r->>'amount')::numeric or (r->>'kind'='settlement' and total<>(r->>'amount')::numeric) then raise exception 'Payment allocation mismatch';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'platformMonths','[]')) x group by x->>'platform',x->>'month' having count(*)>1) then raise exception 'Duplicate platform month';end if;
 for r in select * from jsonb_array_elements(coalesce(p_payload->'platformMonths','[]')) loop
  if coalesce(r->>'platform','') not in ('8591','蝦皮') or coalesce(r->>'month','')!~'^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid platform month';end if;
  foreach k in array array['opening','sales','fees','refunds','payout','closing'] loop
   if coalesce(r->>k,'')!~'^\d+$' or (r->>k)::numeric>99999999999 then raise exception 'Invalid monthly cents';end if;
  end loop;
  if coalesce(r->>'adjustment','')!~'^-?\d+$' or (r->>'closing')::numeric-((r->>'opening')::numeric+(r->>'sales')::numeric-(r->>'fees')::numeric-(r->>'refunds')::numeric+(r->>'adjustment')::numeric-(r->>'payout')::numeric) is distinct from (r->>'difference')::numeric then raise exception 'Monthly arithmetic mismatch';end if;
  if (r->>'payout')::numeric>0 and not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'cashEntries','[]')) x where x->>'platform_month_id'=r->>'id' and x->>'account_id'=r->>'account_id' and x->>'amount'=r->>'payout') then raise exception 'Missing platform receipt';end if;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(p_payload->'afterSales','[]')) where value->>'action'='refund' loop
  select coalesce(sum((x->>'amount')::numeric),0) into total from jsonb_array_elements(p_payload->'afterSales') x where x->>'order_id'=r->>'order_id' and x->>'action'='refund';
  select o.qty*o.unit_price*100 into limit_amount from public.orders o where o.id::text=r->>'order_id' and o.user_id=owner and o.store_id is not distinct from p_store;
  if total>limit_amount or limit_amount is null then raise exception 'Refund exceeds order';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_payload->'purchases') x where coalesce(x->>'order_id','')<>'' group by x->>'order_id' having count(*)>1) then raise exception 'Duplicate order purchase';end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'purchases') x join jsonb_array_elements(p_payload->'purchases') y on x->>'id'<y->>'id' and x->>'mode'='shared' and y->>'mode'='shared' and x->>'service_account_id'=y->>'service_account_id' and x->>'service_start'<=y->>'service_end' and x->>'service_end'>=y->>'service_start') then raise exception 'Overlapping shared purchase';end if;
 foreach k in array array['case_id','platform_month_id'] loop
  if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'cashEntries','[]')) x where coalesce(x->>k,'')<>'' group by x->>k having count(*)>1) then raise exception 'Duplicate linked cash entry';end if;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(p_payload->'afterSales','[]')) loop
  if coalesce(r->>'action','') not in ('refund','replace','extend') then raise exception 'Invalid after-sale action';end if;
  if coalesce(r->>'order_id','')='' or length(btrim(coalesce(r->>'reason','')))=0 then raise exception 'After-sale order and reason required';end if;
  if r->>'action'='refund' and coalesce((r->>'amount')::numeric,0)<=0 then raise exception 'Refund amount must be positive';end if;
  if coalesce(r->>'service_end','')<>'' and ((r->>'service_end')::date>(r->>'date')::date or r->>'action'<>'refund') then raise exception 'Invalid service termination';end if;
  if r->>'action'='extend' and coalesce((r->>'days')::integer,0) not between 1 and 3660 then raise exception 'Invalid service extension';end if;
  if coalesce(r->>'paid_at','')<>'' and (r->>'paid_at')::date<(r->>'date')::date then raise exception 'Refund payment predates case';end if;
  if coalesce(r->>'paid_at','')<>'' and not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'cashEntries','[]')) x where x->>'case_id'=r->>'id' and x->>'kind'='refund' and x->>'amount'=r->>'amount' and x->>'date'=r->>'paid_at') then raise exception 'Missing refund payment';end if;
 end loop;
 if old.id is not null and coalesce(old.payload->'settings','[]') is distinct from coalesce(p_payload->'settings','[]') and exists(select 1 from unnest(array['purchases','payments','cashEntries','transfers','platformMonths','supplierCredits']) as kinds(kind_name) where jsonb_array_length(coalesce(p_payload->kinds.kind_name,'[]'))>0) then raise exception 'Accounting start is locked after transactions';end if;
 for r in select * from jsonb_array_elements(p_payload->'accounts') where value->>'kind'='card' and value?'opening_date' loop
  for a in select distinct jsonb_build_object('date',x->>'date') from jsonb_array_elements(coalesce(p_payload->'transfers','[]')) x where x->>'kind'='card_repayment' and x->>'to_id'=r->>'id' and x->>'date'>=r->>'opening_date' loop
   total:=coalesce((r->>'opening_amount')::numeric,0);
   total:=total+coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(p_payload->'payments') x where x->>'account_id'=r->>'id' and x->>'date'>=r->>'opening_date' and x->>'date'<=a->>'date'),0);
   total:=total+coalesce((select sum(case when x->>'kind'='compensation' then -(x->>'amount')::numeric else (x->>'amount')::numeric end) from jsonb_array_elements(coalesce(p_payload->'cashEntries','[]')) x where x->>'account_id'=r->>'id' and x->>'date'>=r->>'opening_date' and x->>'date'<=a->>'date'),0);
   total:=total-coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(coalesce(p_payload->'transfers','[]')) x where x->>'to_id'=r->>'id' and x->>'kind'='card_repayment' and x->>'date'>=r->>'opening_date' and x->>'date'<=a->>'date'),0);
   if total<0 then raise exception 'Card repayment exceeds business balance';end if;
  end loop;
 end loop;
 -- Store only changed rows (before/after), not a full snapshot on every entry.
 foreach k in array array['suppliers','accounts','purchases','payments','allocations','defaults','transfers','cashEntries','platformMonths','afterSales','supplierCredits','settings'] loop
  before_rows:=coalesce(old.payload->k,'[]');after_rows:=coalesce(p_payload->k,'[]');
  if before_rows is distinct from after_rows then
   if k='allocations' then diff:=diff||jsonb_build_object(k,jsonb_build_object('before',before_rows,'after',after_rows));
   else
    select coalesce(jsonb_agg(x),'[]') into a from jsonb_array_elements(before_rows) x where not exists(select 1 from jsonb_array_elements(after_rows) y where y=x);
    select coalesce(jsonb_agg(x),'[]') into b from jsonb_array_elements(after_rows) x where not exists(select 1 from jsonb_array_elements(before_rows) y where y=x);
    diff:=diff||jsonb_build_object(k,jsonb_build_object('before',a,'after',b));
   end if;
  end if;
 end loop;
 if diff='{}' then raise exception 'No financial changes';end if;
 if p_reverses is not null then
  select * into prior from public.mwj_finance_events where id=p_reverses and user_id=owner and store_id is not distinct from p_store;
  if prior.id is null then raise exception 'Invalid correction target';end if;
 end if;
 if old.id is null then insert into public.mwj_finance_state(user_id,store_id,payload) values(owner,p_store,p_payload) returning * into old;
 else update public.mwj_finance_state set payload=p_payload,revision=revision+1,updated_at=clock_timestamp() where id=old.id returning * into old;end if;
 insert into public.mwj_finance_events(id,user_id,store_id,revision,reason,changes,request_hash,reverses) values(p_operation,owner,p_store,old.revision,btrim(p_reason),diff,md5(p_payload::text),p_reverses);
 return jsonb_build_object('revision',old.revision,'payload',old.payload,'replayed',false);
end;
$$;
revoke all on function public.mwj_commit_finance(uuid,jsonb,integer,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.mwj_commit_finance(uuid,jsonb,integer,uuid,text,uuid) to authenticated;
create function public.mwj_save_products_finance(p_store uuid,p_rows jsonb,p_expected jsonb,p_group text,p_catalog jsonb,p_revision integer,p_finance jsonb,p_finance_revision integer,p_operation uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; finance_result jsonb;
begin
 result:=public.mwj_save_products(p_store,p_rows,p_expected,p_group,p_catalog,p_revision);
 if p_finance is not null then finance_result:=public.mwj_commit_finance(p_store,p_finance,p_finance_revision,p_operation,'商品採購預設',null);end if;
 return result||jsonb_build_object('finance',finance_result);
end;
$$;
revoke all on function public.mwj_save_products_finance(uuid,jsonb,jsonb,text,jsonb,integer,jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.mwj_save_products_finance(uuid,jsonb,jsonb,text,jsonb,integer,jsonb,integer,uuid) to authenticated;
commit;
