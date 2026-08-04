create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  chunk_index integer not null,
  chunk_words integer not null,
  overlap_words integer not null,
  start_word integer not null default 0,
  end_word integer not null default 0,
  word_count integer not null default 0,
  semantic_score double precision not null default 0,
  keywords text[] not null default '{}',
  content text not null default '',
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index, chunk_words, overlap_words)
);

create index if not exists idx_document_chunks_document_id on document_chunks(document_id);
create index if not exists idx_document_chunks_subject_id on document_chunks(subject_id);
create index if not exists idx_document_chunks_chunk_config on document_chunks(chunk_words, overlap_words);