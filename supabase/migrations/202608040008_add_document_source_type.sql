alter table documents
add column if not exists source_type text not null default 'uploaded';

create index if not exists idx_documents_source_type
on documents(source_type);