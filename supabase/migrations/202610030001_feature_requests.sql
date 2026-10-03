-- Requests the assistant could not serve ("not covered by Luna now") so the Luna team can pick them up.
create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid,
  source text not null default 'assistant',
  summary text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);
alter table public.feature_requests enable row level security;
