alter table documents
  add column if not exists content_template_id uuid,
  add column if not exists content_blocks_json jsonb,
  add column if not exists content_blocks_schema_version text;

create table if not exists document_block_templates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name text not null,
  description text not null default '',
  container_class text not null default '',
  block_classes jsonb not null default '{}'::jsonb,
  css text not null default '',
  source_document_id uuid references documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, name)
);

create index if not exists idx_documents_content_template_id on documents(content_template_id);
create index if not exists idx_document_block_templates_owner on document_block_templates(owner_user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_content_template_id_fkey'
  ) then
    alter table documents
      add constraint documents_content_template_id_fkey
      foreign key (content_template_id)
      references document_block_templates(id)
      on delete set null;
  end if;
end $$;
