begin;
alter table public.orders add column renewal_parent_id uuid references public.orders(id),add column purchase_kind text check(purchase_kind in ('first','renewal'));
alter table public.service_accounts add column seat_events jsonb not null default '[]';
alter table public.ad_configs add column periods jsonb,add column revision integer not null default 1;
create function public.mwj_order_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare ref uuid;target record;account public.service_accounts;d date:=(now() at time zone 'Asia/Taipei')::date;
begin
 if new.user_id is distinct from auth.uid() then raise exception 'Invalid owner';end if;
 perform pg_advisory_xact_lock(hashtextextended('orders/'||new.user_id::text||coalesce(new.store_id::text,''),0));
 if new.store_id is not null and not exists(select 1 from public.stores where id=new.store_id and user_id=new.user_id) then raise exception 'Invalid store';end if;
 if TG_OP='INSERT' or new.qty is distinct from old.qty or new.unit_price is distinct from old.unit_price or new.unit_cost is distinct from old.unit_cost then
  if new.qty is null or new.qty<=0 or new.qty>1000000 or new.unit_price is null or new.unit_price<0 or new.unit_price>999999999 or new.unit_cost is null or new.unit_cost<0 or new.unit_cost>999999999 then raise exception 'Invalid order quantity/amount';end if;
 end if;
 if (TG_OP='INSERT' or new.start_date is distinct from old.start_date or new.expiry_date is distinct from old.expiry_date) and new.expiry_date<coalesce(new.start_date,new.order_date) then raise exception 'Invalid order service dates';end if;
 if (TG_OP='INSERT' or new.order_no is distinct from old.order_no) and exists(select 1 from public.orders where user_id=new.user_id and store_id is not distinct from new.store_id and order_no=new.order_no and id<>new.id) then raise exception 'Order number already exists; reload';end if;
 if new.renewal_parent_id is not null then
  if new.renewal_parent_id=new.id or not exists(select 1 from public.orders p where p.id=new.renewal_parent_id and p.user_id=new.user_id and p.store_id is not distinct from new.store_id and p.customer_id is not distinct from new.customer_id) then raise exception 'Invalid renewal parent';end if;
  if exists(with recursive chain as(select id,renewal_parent_id,1 depth from public.orders where id=new.renewal_parent_id union all select o.id,o.renewal_parent_id,c.depth+1 from public.orders o join chain c on o.id=c.renewal_parent_id where c.depth<256) select 1 from chain where id=new.id or depth=256) then raise exception 'Renewal cycle';end if;
  if new.status not in ('已取消','已退款') and exists(select 1 from public.orders where renewal_parent_id=new.renewal_parent_id and id<>new.id and status not in ('已取消','已退款')) then raise exception 'Renewal already exists';end if;
 end if;
 if new.product_id is not null and not exists(select 1 from public.products where id=new.product_id and user_id=new.user_id and store_id is not distinct from new.store_id) then raise exception 'Invalid product reference';end if;
 if new.customer_id is not null and not exists(select 1 from public.customers where id=new.customer_id and user_id=new.user_id and store_id is not distinct from new.store_id) then raise exception 'Invalid customer reference';end if;
 if new.agent_id is not null and not exists(select 1 from public.agents where id=new.agent_id and user_id=new.user_id and store_id is not distinct from new.store_id) then raise exception 'Invalid agent reference';end if;
 if new.service_account_id is not null then
  select * into account from public.service_accounts where id=new.service_account_id and user_id=new.user_id and store_id is not distinct from new.store_id for update;
  if account.id is null or new.seat_number is null or new.seat_number<1 or new.seat_number>account.max_seats then raise exception 'Invalid seat';end if;
  if new.status not in ('已取消','已退款') and (TG_OP='INSERT' or new.service_account_id is distinct from old.service_account_id or new.seat_number is distinct from old.seat_number or new.start_date is distinct from old.start_date or new.expiry_date is distinct from old.expiry_date or new.status is distinct from old.status) then
   if exists(select 1 from public.orders o where o.id<>new.id and o.service_account_id=new.service_account_id and o.seat_number=new.seat_number and o.status not in ('已取消','已退款') and coalesce(o.start_date,o.order_date)<=coalesce(new.expiry_date,'infinity'::date) and coalesce(o.expiry_date,'infinity'::date)>=coalesce(new.start_date,new.order_date) and not(o.id=new.renewal_parent_id and coalesce(new.start_date,new.order_date)>=o.expiry_date) and not exists(select 1 from jsonb_array_elements(account.seat_events) e where e->>'undone_at' is null and e->'order_ids' ? o.id::text)) then raise exception 'Seat already assigned in this period';end if;
  end if;
 end if;
 if TG_OP='UPDATE' then new.updated_at:=clock_timestamp();end if;
 return new;
