# Accounts, connections and sharing

The real platform (`/platform`) runs on email + password accounts. The public demo (`/app`) is
unchanged: no account, the sample profile, the role switcher, one shared demo owner.

## The one setup step

Apply `supabase/migrations/202610040001_accounts_links_sharing.sql` (Supabase SQL editor, or the
Supabase MCP `apply_migration` on project `fekeupkjljbgimntxpnv`). Until then every `/api/accounts/*`
route answers `503 { setupNeeded: true, error: "Accounts need one database step: apply …" }`, the log in /
sign up form and the platform show that notice, and the demo keeps working.

A second migration, `supabase/migrations/202610050001_account_verification_phone_tokens.sql`, adds email
confirmation, password reset, the phone number, the notification bell and request emails (see "Email, phone and
password" below). **It is optional for sign-in:** until it is applied the code detects the missing columns and
keeps working exactly as before (no confirmation, no phone stored, no reset, nobody is blocked); the new routes
answer `503 { setupNeeded: true, migration: "…202610050001…" }`. It takes effect within ~15 s of applying it,
no redeploy.

Set `LUNA_SESSION_SECRET` (32+ random characters, e.g. `openssl rand -base64 48`) on Vercel for
**Production and Preview**. In production without it, nobody can log in or sign up (the routes answer 500
with the reason) and every request is treated as the demo. Locally a fixed development value is used.

## Data model

| table | what it holds |
|---|---|
| `accounts` | id, unique lowercase `email`, `password_hash` (scrypt), `display_name`, `role` student/teacher/parent, `under_13`, failed-log-in counter and lock, `email_verified_at`, `phone` (E.164, unique) + `phone_verified_at`, `password_changed_at`, `notifications_seen_at`, `pending_invites` |
| `account_tokens` | one-time links: `kind` verify_email (48 h) / reset_password (1 h), `token_hash` (SHA-256; the token itself exists only in the email), `expires_at`, `used_at` |
| `account_links` | one row per pair and kind (`teacher_student`, `parent_student`): requester, target (null until that email has an account), `status` pending / accepted / declined / revoked, `pair_key` (unique, direction-independent) |
| `shared_items` | what was sent: share or assign, item type, sender, recipient, source document, the recipient's copy, due date, note |

An account's id is also its `owner_user_id` everywhere else, so the existing tables (workspaces, concepts,
attempts…) work unchanged. RLS is enabled with no policies: access is service-role only, from the server.

## Email, phone and password

**Sign-up** asks for the password twice (checked in the form with an inline message and again on the server:
`passwordConfirm` must equal `password`, otherwise 400) and for a **phone number** in international format. The
phone is normalised to E.164 by `lib/phone.js` (spaces, dashes, dots and brackets are accepted; a leading `+` or
`00` country code is required; no default country is guessed) and stored in `accounts.phone` under a unique index:
**one email, one phone**. A phone already used answers `That phone number is already linked to another account.`
(it never says which account). The phone is **not verified**: there is no SMS provider, `phone_verified_at` stays
null and the UI says "not verified yet". When SMS exists, only a code check that sets `phone_verified_at` is
missing; the column and the API shape are ready. Phone is required at sign-up; the helper accepts an empty value
only with `{ required: false }`, which the settings screen uses to let an existing account add, change or remove
its phone. Phone numbers are never sent to other accounts (`ownAccount` vs `publicAccount`).

