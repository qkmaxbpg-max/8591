-- A supplier can be selected before the eventual payment account is known.
do $migration$
declare
  definition text;
  old_rule constant text := 'k in (''payments'',''cashEntries'',''defaults'') and coalesce(r->>''account_id'','''')=''''';
  new_rule constant text := 'k in (''payments'',''cashEntries'') and coalesce(r->>''account_id'','''')=''''';
begin
  select pg_get_functiondef('public.mwj_commit_finance(uuid,jsonb,integer,uuid,text,uuid)'::regprocedure) into strict definition;
  if strpos(definition,old_rule)=0 or strpos(substr(definition,strpos(definition,old_rule)+length(old_rule)),old_rule)>0 then
    raise exception 'Unexpected finance function version';
  end if;
  execute replace(definition,old_rule,new_rule);
end
$migration$;
