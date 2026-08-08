alter table documents
  add column if not exists source_mime_type text,
  add column if not exists source_content_base64 text,
  add column if not exists source_render_html text;