# Accounts module

UI and pure helpers for the real platform (`/platform`): connections between accounts, sharing and
assigning, and a connected student's read-only performance. See `docs/ACCOUNTS.md` for the data model,
flows and the setup step.

- `shared.js` — pure, imported by browser and server: the `shared-by:` / `assigned-by:` tags, "may a
  receiver save this edit" (`sharedEditAllowed`), what can be sent (`classifyDeliverable`), redaction of a
  student's tree for a parent/teacher.
- `api.js` — client for `/api/accounts/*`. `SetupNotice.js` — the "apply the migration" notice (accounts, or the sharing migration).
- `ConnectionsPage.js` — "Build your network": add anyone by email (any role, no limit), requests (accept/decline), sent
  (cancel), your network with relation labels (remove), what is shared with you / by you (leave, change, remove), copies sent/received.
- `shareEvents.js` — the bridge that lets agent cards, template cards, custom components and folder rows call "Share…" without knowing about accounts
  (`requestShare`, `useSharingAvailable`, `requestLeaveShare`); AppShell owns the one dialog.
- `shared.js` also holds `SHARED_WITH_ME_SUBJECT`, `isReservedSubjectName`, `sharedInfoOf` (the `shared` marker on tree nodes) and `relationLabel`.
- `LinkedStudentsPage.js` — "My students" / "My children": Groups bar, student chips (with group dots), `PerformancePage` read-only, plans overview, Sent, Exam dates; a selected group shows `GroupView`.
- `groups.js` — **pure** group rules (palette, caps, `activeMembership`, `resolveRecipients` de-duplication, `selectionStats`, per-person `summarizeResults`, `runPool` with a time budget). `GroupsBar.js` — the Groups bar, member picker, per-student "Groups…". `GroupView.js` + `groupData.js` (pure: the members as one synthetic class workspace, comparison, plan table, `examPlanStatus`) — the group view.
- `examDates.js` — **pure** exam date rules (validation, recipient shape, ordering). `ExamDatesTab.js` — the teacher's list / send / edit / cancel / who has planned.
- `shared.js` also holds `dueInfoOf` (imposed vs own date of a copy: `due:` + protected `due-by:`, the student's `due-own:`).
- `ShareDialog.js` — "Share…" for a file, folder, topic, study plan (live share: Can view / Can edit, People with access) or an
  agent, template, component (their own copy), and "Assign" (teacher/parent → student, with a due date).
- `PlatformNotice.js`, `SharedNotice.js` — banners ("Verify your email" with Resend, under-13 students); "Shared by …" pill in the reader.
- `NotificationsBell.js` (+ pure `bellText.js`) — the bell in the top bar: pending requests with Accept/Decline, answers, shared/assigned work.
- `AccountSettings.js` — email state + resend, phone (E.164, one per account, not SMS-verified), change password.

Server side lives in `apps/web/lib/` (`accountsCore.js`, `accountsRepository.js`, `sharingRepository.js` (copies / assign),
`grants.js` (**pure** `resolveAccess` for live shares; read its header first), `grantsRepository.js`, `sharedTree.js`
("Shared with me" in the tree), `copyShareRepository.js` (agents/templates/components), `workspaceGuard.js`, `session.js`, `sessionRevocation.js`, `resourceAccess.js`, plus `accountTokens.js` (one-time hashed tokens),
`accountFlows.js` (confirm email / reset password / request emails), `accountLimits.js` (rate limiters), `mailer.js` +
`mailTemplates.js` (SMTP / Resend / none), `phone.js` (E.164)) and `apps/web/app/api/accounts/`.
