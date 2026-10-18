-- LOCAL TEST FIRST. Not approved for production application.
begin;
create table public.mwj_quick_notes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 store_id uuid references public.stores(id),
 note_date date not null,
 product_text text not null check (char_length(btrim(product_text)) between 1 and 500),
 done boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 revision integer not null default 1 check (revision > 0)
);
alter table public.mwj_quick_notes enable row level security;
revoke all on public.mwj_quick_notes from anon;
grant select, insert, update, delete on public.mwj_quick_notes to authenticated;
create policy mwj_notes_owner on public.mwj_quick_notes for all to authenticated
 using (user_id=(select auth.uid()) and (store_id is null or exists(select 1 from public.stores s where s.id=store_id and s.user_id=(select auth.uid()))))
 with check (user_id=(select auth.uid()) and (store_id is null or exists(select 1 from public.stores s where s.id=store_id and s.user_id=(select auth.uid()))));
create index mwj_notes_owner_store_date on public.mwj_quick_notes(user_id,store_id,note_date desc);
create function public.mwj_note_version() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
  raise exception 'Note identity cannot change';
 end if;
 new.created_at := old.created_at;
 new.updated_at := clock_timestamp();
 new.revision := old.revision+1;
 return new;
end;
$$;
revoke all on function public.mwj_note_version() from public,anon,authenticated;
create trigger mwj_notes_version before update on public.mwj_quick_notes for each row execute function public.mwj_note_version();
commit;
