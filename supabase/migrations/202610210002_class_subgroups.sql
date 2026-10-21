-- Groups inside a class: a teacher splits a class into smaller groups ("Readers", "Table 2") to send work or let
-- one part of the class see material.
--
-- A class is a top-level account_groups row; a group inside it is another account_groups row with parent_group_id set
-- to the class. Its members are always some of the class's members (the application checks it on every write, and a
-- student taken out of the class leaves its groups too). One level only: the application refuses a group inside a
-- group inside a class. Deleting the class deletes the groups inside it (never a student).
--
-- Additive and safe to run twice. Without it the app keeps working; only "Create a group in this class" answers
-- 503 setupNeeded naming this file.

alter table public.account_groups
  add column if not exists parent_group_id uuid references public.account_groups(id) on delete cascade;

alter table public.account_groups drop constraint if exists account_groups_parent_not_self;
alter table public.account_groups
  add constraint account_groups_parent_not_self check (parent_group_id is null or parent_group_id <> id);

create index if not exists idx_account_groups_parent on public.account_groups(parent_group_id) where parent_group_id is not null;
