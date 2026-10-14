-- Teacher review of AI marks (docs/LEGAL_COMPLIANCE_PLAN.md, GDPR art. 22 / human in the loop).
-- A student can ask for one question's mark to be reviewed; a linked teacher (never a parent, never a peer) confirms or overrides it.
create table if not exists public.mark_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,                  -- the student whose answer it is
  activity_document_id uuid not null,
  question_id text not null,
  question_prompt text,
  given text,
  expected text,
  ai_correct boolean,                           -- what the AI decided
  status text not null default 'requested' check (status in ('requested','confirmed','overridden')),
  student_note text,
  final_correct boolean,                        -- what counts after the teacher decided
  teacher_note text,
  reviewer_id uuid,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (owner_user_id, activity_document_id, question_id)
);
create index if not exists idx_mark_reviews_owner on public.mark_reviews(owner_user_id, status);
alter table public.mark_reviews enable row level security;
