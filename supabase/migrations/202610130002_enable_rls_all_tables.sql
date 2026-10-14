-- Defence in depth (docs/LEGAL_COMPLIANCE_PLAN.md L12). LUNA reaches the database only from the server with the service-role
-- key, which bypasses row level security. Turning RLS on, with no policies, means the public anon/authenticated API roles
-- can read and write nothing, even if an anon key or a PostgREST endpoint is ever exposed. Safe to re-run.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
