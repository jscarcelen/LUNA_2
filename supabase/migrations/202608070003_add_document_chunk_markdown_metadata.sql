alter table document_chunks
  add column if not exists token_count integer not null default 0,
  add column if not exists section text not null default '',
  add column if not exists heading_path text[] not null default '{}',
  add column if not exists page_number integer,
  add column if not exists content_markdown text not null default '';

update document_chunks
set
  token_count = case when token_count > 0 then token_count else greatest(1, word_count) end,
  content_markdown = case when content_markdown <> '' then content_markdown else coalesce(content, '') end
where token_count = 0
   or content_markdown = '';

create index if not exists idx_document_chunks_section on document_chunks(section);

drop function if exists match_document_chunks(vector, integer, uuid[], integer, integer);

create or replace function match_document_chunks(
  query_embedding vector(1536),
  match_count integer,
  filter_document_ids uuid[] default null,
  filter_chunk_words integer default 700,
  filter_overlap_words integer default 80
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
  token_count integer,
  semantic_score double precision,
  keywords text[],
  section text,
  heading_path text[],
  page_number integer,
  content text,
  content_markdown text,
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
    dc.token_count,
    dc.semantic_score,
    dc.keywords,
    dc.section,
    dc.heading_path,
    dc.page_number,
    dc.content,
    dc.content_markdown,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.embedding is not null
    and dc.chunk_words = filter_chunk_words
    and dc.overlap_words = filter_overlap_words
    and (filter_document_ids is null or dc.document_id = any(filter_document_ids))
  order by dc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