**Confirm email.** After sign-up Luna emails `/verify-email?token=…` (random 32 bytes, only the SHA-256 hash is
stored, 48 h, single use, a new request replaces the old link). The page shows a button, and the token is used up
only when it is pressed (so mail scanners that open links cannot burn it). Until the email is confirmed the account
can log in and use its own workspace, a banner says "Verify your email" with a rate-limited **Resend email**
(3 per hour per account, 10 per address), but on the server it **cannot send or accept connection requests, share
or assign** (403 `email_unverified`; declining, cancelling and removing stay possible). Requests other people sent
to that address, and a request made to an unconfirmed address, are **not attached** until the email is confirmed
(so signing up with someone else's address shows you nothing); the connection requests typed in the sign-up form are
kept in `accounts.pending_invites` and sent at confirmation. Confirming also happens as a side effect of a
password reset.

**Forgot password.** The log-in modal has "Forgot password?" → email → always the same neutral answer
("If that email has an account, we sent a link…"), limited per email (3 per hour) and per address (10 per hour); the
limit counts every request, so it reveals nothing. The link `/reset-password?token=…` (1 hour, single use) asks for
the new password twice. A typo does not burn the link. On success the token is consumed, every other reset link is
deleted, the failed-log-in lock is cleared, the email counts as confirmed, **`password_changed_at` is set and every
session issued before that moment stops working** (checked in `requireAccount`, the platform and log-in pages and
the data routes through `ownerUserIdForFresh`; cached 15 s per server instance), and the browser is logged in with a
new session. Changing the password in **Account settings** (profile menu) does the same and also asks for the
current password, as does changing the phone (5 wrong guesses per 15 min).

**Mail.** `lib/mailer.js` picks the provider from the environment, in this order:

1. **SMTP**: `LUNA_SMTP_URL` + `LUNA_MAIL_FROM` (nodemailer, loaded only on this path). Works without a domain.
   *Gmail*: turn on 2-Step Verification, create an App password (Google Account → Security → App passwords), then
   `LUNA_SMTP_URL=smtps://you%40gmail.com:the-16-letter-password@smtp.gmail.com:465` (write `@` as `%40`) and
   `LUNA_MAIL_FROM=you@gmail.com`; Gmail allows about 500 messages a day. Brevo (`smtp-relay.brevo.com`, port 587 →
   `smtp://…:587`) and Mailtrap (sandbox inbox) work the same way.
2. **Resend**: `RESEND_API_KEY` + `LUNA_MAIL_FROM` (REST through fetch, no SDK). The free test sender
   `onboarding@resend.dev` only delivers to the email address of your own Resend account; to email anyone else
   verify a domain in Resend and use `Luna <noreply@yourdomain>`.
3. **None**: in development the email (subject + link) is printed on the server console and the API returns it as
   `devPreview` (the UI shows an "open the link" shortcut). **In production nothing is sent, no link or token is
   logged or returned**, the API answers `mailSetupNeeded: true` and the UI says "Email is not set up yet"; log in
   and sign up still work.

`LUNA_PUBLIC_URL` (e.g. `https://luna.example.com`) is the address links in emails point to; without it the request's
own host is used, so **set it in production** (a forged Host header can then never reach a reset link). Credentials
are never logged and are scrubbed from error text. Templates (`lib/mailTemplates.js`): confirm email, reset password,
request received, request accepted, invitation. Plain HTML + text, Luna blue `#0071e3`, no images, no tracking.

**Notifications.** The bell in the top bar (platform only) shows a badge = requests waiting for you + anything new
since you last opened it, and a list with Accept / Decline inline, answers to your requests, and work shared or
assigned to you, with "See all in Connections". `GET /api/accounts/notifications` derives everything from
`account_links` and `shared_items` (last 30 days); it is polled every minute and on focus; opening the list posts
`seen` (`accounts.notifications_seen_at`). Emails: when you send a request the other person gets "X wants to connect"
(name, role and email of the sender, a link to `/platform?page=connections`), and when they accept you get "X
accepted". At most one email per pair per 24 h (stored in `account_links.notified_at` / `accepted_notified_at`), at
most 30 a day per sender, 20 an hour in memory. A request to an address with no (confirmed) account sends a minimal
invitation ("X invited you to connect on Luna", create an account) at most once per pair per 7 days. Emails are best
effort and never change the answer the sender sees. Without the migration no notification emails are sent.

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
that email is confirmed; if the new account's role does not fit, the request is silently revoked. Asking
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

* SMS verification of the phone number (needs an SMS provider; the column is ready), email deliverability (SPF/DKIM/DMARC
  on your sending domain; Gmail SMTP is for testing), a "log out everywhere" button (a password change already does it),
  phone-number login.
* Per-student class grouping, bulk assigning to a class, push notifications (the bell polls).
* A student's *own* Home dashboard in `/platform` still shows the sample data (Home is being rebuilt separately).
* Shared copies do not carry document chunks (RAG over a shared reference file re-chunks from its text).
* Edits to a shared resource's classification/concepts are refused (read-only), the UI shows a failed-action message.
* Real auth provider and RLS policies (this is a first version on service-role access).
* The Teacher/Parent "Performance" page of their own workspace still uses per-browser learner names; use My students.
