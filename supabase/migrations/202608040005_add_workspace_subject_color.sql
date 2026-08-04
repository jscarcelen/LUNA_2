alter table workspaces
add column if not exists color text not null default '#2f6db2';

alter table subjects
add column if not exists color text not null default '#2a5f9e';
