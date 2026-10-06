-- Groups of students (teacher / parent) and exam dates sent to students.
--
-- 1. account_groups + account_group_members: a teacher or parent clusters the students they are connected
--    to (teacher_student / parent_student, accepted) into named groups. A student can be in many groups.
--    A member must be an accepted guardian-link student of the owner AT ALL TIMES: the application checks it on
--    every read (a group view never shows a student whose link ended), and two triggers back it up here
--    (no insert without such a link; the memberships go when the link stops being accepted). A group holds at
--    most 200 students.
-- 2. exam_dates: a teacher or parent sends an exam date (title, date, subject/topic name, notes) to a student.
--    One row per recipient; the rows of one send share `batch_id` (what the sender edits or cancels as one
--    item). `group_id` remembers the group it was sent to (informational: deleting the group keeps the date).
--    The recipient accepts it into a study plan (`exam_date_plans`) or dismisses it.
-- 3. exam_date_plans: which of the recipient's study plans are linked to an exam date, so that when the sender
--    changes the date or cancels it the plans can be updated.
--
-- Access stays service-role only (RLS enabled, no policies), exactly like the other accounts tables.
-- Safe to run twice.

-- ---------------------------------------------------------------- 1. groups

create table if not exists public.account_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  colour text not null default '#0071e3',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A name is unique per owner (case-insensitive), so "Group A" cannot exist twice.
create unique index if not exists idx_account_groups_owner_name on public.account_groups(owner_id, lower(btrim(name)));
create index if not exists idx_account_groups_owner on public.account_groups(owner_id);

create table if not exists public.account_group_members (
  group_id uuid not null references public.account_groups(id) on delete cascade,
  member_id uuid not null references public.accounts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, member_id)
);

create index if not exists idx_account_group_members_member on public.account_group_members(member_id);

alter table public.account_groups enable row level security;
alter table public.account_group_members enable row level security;

-- A member must be a student the owner is connected to as their teacher / parent (accepted), and a group holds at most 200.
create or replace function public.check_account_group_member()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  group_owner uuid;
  member_count integer;
begin
  select owner_id into group_owner from public.account_groups where id = new.group_id;
  if group_owner is null then
    raise exception 'That group does not exist.';
  end if;
  if not exists (
    select 1
    from public.account_links l
    join public.accounts m on m.id = new.member_id and m.role = 'student'
    where l.status = 'accepted'
      and l.kind in ('teacher_student', 'parent_student')
      and ((l.requester_id = group_owner and l.target_id = new.member_id) or (l.requester_id = new.member_id and l.target_id = group_owner))
  ) then
    raise exception 'Only a student you are connected to as their teacher or parent can be in a group.';
  end if;
  select count(*) into member_count from public.account_group_members where group_id = new.group_id;
  if member_count >= 200 then
    raise exception 'A group holds at most 200 students.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_account_group_member_check on public.account_group_members;
create trigger trg_account_group_member_check before insert on public.account_group_members
  for each row execute function public.check_account_group_member();

-- The membership ends with the link: when a connection stops being accepted, the student leaves that
-- person's groups.
create or replace function public.drop_group_members_of_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from 'accepted' and old.status = 'accepted' then
    delete from public.account_group_members m
    using public.account_groups g
    where m.group_id = g.id
      and ((g.owner_id = new.requester_id and m.member_id = new.target_id) or (g.owner_id = new.target_id and m.member_id = new.requester_id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_account_links_group_members on public.account_links;
create trigger trg_account_links_group_members after update of status on public.account_links
  for each row execute function public.drop_group_members_of_link();

-- ---------------------------------------------------------------- 2. exam dates

create table if not exists public.exam_dates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null default gen_random_uuid(),
  sender_id uuid not null references public.accounts(id) on delete cascade,
  recipient_id uuid not null references public.accounts(id) on delete cascade,
  group_id uuid references public.account_groups(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  exam_date date not null,
  subject_hint text,
  notes text,
  -- A plan or material the sender shared (live) together with the date; informational.
  shared_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The sender cancelled it.
  revoked_at timestamptz,
  -- The recipient planned for it / hid it.
  accepted_at timestamptz,
  dismissed_at timestamptz,
  constraint exam_dates_not_self check (sender_id <> recipient_id)
);

create index if not exists idx_exam_dates_recipient on public.exam_dates(recipient_id) where revoked_at is null;
create index if not exists idx_exam_dates_sender on public.exam_dates(sender_id, batch_id);
create unique index if not exists idx_exam_dates_live on public.exam_dates(batch_id, recipient_id);

alter table public.exam_dates enable row level security;

-- ---------------------------------------------------------------- 3. plans linked to an exam date

create table if not exists public.exam_date_plans (
  exam_date_id uuid not null references public.exam_dates(id) on delete cascade,
  plan_document_id uuid not null references public.documents(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (exam_date_id, plan_document_id)
);

create index if not exists idx_exam_date_plans_plan on public.exam_date_plans(plan_document_id);

alter table public.exam_date_plans enable row level security;
