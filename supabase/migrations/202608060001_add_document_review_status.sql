alter table documents
  add column if not exists review_status text not null default 'approved',
  add column if not exists extraction_confidence double precision not null default 1,
  add column if not exists extraction_method text,
  add column if not exists extraction_issues jsonb not null default '[]'::jsonb,
  add column if not exists extraction_requires_review boolean not null default false,
  add column if not exists reviewed_at timestamptz;

alter table documents
  drop constraint if exists documents_review_status_check;

alter table documents
  add constraint documents_review_status_check
  check (review_status in ('approved', 'needs_review', 'rejected'));

create index if not exists idx_documents_review_status
on documents(review_status);

create index if not exists idx_documents_extraction_requires_review
on documents(extraction_requires_review);