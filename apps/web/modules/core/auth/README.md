# Core Auth Module

Authentication is implemented in `apps/web/lib/` (`accountsCore.js`, `session.js`) and
`apps/web/app/api/accounts/*`, and documented in `docs/ACCOUNTS.md`: email + password, scrypt, signed
HttpOnly session cookie, `ownerUserIdFor(request)`. This folder stays a placeholder for moving that
behind a provider (Supabase Auth or similar) later.
