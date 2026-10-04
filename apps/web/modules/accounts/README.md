# Accounts module

UI and pure helpers for the real platform (`/platform`): connections between accounts, sharing and
assigning, and a connected student's read-only performance. See `docs/ACCOUNTS.md` for the data model,
flows and the setup step.

- `shared.js` — pure, imported by browser and server: the `shared-by:` / `assigned-by:` tags, "may a
  receiver save this edit" (`sharedEditAllowed`), what can be sent (`classifyDeliverable`), redaction of a
  student's tree for a parent/teacher.
- `api.js` — client for `/api/accounts/*`. `SetupNotice.js` — the "apply the migration" notice.
- `ConnectionsPage.js` — add by email, requests (accept/decline), sent (cancel), connected (remove), sent/received items.
- `LinkedStudentsPage.js` — "My students" / "My children": chips, `PerformancePage` read-only, plans overview.
- `ShareDialog.js` — "Share with…" / "Assign" from a workspace document or a study plan.
- `PlatformNotice.js`, `SharedNotice.js` — banner for under-13 students; "Shared by …" pill in the reader.

Server side lives in `apps/web/lib/` (`accountsCore.js`, `accountsRepository.js`, `sharingRepository.js`,
`workspaceGuard.js`, `session.js`, `resourceAccess.js`) and `apps/web/app/api/accounts/`.
