-- Security linter 0011: pin search_path so the function cannot be hijacked by
-- a caller's role-level search_path. `vector` lives in public, so keep it visible.
alter function match_document_chunks(vector, integer, uuid[], integer, integer)
  set search_path = public;