end;
$$;
revoke all on function public.mwj_order_guard() from public,anon,authenticated;
create trigger mwj_order_guard before insert or update on public.orders for each row execute function public.mwj_order_guard();
create function public.mwj_seat_event(p_account uuid,p_seat integer,p_undo uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.service_accounts;events jsonb;event jsonb;ids jsonb;known jsonb;display_name text;number text;d date:=(now() at time zone 'Asia/Taipei')::date;
begin
 select * into a from public.service_accounts where id=p_account and user_id=auth.uid() for update;
 if a.id is null or p_seat<1 or p_seat>a.max_seats then raise exception 'Invalid account/seat';end if;
 events:=a.seat_events;
 select coalesce(jsonb_agg(o.id::text),'[]') into known from public.orders o where o.service_account_id=a.id and o.seat_number=p_seat and o.status not in ('已取消','已退款');
 if p_undo is not null then
  select x into event from jsonb_array_elements(events) x where x->>'id'=p_undo::text and (x->>'seat')::integer=p_seat and x->>'undone_at' is null;
  if event is null then raise exception 'Release event missing';end if;
  if exists(select 1 from public.orders o where o.service_account_id=a.id and o.seat_number=p_seat and o.status='已完成' and coalesce(o.start_date,o.order_date)<=d and o.expiry_date>=d) then raise exception 'Seat already in use';end if;
  if exists(select 1 from jsonb_array_elements_text(known) x where not(event->'known_order_ids' ? x)) then raise exception 'Seat has a new arrangement';end if;
  select jsonb_agg(case when x->>'id'=p_undo::text then x||jsonb_build_object('undone_at',now()) else x end) into events from jsonb_array_elements(events) x;
 else
  if exists(select 1 from public.orders o where o.service_account_id=a.id and o.seat_number=p_seat and o.status='已完成' and coalesce(o.start_date,o.order_date)<=d and o.expiry_date>=d and not exists(select 1 from jsonb_array_elements(events) e where e->>'undone_at' is null and e->'order_ids' ? o.id::text)) then raise exception 'Seat still in use';end if;
  select coalesce(jsonb_agg(o.id::text),'[]') into ids from public.orders o where o.service_account_id=a.id and o.seat_number=p_seat and o.status='已完成' and o.expiry_date<d and not exists(select 1 from jsonb_array_elements(events) e where e->>'undone_at' is null and e->'order_ids' ? o.id::text);
  if jsonb_array_length(ids)=0 then raise exception 'No expired seat assignment';end if;
  select c.name,o.order_no into display_name,number from public.orders o left join public.customers c on c.id=o.customer_id where ids ? o.id::text order by o.expiry_date desc limit 1;
  event:=jsonb_build_object('id',gen_random_uuid(),'seat',p_seat,'order_ids',ids,'known_order_ids',known,'customer_name',coalesce(display_name,''),'order_no',coalesce(number,''),'released_at',now(),'undone_at',null);
  events:=events||jsonb_build_array(event);
 end if;
 update public.service_accounts set seat_events=events where id=a.id;
 return events;
end;
$$;
revoke all on function public.mwj_seat_event(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.mwj_seat_event(uuid,integer,uuid) to authenticated;
create function public.mwj_ad_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare r jsonb;last_end date;
begin
 if new.user_id is distinct from auth.uid() then raise exception 'Invalid ad owner';end if;
 if new.store_id is not null and not exists(select 1 from public.stores where id=new.store_id and user_id=new.user_id) then raise exception 'Invalid ad store';end if;
 if new.periods is not null then
  if jsonb_typeof(new.periods)<>'array' or jsonb_array_length(new.periods)>5000 then raise exception 'Invalid ad periods';end if;
  for r in select * from jsonb_array_elements(new.periods) loop
   if (r->>'start')::date is null or coalesce((r->>'rate')::numeric,0)<=0 or (r->>'rate')::numeric>999999999 or ((r->>'end') is not null and (r->>'end')::date<(r->>'start')::date) or (last_end is not null and (r->>'start')::date<=last_end) then raise exception 'Invalid ad interval';end if;
   last_end:=coalesce((r->>'end')::date,'infinity'::date);
  end loop;
 end if;
 if TG_OP='UPDATE' then new.revision:=old.revision+1;end if;
 return new;
end;
$$;
revoke all on function public.mwj_ad_guard() from public,anon,authenticated;
create trigger mwj_ad_guard before insert or update on public.ad_configs for each row execute function public.mwj_ad_guard();
create function public.mwj_protect_finance_reference() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_TABLE_NAME='products' then
  if exists(select 1 from public.mwj_finance_state s,jsonb_array_elements(s.payload->'defaults') d where s.user_id=old.user_id and d->>'product_id'=old.id::text) then raise exception 'Product has finance defaults; disable instead';end if;
 elsif TG_TABLE_NAME='service_accounts' then
  if exists(select 1 from public.mwj_finance_state s,jsonb_array_elements(s.payload->'purchases') p where s.user_id=old.user_id and p->>'service_account_id'=old.id::text) then raise exception 'Account has purchase records; preserve history';end if;
 else
  if exists(select 1 from public.mwj_finance_state s where s.user_id=old.user_id and (exists(select 1 from jsonb_array_elements(s.payload->'purchases') p where p->>'order_id'=old.id::text) or exists(select 1 from jsonb_array_elements(coalesce(s.payload->'afterSales','[]')) p where p->>'order_id'=old.id::text) or exists(select 1 from jsonb_array_elements(coalesce(s.payload->'cashEntries','[]')) p where p->>'order_id'=old.id::text))) then raise exception 'Order has finance records; preserve order and use cancellation/refund';end if;
 end if;
 return old;
end;
$$;
revoke all on function public.mwj_protect_finance_reference() from public,anon,authenticated;
create trigger mwj_product_finance_reference before delete on public.products for each row execute function public.mwj_protect_finance_reference();
create trigger mwj_order_finance_reference before delete on public.orders for each row execute function public.mwj_protect_finance_reference();
create trigger mwj_account_finance_reference before delete on public.service_accounts for each row execute function public.mwj_protect_finance_reference();
commit;
