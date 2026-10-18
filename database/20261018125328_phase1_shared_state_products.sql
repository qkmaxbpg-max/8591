begin;
create table public.mwj_app_state (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), store_id uuid references public.stores(id),
 kind text not null check(kind in ('catalog','preferences')), payload jsonb not null check(jsonb_typeof(payload)='object'),
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index mwj_state_scope on public.mwj_app_state(user_id,coalesce(store_id,'00000000-0000-0000-0000-000000000000'::uuid),kind);
alter table public.mwj_app_state enable row level security;
revoke all on public.mwj_app_state from anon;
grant select,insert,update on public.mwj_app_state to authenticated;
create policy mwj_state_owner on public.mwj_app_state for all to authenticated using(user_id=(select auth.uid()) and (store_id is null or exists(select 1 from public.stores s where s.id=store_id and s.user_id=(select auth.uid())))) with check(user_id=(select auth.uid()) and (store_id is null or exists(select 1 from public.stores s where s.id=store_id and s.user_id=(select auth.uid()))));
create trigger mwj_state_version before update on public.mwj_app_state for each row execute function public.mwj_note_version();
create function public.mwj_save_products(p_store uuid,p_rows jsonb,p_expected jsonb,p_group text,p_catalog jsonb,p_revision integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; v public.products; v_state public.mwj_app_state; v_owner uuid := auth.uid();
begin
 if v_owner is null then raise exception 'Authentication required';end if;
 if p_revision is null or p_revision<0 then raise exception 'Catalog revision required';end if;
 if p_store is not null and not exists(select 1 from public.stores where id=p_store and user_id=v_owner) then raise exception 'Invalid store';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>200 then raise exception 'Invalid product batch';end if;
 if jsonb_typeof(p_expected) is distinct from 'array' or jsonb_typeof(p_catalog) is distinct from 'object' or jsonb_typeof(p_catalog->'categories') is distinct from 'array' or jsonb_typeof(p_catalog->'assignments') is distinct from 'object' then raise exception 'Invalid catalog';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||coalesce(p_store::text,''),0));
 select * into v_state from public.mwj_app_state where user_id=v_owner and store_id is not distinct from p_store and kind='catalog' for update;
 if (v_state.id is null and p_revision<>0) or (v_state.id is not null and v_state.revision<>p_revision) then raise exception 'Catalog changed; reload';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_rows) x)<>jsonb_array_length(p_rows) then raise exception 'Duplicate IDs';end if;
 if p_group is not null and (select count(*) from public.products where user_id=v_owner and store_id is not distinct from p_store and platform=p_group)<>jsonb_array_length(p_expected) then raise exception 'Product group changed';end if;
 for r in select * from jsonb_array_elements(p_expected) loop
  select * into v from public.products where id=(r->>'id')::uuid and user_id=v_owner and store_id is not distinct from p_store for update;
  if v.id is null or v.updated_at is distinct from (r->>'updated_at')::timestamptz then raise exception 'Product changed; reload';end if;
  if p_group is not null and v.platform<>p_group then raise exception 'Invalid group member';end if;
  if not exists(select 1 from jsonb_array_elements(p_rows) x where x->>'id'=r->>'id') then raise exception 'Existing products cannot be removed';end if;
 end loop;
 for r in select * from jsonb_array_elements(p_rows) loop
  if length(btrim(coalesce(r->>'platform','')))=0 or length(btrim(coalesce(r->>'duration','')))=0 or r->>'status' not in ('啟用','停用') then raise exception 'Invalid product';end if;
  if coalesce(r->>'cost','') !~ '^\d+(\.\d{1,2})?$' or coalesce(r->>'price','') !~ '^\d+(\.\d{1,2})?$' or coalesce(r->>'shopee_price','') !~ '^\d+(\.\d{1,2})?$' then raise exception 'Invalid amount precision';end if;
  if (r->>'cost')::numeric<0 or (r->>'price')::numeric<0 or (r->>'shopee_price')::numeric<0 then raise exception 'Negative amount';end if;
  if exists(select 1 from jsonb_array_elements(p_expected) x where x->>'id'=r->>'id') then
   update public.products set platform=r->>'platform',version=r->>'version',duration=r->>'duration',cost=(r->>'cost')::numeric,price=(r->>'price')::numeric,shopee_price=(r->>'shopee_price')::numeric,status=r->>'status',required_info=r->>'required_info',notes=r->>'notes',updated_at=clock_timestamp() where id=(r->>'id')::uuid and user_id=v_owner and store_id is not distinct from p_store;
  else
   insert into public.products(id,user_id,store_id,platform,version,duration,cost,price,shopee_price,status,required_info,notes,fee_type,fee_value)
   values((r->>'id')::uuid,v_owner,p_store,r->>'platform',r->>'version',r->>'duration',(r->>'cost')::numeric,(r->>'price')::numeric,(r->>'shopee_price')::numeric,r->>'status',r->>'required_info',r->>'notes','百分比',0.03);
  end if;
 end loop;
 if exists(select 1 from public.products where user_id=v_owner and store_id is not distinct from p_store group by lower(regexp_replace(platform,'\s','','g')),lower(regexp_replace(version,'\s','','g')),lower(regexp_replace(duration,'\s','','g')) having count(*)>1) then raise exception 'Duplicate product options; reload and resolve';end if;
 if v_state.id is null then insert into public.mwj_app_state(user_id,store_id,kind,payload) values(v_owner,p_store,'catalog',p_catalog) returning * into v_state;
 else update public.mwj_app_state set payload=p_catalog where id=v_state.id returning * into v_state;end if;
 return jsonb_build_object('revision',v_state.revision);
end;
$$;
revoke all on function public.mwj_save_products(uuid,jsonb,jsonb,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.mwj_save_products(uuid,jsonb,jsonb,text,jsonb,integer) to authenticated;
commit;
