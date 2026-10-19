-- First-run tour remembered per account (not per browser): the moment the person closed the 4-card tour. Null = not seen yet.
-- Optional and feature-detected: without it the app remembers the tour in localStorage keyed by the account id.
alter table public.accounts add column if not exists tour_seen_at timestamptz;
