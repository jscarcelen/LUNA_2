# AI Tools Pipeline

This folder now contains the first working configurable AI pipeline slice, starting with Quiz Generator.

The important design rule is: the pipeline stages stay stable, while each tool changes only its configuration, retrieval prompt, and rendering template.

## Current working flow

1. Scope selection
- The UI lets the user choose workspace, subject, folders/subfolders, tags, and specific documents.
- The backend resolves that scope into a concrete list of documents.

2. Chunking
- Documents are first normalized to Markdown as the canonical internal representation.
- Semantic chunking preserves heading hierarchy, lists, tables, fenced code blocks, and equation blocks.
- Current default persisted index: ~700 token target chunks with ~80 token overlap.
- Implemented in `chunking.js`.
- Uploaded study documents are chunked and persisted using this Markdown-first semantic profile.

3. Semantic grading / ranking
- Each chunk receives an intrinsic semantic quality score based on lexical density and keyword richness.
- When embeddings are configured, chunks also store vector embeddings at upload time.
- Retrieval then ranks by vector similarity first and reranks with user topic prompt plus selected tags.
- Implemented in `retrieval.js`.

4. RAG context selection
- The pipeline first tries to reuse persisted chunk rows from `document_chunks`.
- If embeddings are configured and the default chunk profile is being used, it runs vector similarity search over persisted chunks.
- It then reranks those matches with prompt/tag heuristics.
- If the scope is missing persisted rows or the requested chunk config differs from the default upload-time index, it falls back to on-the-fly chunking.

5. Generator/provider step
- If `OPENAI_API_KEY` is configured, quiz generation uses OpenAI chat completions first.
- Default quiz model is `gpt-4o-mini` (override with `LUNA_QUIZ_MODEL`).
- If OpenAI fails (credits, limits, parse, or provider error), generation automatically falls back to `local-heuristic-v1`.
- It produces strict quiz JSON using the same schema every time.
- Implemented in `provider-openai.js` and `provider-local.js`.

6. Rendering/export step
- The JSON is passed into renderers that own presentation only.
- The JSON provides content labels and values.
- The renderer/template provides format, layout, typography, and export structure.
- Implemented in `../render/exporters.js` and `../render/templates/quiz-generator-v1.js`.

## Files

- `workspaceSource.js`: loads workspace/document source data from Supabase or mock storage
- `chunking.js`: overlapping chunker for TXT study documents
- `retrieval.js`: query scoring and top chunk selection
- `provider-local.js`: local deterministic provider that outputs quiz JSON
- `quizGenerator.js`: orchestration entry point for the quiz pipeline

## JSON-first contract

The generator must output a stable content structure.

Example shape:
- `quiz.title`
- `quiz.instructions`
- `quiz.questions[]`
- `quiz.answerKey[]`

The renderer should never invent content.
The renderer only formats fields from the JSON.

## Why this scales

To add summaries, flashcards, worksheets, etc. the pipeline remains the same:

1. resolve scope
2. chunk documents
3. rank/retrieve relevant chunks
4. run a provider with a different output contract
5. send the resulting JSON into the corresponding renderer

Only these change per tool:
- the user configuration form
- the retrieval prompt/topic framing
- the generator/provider instructions
- the output JSON schema
- the rendering template family

## Current MVP limitation

Chunk persistence is now supported through the `document_chunks` table.

Embedding persistence is supported when:
- migration `202608040007_add_document_chunk_embeddings.sql` is applied
- `OPENAI_API_KEY` is configured

Default embedding model:
- `text-embedding-3-small`
- override with `LUNA_EMBEDDING_MODEL`

Fallback rules:
- default quiz chunk config reuses persisted chunks when available
- custom chunk config recomputes chunks on demand
- missing chunk rows fall back to on-the-fly chunking
- missing embeddings fall back to non-vector retrieval

That keeps the same pipeline contract while making default generation faster and reusable across quiz, summaries, and flashcards.
