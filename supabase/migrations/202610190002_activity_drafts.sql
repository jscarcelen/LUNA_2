-- "Save and finish later" for quizzes: the answers of a quiz the learner started and has not submitted.
-- One row per account and activity; submitting deletes it. A draft is never an attempt (attempts/attempt_results
-- stay the only thing Progress counts), so it lives in its own table.
-- Optional and feature-detected: without it the player keeps drafts in localStorage keyed by account + activity,
-- and /api/activities/drafts answers { setupNeeded: true } so the browser copy is used.
create table if not exists public.activity_drafts (
  owner_user_id uuid not null,                                         -- the account answering (session account id)
  activity_document_id uuid not null references public.documents(id) on delete cascade,
  draft jsonb not null,                                                -- { v, answers, confidence, work (text only), index, elapsedMs, durations, answered, total, updatedAt }
  answered int not null default 0,
  total int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, activity_document_id)
);
create index if not exists idx_activity_drafts_owner on public.activity_drafts(owner_user_id, updated_at desc);
alter table public.activity_drafts enable row level security;
