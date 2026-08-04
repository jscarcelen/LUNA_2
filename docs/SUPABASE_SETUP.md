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

This creates:

- `workspaces`
- `subjects`
- `folders`
- `folders.parent_folder_id` (subfolder support)
- `topic_tags`
- `documents`
- `document_tags`

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

## Notes

- This route uses `@luna/database` repository functions.
- Delete safety checks return `409` + `requiresForce` for workspace/subject when related data exists.
- Existing frontend still points to `/api/workspaces` (mock). You can switch UI to `/api/workspaces-supabase` once your Supabase env + migration are ready.
