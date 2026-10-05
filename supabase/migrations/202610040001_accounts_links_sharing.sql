-- Accounts, the links between them, and the log of what was shared / assigned.
--
-- Access today is service-role only (the Next.js server uses the service key); RLS is enabled with no
-- policies, so the anon and authenticated keys can read and write nothing here. When Supabase Auth
-- (or another provider) replaces the home-made email + password, add owner policies on accounts.id.
-- The account id is also what every other table already calls owner_user_id (no foreign key on
-- purpose: the demo owner is not an account).

create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  display_name text not null,
  role text not null check (role in ('student', 'teacher', 'parent')),
  -- A student who said they are under 13 must be linked to a parent; the app nags until they are.
  under_13 boolean not null default false,
  -- Failed log-ins in a row, and until when the account is locked after too many.
  failed_logins integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  constraint accounts_email_lowercase check (email = lower(email)),
  constraint accounts_email_unique unique (email)
);

-- One row per pair and kind, whoever asked first. A link is active only when status = 'accepted',
-- i.e. when the person who was asked said yes. Requests for an email that has no account yet are kept
-- with target_id null and attach when that person signs up.
create table if not exists public.account_links (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('teacher_student', 'parent_student')),
  requester_id uuid not null references public.accounts(id) on delete cascade,
  requester_email text not null,
  target_id uuid references public.accounts(id) on delete cascade,
  target_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  -- kind + the two emails sorted: makes the pair unique in both directions, even before the target exists.
  pair_key text not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint account_links_pair_unique unique (pair_key),
  constraint account_links_not_self check (requester_email <> target_email)
);

create index if not exists idx_account_links_requester on public.account_links(requester_id);
create index if not exists idx_account_links_target on public.account_links(target_id);
create index if not exists idx_account_links_target_email on public.account_links(target_email);

-- Everything one account sent to another: a share (read-only copy) or an assignment (copy + due date).
-- source_document_id / copy_document_id are plain references (set null when either document is deleted).
create table if not exists public.shared_items (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('share', 'assign')),
  item_type text not null check (item_type in ('document', 'resource', 'activity', 'plan')),
  title text not null,
  sender_id uuid not null references public.accounts(id) on delete cascade,
  recipient_id uuid not null references public.accounts(id) on delete cascade,
  link_id uuid references public.account_links(id) on delete set null,
  source_document_id uuid references public.documents(id) on delete set null,
  copy_document_id uuid references public.documents(id) on delete set null,
  due_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shared_items_sender on public.shared_items(sender_id, created_at desc);
create index if not exists idx_shared_items_recipient on public.shared_items(recipient_id, created_at desc);
-- Sending the same document to the same person again refreshes the copy instead of adding another.
create unique index if not exists idx_shared_items_once on public.shared_items(sender_id, recipient_id, source_document_id) where source_document_id is not null;

alter table public.accounts enable row level security;
alter table public.account_links enable row level security;
alter table public.shared_items enable row level security;
