-- A deliberately blank product cost is unknown, distinct from zero.
do $migration$
declare
  definition text;
  old_rule constant text := $rule$coalesce(r->>'cost','') !~ '^\d+(\.\d{1,2})?$'$rule$;
  new_rule constant text := $rule$(r->>'cost' is not null and (r->>'cost') !~ '^\d+(\.\d{1,2})?$')$rule$;
begin
  perform set_config('lock_timeout','5s',true);
  select pg_get_functiondef('public.mwj_save_products(uuid,jsonb,jsonb,text,jsonb,integer)'::regprocedure) into strict definition;
  if strpos(definition,old_rule)=0 then raise exception 'Unexpected product save function version'; end if;
  alter table public.products alter column cost drop not null;
  execute replace(definition,old_rule,new_rule);
end
$migration$;
