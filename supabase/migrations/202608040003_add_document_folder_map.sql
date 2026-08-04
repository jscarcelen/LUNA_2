create table if not exists document_folders (
  document_id uuid not null references documents(id) on delete cascade,
  folder_id uuid not null references folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (document_id, folder_id)
);

create index if not exists idx_document_folders_document_id on document_folders(document_id);
create index if not exists idx_document_folders_folder_id on document_folders(folder_id);

insert into document_folders (document_id, folder_id)
select id, folder_id
from documents
where folder_id is not null
on conflict do nothing;
