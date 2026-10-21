-- AI credits and storage meters (top bar). Optional and feature-detected: without this migration the meters show
-- "not set up yet", nothing is limited and every AI route works as before.
--
-- ai_usage_events: one row per request that called a model provider (OpenAI, Anthropic, Mathpix), with the tokens
-- the provider reported, summed over every call the request made. The monthly allowance is computed from it.
create table if not exists public.ai_usage_events (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null,          -- the account (session account id) or the demo owner
  activity text not null,               -- creating | studyPlans | askLuna | grading | readingFiles | coach | templates | concepts | other
  tokens int not null default 0,
  calls int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_usage_events_owner on public.ai_usage_events(owner_user_id, created_at desc);
alter table public.ai_usage_events enable row level security;

-- Storage per document of one owner: what each row really takes in the database (compressed, as Postgres stores it)
-- for the document itself, its search index (chunks + embeddings) and its saved downloads. Read-only.
create or replace function public.account_storage_by_document(p_owner uuid)
returns table (document_id uuid, name text, source_type text, subject_name text, document_bytes bigint, index_bytes bigint, export_bytes bigint)
language sql stable security invoker set search_path = public as $$
  select d.id, d.name, coalesce(d.source_type, ''), s.name,
         pg_column_size(d.*)::bigint,
         coalesce((select sum(pg_column_size(c.*)) from document_chunks c where c.document_id = d.id), 0)::bigint,
         coalesce((select sum(pg_column_size(e.*)) from generated_document_exports e where e.document_id = d.id), 0)::bigint
  from documents d
  join subjects s on s.id = d.subject_id
  join workspaces w on w.id = s.workspace_id
  where w.owner_user_id = p_owner
$$;
revoke execute on function public.account_storage_by_document(uuid) from public, anon, authenticated;
