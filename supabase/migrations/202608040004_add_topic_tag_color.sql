alter table topic_tags
add column if not exists color text not null default '#ffd66b';
