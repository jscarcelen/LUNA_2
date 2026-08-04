create extension if not exists pgcrypto;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists topic_tags (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, tag)
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  name text not null,
  content text not null default '',
  preview text not null default '',
  size_bytes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_tags (
  document_id uuid not null references documents(id) on delete cascade,
  topic_tag_id uuid not null references topic_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (document_id, topic_tag_id)
);

create index if not exists idx_workspaces_owner_user_id on workspaces(owner_user_id);
create index if not exists idx_subjects_workspace_id on subjects(workspace_id);
create index if not exists idx_folders_subject_id on folders(subject_id);
create index if not exists idx_documents_subject_id on documents(subject_id);
create index if not exists idx_documents_folder_id on documents(folder_id);
create index if not exists idx_topic_tags_subject_id on topic_tags(subject_id);
create index if not exists idx_document_tags_document_id on document_tags(document_id);
create index if not exists idx_document_tags_topic_tag_id on document_tags(topic_tag_id);
