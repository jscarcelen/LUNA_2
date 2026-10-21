-- Messages from a teacher (or parent) to their students and to those students' parents.
--
-- class_messages: one row per recipient, like exam_dates. The rows of one send share `batch_id`.
--   audience   'student' = the message went to the student; 'parent' = to a parent of `about_student_id`.
--   about_student_id  the student the row is about (the recipient itself for audience 'student'); a parent only
--                     reads it while they are still connected to that student as their parent.
--   group_id   the group it was sent to (informational: deleting the group keeps the message).
--   read_at    the recipient opened their notifications or messages after it arrived ("seen by 9 of 12").
--   hidden_at  the recipient removed it from their list.
--   revoked_at the sender deleted the message: nobody sees it any more.
-- Access stays service-role only (RLS enabled, no policies), exactly like the other accounts tables.
-- Safe to run twice.

create table if not exists public.class_messages (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null default gen_random_uuid(),
  sender_id uuid not null references public.accounts(id) on delete cascade,
  recipient_id uuid not null references public.accounts(id) on delete cascade,
  about_student_id uuid not null references public.accounts(id) on delete cascade,
  audience text not null check (audience in ('student', 'parent')),
  group_id uuid references public.account_groups(id) on delete set null,
  subject text not null check (char_length(btrim(subject)) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  hidden_at timestamptz,
  revoked_at timestamptz,
  constraint class_messages_not_self check (sender_id <> recipient_id)
);

create index if not exists idx_class_messages_recipient on public.class_messages(recipient_id, created_at desc) where revoked_at is null;
create index if not exists idx_class_messages_sender on public.class_messages(sender_id, batch_id);
create unique index if not exists idx_class_messages_once on public.class_messages(batch_id, recipient_id);
create index if not exists idx_class_messages_about on public.class_messages(about_student_id);
create index if not exists idx_class_messages_group on public.class_messages(group_id) where group_id is not null;

alter table public.class_messages enable row level security;
