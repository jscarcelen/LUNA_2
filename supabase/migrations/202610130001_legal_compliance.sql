-- Legal compliance (docs/LEGAL_COMPLIANCE_PLAN.md): age gate, guardian consent, terms acceptance, deletion.
-- Every column is optional/defaulted, so applying this changes nothing for existing accounts. The app feature-detects it.

alter table public.accounts add column if not exists birth_date date;
-- Under 18: drives the extra protections (no marketplace, no public sharing, strictest AI privacy). Derived from birth_date
-- when there is one, otherwise from the age/under_13 the person gave.
alter table public.accounts add column if not exists is_minor boolean not null default false;
alter table public.accounts add column if not exists terms_version text;
alter table public.accounts add column if not exists terms_accepted_at timestamptz;
-- Set when a parent/guardian confirmed the account of a child under 14 (GDPR/LOPDGDD art. 7, COPPA).
alter table public.accounts add column if not exists guardian_confirmed_at timestamptz;
-- "Delete my account": the account is erased for good once this date passes (30-day grace period, can be cancelled by logging in).
alter table public.accounts add column if not exists deletion_scheduled_at timestamptz;

-- A child under 14 cannot open an account alone. Until a parent/guardian confirms, the only thing stored is this row:
-- the child's first name, birth date, the guardian's email and the hash of the confirmation link. It is deleted when
-- the link is used or after 48 hours. No IP address, no cookie and no child email is kept.
create table if not exists public.guardian_consents (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  guardian_email text not null,
  student_name text not null,
  birth_date date not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_guardian_consents_expires on public.guardian_consents(expires_at);
create index if not exists idx_guardian_consents_email on public.guardian_consents(guardian_email);
alter table public.guardian_consents enable row level security;
