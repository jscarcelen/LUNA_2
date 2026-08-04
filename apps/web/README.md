# Web App

Purpose:
- Main end-user platform UI for students and teachers.

Current implementation:
- Next.js app router scaffold.
- Placeholder UI inspired by attached LUNA UI demo.
- Client-side role switch and page navigation only.
- Workspace management flow backed by mock API persistence.
- Workspace and subject full CRUD (including rename and delete).
- Subject organization: create, edit, and delete folders and topic tags.
- Document table actions: rename, remove, preview modal.
- Mock persistence via API route (`/api/workspaces`) backed by local JSON datastore.

Missing:
- Real data integration.
- Authentication and authorization.
- API and backend wiring.
- AI execution and RAG results.
- Persistent document storage and ingestion pipeline.

Notes:
- Current "persistence" is mock-level and file-based for local development.
- Deleting workspace/subject with related data requires explicit force confirmation flow.
