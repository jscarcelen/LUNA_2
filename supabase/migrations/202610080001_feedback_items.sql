-- Temporary beta feedback tool (see apps/web/modules/feedback/README.md; drop this table when the tool is removed).
-- One row per piece of feedback a tester sends from inside the app. Service-role only (RLS on, no policies).
create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id uuid,
  author_name text not null default '',
  signed_in boolean not null default false,
  kind text not null default 'idea',
  message text not null default '',
  quote text not null default '',
  target jsonb,
  area text not null default '',
  page text not null default '',
  role text not null default '',
  location text not null default '',
  viewport text not null default '',
  context jsonb,
  screenshot text,
  has_screenshot boolean not null default false,
  status text not null default 'new',
  admin_note text not null default ''
);
create index if not exists feedback_items_status_created_idx on public.feedback_items (status, created_at desc);
alter table public.feedback_items enable row level security;
