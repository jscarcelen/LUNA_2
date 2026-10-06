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
- `LUNA_DEMO_USER_ID` (UUID of the public demo's owner; real accounts own their data by account id)
- `LUNA_SESSION_SECRET` (32+ random characters; signs the log-in cookie; required in production)

You can start from `.env.example`.

## 3) Create database schema

Apply the SQL migrations in order (all of `supabase/migrations/`):

- `202608040001_init_luna.sql`
- `202608040002_add_folder_hierarchy.sql`
- `202608040003_add_document_folder_map.sql`
- `202608040004_add_topic_tag_color.sql`
- `202608040005_add_workspace_subject_color.sql`
- `202608040006_add_document_chunks.sql`
- `202608040007_add_document_chunk_embeddings.sql`
- `202608040008_add_document_source_type.sql`
- `202608040009_add_generated_document_exports.sql`
- `202608060001_add_document_review_status.sql`
- `202608070001_add_document_extraction_review_enhancements.sql`
- `202608070002_add_document_source_visual_payload.sql`
- `202608070003_add_document_chunk_markdown_metadata.sql`
- `202608160001_add_document_block_editor_templates.sql`
- `202609160001_fix_match_document_chunks_search_path.sql`
- `202610030001_feature_requests.sql` (requests the chatbot cannot do yet; not applied until run)
- `202610040001_accounts_links_sharing.sql` (accounts, connections between accounts, sent/assigned items —
  **must be applied for `/platform` and sign-in to work**; until then the UI says "Accounts need one database
  step"; see `docs/ACCOUNTS.md`). Also set `LUNA_SESSION_SECRET` (32+ random characters) in the environment.
- `202610050001_account_verification_phone_tokens.sql` (email confirmation, password reset, one phone per
  account, sessions ended by a password change, the notification bell's "last seen", and the `account_tokens`
  table that holds only SHA-256 hashes of one-time links). **Optional until you want those features:** sign-in and
  sign-up keep working on the first accounts migration alone (the code detects the missing columns). Apply it, set
  the mail variables (`LUNA_SMTP_URL` or `RESEND_API_KEY`, plus `LUNA_MAIL_FROM`, `LUNA_PUBLIC_URL`) and read
  `docs/ACCOUNTS.md` ("Email, phone and password"). Existing accounts are not marked as confirmed.
- `202610060001_network_sharing_grants.sql` (the open network and sharing v2: the `peer` connection kind — the CHECK on
  `account_links.kind` is relaxed, `pair_key` stays unique per pair; the `share_grants` table of live view/edit shares of
  documents, folders and topics, with a trigger that removes the grants when the original is deleted; and `payload` /
  `imported_at` + wider `item_type` on `shared_items` for shared agents, templates and components). **Optional until you
  want those features, and safe to run twice:** without it everything that exists keeps working, connecting with anyone but
  teachers/parents/students and every sharing v2 action answer `503 setupNeeded` naming this file, and "Shared with me"
  does not appear. Run `get_advisors` (security + performance) afterwards; the new table has RLS enabled and, like the other
  accounts tables, no policies (service role only).

From Claude Code, use the Supabase MCP `apply_migration` tool against the "Luna" project
(ref `fekeupkjljbgimntxpnv`). Note: a Supabase free-tier project pauses after inactivity and must be
restored from the dashboard before the app or MCP tools can reach the database.

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
- `generated_document_exports` to store saved HTML/JSON/DOCX/PDF downloads for generated documents
- `documents` review status, extraction review fields and source visual payload
- `document_chunks` markdown metadata
- `document_block_templates` for the template builder / block editor

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
