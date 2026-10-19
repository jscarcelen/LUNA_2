-- Defence in depth, like 202610130002 (RLS on every table). LUNA calls the database only from the server with the
-- service-role key, so the public API roles never need to run these functions. They are SECURITY INVOKER (RLS still
-- applies to whoever calls them), but revoking EXECUTE means an exposed anon key cannot even reach them. Safe to re-run.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('match_document_chunks', 'delete_share_grants_for_item', 'check_account_group_member', 'drop_group_members_of_link')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
  end loop;
end $$;
