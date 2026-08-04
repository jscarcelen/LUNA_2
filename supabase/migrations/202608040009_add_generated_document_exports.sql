create table if not exists generated_document_exports (
  document_id uuid not null references documents(id) on delete cascade,
  format text not null,
  mime_type text not null,
  file_name text not null,
  content_base64 text not null default '',
  created_at timestamptz not null default now(),
  primary key (document_id, format)
);

create index if not exists idx_generated_document_exports_document_id
on generated_document_exports(document_id);