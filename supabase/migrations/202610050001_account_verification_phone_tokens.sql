-- Email confirmation, password reset, a phone number per account, "last seen" for the bell, and the
-- timestamps that keep notification emails from repeating. Builds on 202610040001_accounts_links_sharing.sql.
--
-- Safe to apply while the app is running: the code feature-detects these columns, so sign-in and sign-up
-- keep working before this runs (without confirmation, phone or reset) and switch on right after.
-- Access stays service-role only: RLS is enabled on the new table with no policies.
--
-- Existing accounts are NOT marked as confirmed (nobody has proved their email yet): they confirm through
-- the "Verify your email" banner. To trust a specific existing account without an email, run once:
--   update public.accounts set email_verified_at = now() where email = 'someone@example.com';

alter table public.accounts
  add column if not exists email_verified_at timestamptz,
  -- E.164 ("+14155552671"), normalised by the app. One account per phone (unique index below).
  add column if not exists phone text,
  -- Stays null until an SMS provider exists and a code has been checked: today nothing proves the number.
  add column if not exists phone_verified_at timestamptz,
  -- Sessions issued before this moment are refused (a password change signs everyone else out).
  add column if not exists password_changed_at timestamptz,
  -- The bell: anything newer than this counts as unread.
  add column if not exists notifications_seen_at timestamptz,
  -- Connection requests typed at sign-up, sent once the email is confirmed: [{ "email": "...", "relation": "student" }].
  add column if not exists pending_invites jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_phone_e164') then
    alter table public.accounts add constraint accounts_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
  end if;
end $$;

-- One email <-> one phone. Accounts without a phone are not constrained.
create unique index if not exists accounts_phone_unique on public.accounts (phone) where phone is not null;

alter table public.account_links
  -- When the "X wants to connect" (or invitation) email was last sent for this pair, and the "accepted" one.
  add column if not exists notified_at timestamptz,
  add column if not exists accepted_notified_at timestamptz;

-- One-time tokens. Only the SHA-256 hash of the token is stored; the token itself lives only in the email.
create table if not exists public.account_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('verify_email', 'reset_password')),
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint account_tokens_hash_unique unique (token_hash)
);

create index if not exists idx_account_tokens_account_kind on public.account_tokens(account_id, kind);
create index if not exists idx_account_tokens_expires on public.account_tokens(expires_at);

alter table public.account_tokens enable row level security;

-- Make PostgREST see the new columns and table right away.
notify pgrst, 'reload schema';
