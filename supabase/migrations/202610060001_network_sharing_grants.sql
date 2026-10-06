-- Open network + live sharing with permissions ("Share v2").
--
-- 1. Connections are no longer limited to teacher<->student and parent<->student: any account can connect
--    with any other (kind 'peer'); teacher_student / parent_student stay meaningful for the role-specific
--    powers (assigning work, seeing a student's performance). The unique pair_key is kept.
-- 2. share_grants: LIVE shares of a document, a folder (with its whole subtree, including what is added
--    later) or a whole topic ('subject'), with a 'view' or 'edit' permission. The owner keeps ownership;
--    the grantee reads (and with 'edit' changes) the owner's original. Revoking is immediate (revoked_at).
-- 3. shared_items also records the COPIES of agents, templates and components (small JSON definitions, no
--    live sync): a component (custom blocks live in the browser) carries its definition in `payload`, which
--    the recipient's app imports into its own library on its next load (`imported_at`).
--
-- Access stays service-role only (RLS enabled, no policies), exactly like the other accounts tables.
-- Safe to run twice.

-- ---------------------------------------------------------------- 1. open network

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.account_links'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%kind%'
  loop
    execute format('alter table public.account_links drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.account_links
  add constraint account_links_kind_check check (kind in ('teacher_student', 'parent_student', 'peer'));

-- ---------------------------------------------------------------- 2. live shares

create table if not exists public.share_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.accounts(id) on delete cascade,
  grantee_id uuid not null references public.accounts(id) on delete cascade,
  -- Polymorphic reference (no foreign key): a trigger below removes the grants when the original is deleted.
  item_kind text not null check (item_kind in ('document', 'folder', 'subject')),
  item_id uuid not null,
  permission text not null default 'view' check (permission in ('view', 'edit')),
  -- The name when it was shared, only for notifications and the "Sharing" panel when the item is gone.
  item_name text,
  -- Last email about this grant (rate limit: one email per owner and grantee per hour).
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint share_grants_not_self check (owner_id <> grantee_id)
);

-- One live grant per person and item; a revoked one is kept (history) and a new share makes a new row.
create unique index if not exists idx_share_grants_live on public.share_grants(owner_id, grantee_id, item_kind, item_id) where revoked_at is null;
create index if not exists idx_share_grants_grantee on public.share_grants(grantee_id) where revoked_at is null;
create index if not exists idx_share_grants_owner on public.share_grants(owner_id) where revoked_at is null;
create index if not exists idx_share_grants_item on public.share_grants(item_kind, item_id);

alter table public.share_grants enable row level security;

-- Deleting the original removes the grants on it.
create or replace function public.delete_share_grants_for_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.share_grants where item_kind = tg_argv[0] and item_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_share_grants_document on public.documents;
create trigger trg_share_grants_document after delete on public.documents
  for each row execute function public.delete_share_grants_for_item('document');

drop trigger if exists trg_share_grants_folder on public.folders;
create trigger trg_share_grants_folder after delete on public.folders
  for each row execute function public.delete_share_grants_for_item('folder');

drop trigger if exists trg_share_grants_subject on public.subjects;
create trigger trg_share_grants_subject after delete on public.subjects
  for each row execute function public.delete_share_grants_for_item('subject');

-- ---------------------------------------------------------------- 3. shared components

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.shared_items'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%item_type%'
  loop
    execute format('alter table public.shared_items drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.shared_items
  add constraint shared_items_item_type_check check (item_type in ('document', 'resource', 'activity', 'plan', 'component', 'agent', 'template'));

alter table public.shared_items add column if not exists payload jsonb;
alter table public.shared_items add column if not exists imported_at timestamptz;

create index if not exists idx_shared_items_pending_components on public.shared_items(recipient_id) where item_type = 'component' and imported_at is null;
