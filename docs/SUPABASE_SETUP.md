# Supabase Setup

This project now includes a Supabase backend scaffold for real tables + queries.

## 1) Create Supabase project

1. Create a project in Supabase.
2. Copy:
   - Project URL
   - anon key
   - service role key

## 2) Configure environment variables

Copy values into your local env file (or Vercel env vars):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LUNA_DEMO_USER_ID` (UUID for development ownership)

You can start from `.env.example`.

## 3) Create database schema

Apply SQL migration:

- `supabase/migrations/202608040001_init_luna.sql`
- `supabase/migrations/202608040002_add_folder_hierarchy.sql`
- `supabase/migrations/202608040003_add_document_folder_map.sql`
- `supabase/migrations/202608040004_add_topic_tag_color.sql`
- `supabase/migrations/202608040005_add_workspace_subject_color.sql`
- `supabase/migrations/202608040006_add_document_chunks.sql`
- `supabase/migrations/202608040007_add_document_chunk_embeddings.sql`
- `supabase/migrations/202608040008_add_document_source_type.sql`

This creates:

- `workspaces`
- `subjects`
- `folders`
- `folders.parent_folder_id` (subfolder support)
- `topic_tags`
- `documents`
- `document_tags`
- `document_folders` (document-to-many-folders assignment)
- `document_chunks` (persisted overlapping text chunks for AI retrieval)
- `document_chunks.embedding` via pgvector for vector similarity retrieval
- `documents.source_type` to distinguish uploaded vs generated workspace documents

## 3.1) Optional embedding env vars

- `OPENAI_API_KEY` for upload-time chunk embeddings and query embeddings
- `LUNA_EMBEDDING_MODEL` optional override, defaults to `text-embedding-3-small`

## 4) Test connectivity

Start web app and check:

- `GET /api/supabase/health`

Expected:

- `{ "ok": true, "configured": true }`

## 5) Test backend CRUD route

Use:

- `GET /api/workspaces-supabase`
- `POST /api/workspaces-supabase` with `action` and `payload`

Supported actions currently mirror the mock route:

- create/rename/remove workspace
- create/rename/remove subject
- create/rename/remove folder and subfolder
- add/rename/remove topic tag
- upload/rename/remove document
- assign uploaded documents to one or many folders

## Notes

- This route uses app-local repository functions in `apps/web/lib/workspacesRepository.js`.
- Delete safety checks return `409` + `requiresForce` for workspace/subject when related data exists.
- Workspace UI is connected to `/api/workspaces-supabase`.
