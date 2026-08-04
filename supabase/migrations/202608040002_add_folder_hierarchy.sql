alter table folders
  add column if not exists parent_folder_id uuid references folders(id) on delete cascade;

create index if not exists idx_folders_parent_folder_id on folders(parent_folder_id);
