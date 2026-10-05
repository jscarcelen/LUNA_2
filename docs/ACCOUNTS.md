# Accounts, connections and sharing

The real platform (`/platform`) runs on email + password accounts. The public demo (`/app`) is
unchanged: no account, the sample profile, the role switcher, one shared demo owner.

## The one setup step

Apply `supabase/migrations/202610040001_accounts_links_sharing.sql` (Supabase SQL editor, or the
Supabase MCP `apply_migration` on project `fekeupkjljbgimntxpnv`). Until then every `/api/accounts/*`
route answers `503 { setupNeeded: true, error: "Accounts need one database step: apply …" }`, the log in /
sign up form and the platform show that notice, and the demo keeps working.

Set `LUNA_SESSION_SECRET` (32+ random characters, e.g. `openssl rand -base64 48`) on Vercel for
**Production and Preview**. In production without it, nobody can log in or sign up (the routes answer 500
with the reason) and every request is treated as the demo. Locally a fixed development value is used.

## Data model

| table | what it holds |
|---|---|
| `accounts` | id, unique lowercase `email`, `password_hash` (scrypt), `display_name`, `role` student/teacher/parent, `under_13`, failed-log-in counter and lock |
| `account_links` | one row per pair and kind (`teacher_student`, `parent_student`): requester, target (null until that email has an account), `status` pending / accepted / declined / revoked, `pair_key` (unique, direction-independent) |
| `shared_items` | what was sent: share or assign, item type, sender, recipient, source document, the recipient's copy, due date, note |

An account's id is also its `owner_user_id` everywhere else, so the existing tables (workspaces, concepts,
attempts…) work unchanged. RLS is enabled with no policies: access is service-role only, from the server.

## Sessions

`POST /api/accounts/signup | login | logout`, `GET /api/accounts/me`. The session is a signed token
(`v1.<payload>.<HMAC-SHA256>`, 14 days) in an `HttpOnly; SameSite=Lax` cookie (`Secure` in production).
`lib/session.js` → `ownerUserIdFor(request)` is the single place that decides whose data a request touches:
the session's account id, otherwise the demo owner. A logged-in browser on `/app` (Referer under `/app`) is
still treated as the demo, so the demo can never reach real data. Ids in request bodies are never trusted.

Hardening: scrypt with per-password salt, constant-time comparison, one generic log-in error, equal work for
unknown emails, 5 failures per email/15 min and 30 per address (in memory) plus a database lock after 5 in a
row, sign-up throttle, same-origin check on every state-changing account route, min 8 / max 200 character
passwords.

## Linking

Valid pairs: teacher↔student and parent↔student. Either side can ask; **a link is active only when the other
side accepts**. A student's own request to a teacher/parent and the reverse are the same pair (asking someone
who already asked you is the second yes). Sign-up can include emails to connect with (teacher: students;
parent: children; student: parents and teachers). Requests for emails with no account wait and attach when
that email signs up; if the new account's role does not fit, the request is silently revoked. Asking
about an email never reveals whether it has an account (same answer for unknown or wrong-role emails).
Remove ends a link (files already sent stay). A declined request cannot be re-sent by the same person for 24 h.

## Sharing and assigning

`POST /api/accounts/share { mode: "share" | "assign", documentId, recipientIds[], dueDate?, note? }`, sender =
session. Needs an accepted link of the right kind with each recipient and a document the sender owns.

* **Share** (anyone linked, both directions): a read-only copy lands in the recipient's first workspace under
  **Shared documents / <sender's name>**, tagged `shared-by:<sender id>`.
* **Assign** (teacher/parent → student; activities and study plans only): the same copy plus `assigned-by:<id>`
  and `due:YYYY-MM-DD`; activities then show in the student's Activities with the due date. A plan travels with
  the activities it uses (ids rewritten to the copies; sub-plan and agent links dropped; the due date becomes
  an extra deadline). Sending again refreshes the copy and keeps the receiver's highlights and ticked steps.
* Never sent: received copies (no forwarding), notes, attempts, agents, goals.

Read-only is enforced on the server (`lib/workspaceGuard.js`): a shared copy cannot be renamed, deleted,
retagged, moved or have its content rewritten; the Shared documents topic and its folders cannot be
restructured. Allowed on a copy: highlights, ticking plan steps, favourites, the receiver's own notes and
attempts (separate documents in the receiver's account). The same guard checks that every workspace,
topic, folder and document id in a workspace request belongs to the logged-in account.

## My students / My children

`GET /api/accounts/linked/workspaces?accountId=` returns a connected student's workspace tree to their
teacher/parent (accepted link required; same 404 for "no such student" and "not yours"). Uploaded material
and private notes are reduced to their names. The page renders the existing `PerformancePage` with that data
(read-only) plus a read-only study-plans overview; a parent can have several children (chips).

## Not done yet

* Email verification, password reset, "log out everywhere" (sessions are stateless; logout clears the cookie).
* Per-student class grouping, bulk assigning to a class, notifications when something arrives.
* A student's *own* Home dashboard in `/platform` still shows the sample data (Home is being rebuilt separately).
* Shared copies do not carry document chunks (RAG over a shared reference file re-chunks from its text).
* Edits to a shared resource's classification/concepts are refused (read-only), the UI shows a failed-action message.
* Real auth provider and RLS policies (this is a first version on service-role access).
* The Teacher/Parent "Performance" page of their own workspace still uses per-browser learner names; use My students.
