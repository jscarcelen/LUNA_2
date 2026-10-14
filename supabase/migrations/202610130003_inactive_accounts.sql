-- Inactive accounts (docs/LEGAL_COMPLIANCE_PLAN.md, retention): when did the person last sign in, and were they warned.
-- Existing accounts start "active now", so nobody is warned until 24 months after this migration. Feature-detected by the app.
alter table public.accounts add column if not exists last_login_at timestamptz not null default now();
alter table public.accounts add column if not exists inactivity_warned_at timestamptz;
create index if not exists idx_accounts_last_login on public.accounts(last_login_at);
