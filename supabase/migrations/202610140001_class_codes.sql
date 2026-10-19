-- Class join codes: a teacher creates a class (an account_group, see 202610070001) and gets a 6-letter code. A student
-- who enters the code is connected to the teacher (teacher_student, already accepted, no per-student request) and added
-- to the class. Needs 202610070001_groups_exam_dates.sql (account_groups, account_group_members) applied first.
--
-- 1. class_codes: one row per class (group_id). `code` is unique, 6 letters from an unambiguous alphabet (no I, O, L, Q, U, V);
--    `enabled` lets the teacher switch joining off; regenerating the code replaces it. `school_consent_*` is the teacher's
--    confirmation that the school holds parental consent for students under 14 who join with this code: only classes
--    with it set let an under-14 join without the guardian-email flow. It stores who confirmed and when.
-- 2. class_joins: audit trail, one row per student who joined a class with its code, remembering whether the join
--    relied on the school's consent (`school_consent`), so the school-consent route can be audited.
--
-- Access stays service-role only (RLS enabled, no policies), like the other accounts tables. Safe to run twice.

create table if not exists public.class_codes (
  group_id uuid primary key references public.account_groups(id) on delete cascade,
  owner_id uuid not null references public.accounts(id) on delete cascade,
  code text not null check (code ~ '^[A-Z]{6}$'),
  enabled boolean not null default true,
  school_consent_at timestamptz,
  school_consent_by uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_codes_consent_pair check ((school_consent_at is null) = (school_consent_by is null))
);

create unique index if not exists idx_class_codes_code on public.class_codes(code);
create index if not exists idx_class_codes_owner on public.class_codes(owner_id);

create table if not exists public.class_joins (
  group_id uuid not null references public.account_groups(id) on delete cascade,
  student_id uuid not null references public.accounts(id) on delete cascade,
  school_consent boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (group_id, student_id)
);

create index if not exists idx_class_joins_student on public.class_joins(student_id);

alter table public.class_codes enable row level security;
alter table public.class_joins enable row level security;
