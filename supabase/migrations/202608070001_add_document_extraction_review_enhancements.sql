alter table documents
  add column if not exists source_preview text,
  add column if not exists extraction_risk_markers jsonb not null default '[]'::jsonb;

create index if not exists idx_documents_extraction_risk_markers
on documents using gin (extraction_risk_markers);