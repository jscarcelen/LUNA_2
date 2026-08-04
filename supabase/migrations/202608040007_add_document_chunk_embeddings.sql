create extension if not exists vector;

alter table document_chunks
add column if not exists embedding vector(1536);

create index if not exists idx_document_chunks_embedding_cosine
on document_chunks using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

create or replace function match_document_chunks(
  query_embedding vector(1536),
  match_count integer,
  filter_document_ids uuid[] default null,
  filter_chunk_words integer default 500,
  filter_overlap_words integer default 150
)
returns table (
  document_id uuid,
  subject_id uuid,
  chunk_index integer,
  chunk_words integer,
  overlap_words integer,
  start_word integer,
  end_word integer,
  word_count integer,
  semantic_score double precision,
  keywords text[],
  content text,
  similarity double precision
)
language sql
stable
as $$
  select
    dc.document_id,
    dc.subject_id,
    dc.chunk_index,
    dc.chunk_words,
    dc.overlap_words,
    dc.start_word,
    dc.end_word,
    dc.word_count,
    dc.semantic_score,
    dc.keywords,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.embedding is not null
    and dc.chunk_words = filter_chunk_words
    and dc.overlap_words = filter_overlap_words
    and (filter_document_ids is null or dc.document_id = any(filter_document_ids))
  order by dc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;