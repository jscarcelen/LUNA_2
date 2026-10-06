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

A third migration, `supabase/migrations/202610060001_network_sharing_grants.sql`, opens the network and adds live sharing
(see "Your network" and "Sharing v2" below): the `peer` connection kind, the `share_grants` table, and the
`payload` / `imported_at` columns of `shared_items`. **It is optional for everything that already works:** until it is
applied, teacher/parent <-> student connections, copies and assigning behave exactly as before; connecting with anyone
else and every sharing v2 action answer `503 { setupNeeded: true, migration: "…202610060001…" }` with a plain notice, the
reading routes (the Connections overview, the share list, the bell) quietly report "nothing shared", and the workspace
tree has no "Shared with me". It takes effect within ~15 s of applying it, no redeploy.

Set `LUNA_SESSION_SECRET` (32+ random characters, e.g. `openssl rand -base64 48`) on Vercel for
**Production and Preview**. In production without it, nobody can log in or sign up (the routes answer 500
with the reason) and every request is treated as the demo. Locally a fixed development value is used.

## Data model

| table | what it holds |
|---|---|
| `accounts` | id, unique lowercase `email`, `password_hash` (scrypt), `display_name`, `role` student/teacher/parent, `under_13`, failed-log-in counter and lock, `email_verified_at`, `phone` (E.164, unique) + `phone_verified_at`, `password_changed_at`, `notifications_seen_at`, `pending_invites` |
| `account_tokens` | one-time links: `kind` verify_email (48 h) / reset_password (1 h), `token_hash` (SHA-256; the token itself exists only in the email), `expires_at`, `used_at` |
| `account_links` | one row per pair and kind (`teacher_student`, `parent_student`, `peer`): requester, target (null until that email has an account), `status` pending / accepted / declined / revoked, `pair_key` (unique, direction-independent) |
| `shared_items` | what was sent as a COPY: share or assign, item type (document, resource, activity, plan, agent, template, component), sender, recipient, source document, the recipient's copy, due date, note; `payload` + `imported_at` for components |
| `share_grants` | LIVE shares: `owner_id`, `grantee_id`, `item_kind` document / folder / subject, `item_id`, `permission` view / edit, `item_name`, `notified_at`, `revoked_at` (history is kept; one live grant per person and item). A trigger deletes the grants when the original is deleted |

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

## Your network (linking)

**The network is open.** Any account can connect with any other: student↔student, teacher↔teacher, parent↔teacher,
parent↔parent… and there is no limit on how many connections an account has. Either side can ask; **a link is active
only when the other side accepts**. A request to someone who already asked you is the second yes. Sign-up can include
emails to connect with (the fields depend on the profile, plus "anyone else"); they are sent once the email is confirmed.
Requests for emails with no account wait and attach when that email is confirmed. Asking about an email never reveals
whether it has an account (same answer for unknown, known and wrong-role emails). Remove ends a connection (copies already
sent stay; live shares between the two stop at once). A declined request cannot be re-sent by the same person for 24 h.

**The kind of connection comes from the two roles** (`kindForRoles` in `lib/accountsCore.js`), never from what the
requester claims: teacher+student → `teacher_student`, parent+student → `parent_student`, every other pair → `peer`.
For an address with no account yet the optional "They are a…" hint decides the stored kind; it is settled from the real
roles when the person signs up (a teacher who hinted "student" for an address that turned out to be a parent simply
becomes a peer connection). Role-specific powers stay explicit and role-based (`hasGuardianPowers`):

| | `teacher_student` / `parent_student` | `peer` |
|---|---|---|
| Share files, folders, plans, agents, templates, components | yes | yes |
| **Assign** activities and plans with a due date (teacher/parent → student) | yes | **never** |
| See the student's performance (**My students / My children**) | yes | **never** |
| Anything private (notes, attempts, goals, agents, uploaded material of the other) | no | no, only what is explicitly shared |

Connections shows "Your network" with a label per person ("Your student", "Your parent", "Teacher in your network"…).

## Sharing v2: live shares with permissions

Open the **Share…** dialog from a file row, a **folder** row (any folder, study-plan folders and a whole topic included),
a study plan, an agent card, a template card or a custom component. The dialog is a people picker over **accepted
connections only** (a share to anyone else is refused by the server: `authorizeDelivery` on the accepted link, then a
403 for that person and nothing is written), with a **Can view / Can edit** choice and, for the owner, the **People with
access** list (change permission, remove).

`POST /api/accounts/grants { action: "share", kind: "document" | "folder" | "subject", itemId, recipientIds[], permission }`
(also `permission`, `revoke`, `leave`; `GET ?kind=&id=` = who has access, `GET` = overview). Sender = session; the item
must be the sender's own (a grantee, even with edit, can never share onward: the answer is the same 404 as for an item that
does not exist).

* **Files and folders are shared live, not copied.** A grant row says "this owner gave this person view/edit on this
  document, folder (with its whole subtree, including what is added later) or topic". The owner keeps ownership. A study
  plan is a document: it travels with the documents it uses and its own plan folder (same permission), so every step opens.
* **Where the grantee sees it:** the workspace tree API (`GET /api/workspaces-supabase`, `lib/sharedTree.js`) lays
  everything shared with an account into its first workspace as **Shared with me / <owner's name> / …**: the nodes
  carry the owner's real ids and a `shared: { grantId, ownerId, ownerName, permission, root }` marker (a shared topic shows
  as a stand-in folder `subj~<topic id>`). A *view* document also carries a synthetic `shared-by:` tag so the existing
  read-only interface applies. The grantee's own notes, highlights and attempts are their own documents in their own topic
  ("Shared with me" is real for them): nothing of theirs is written to the owner's account.
* **Authorisation is one pure module: `lib/grants.js` `resolveAccess({ accountId, item, facts, grants, connections })` →
  `"owner" | "edit" | "view" | null`**, used by `lib/workspaceGuard.js` (every workspace action) and `lib/resourceAccess.js`
  (answering a shared quiz saves the attempt under the answerer). Rules: the owner of a workspace owns its items; a
  grant covers its item and everything under it (folder subtree, topic); the grant must be live (not revoked), made by the
  item's real owner to this account, and the two must still be connected; the strongest covering grant wins; private
  documents (`doc-notes`, `activity-attempt`, `study-goal`, `ai-agent`) never resolve for anyone but their owner.
* **What each permission allows** (`SHARED_ACTION_NEEDS`; any action not listed needs the owner, so new actions are closed
  by default): *view* reads, downloads, highlights (own notes) and answers; *edit* also changes the original's content,
  renames, ticks plan steps, and adds files/folders **inside a shared folder** (they land in the owner's workspace, so every
  version sees the update); **only the owner** deletes, moves, re-tags, restructures, shares again, or changes access. A
  request that names a shared item together with the account's own files, or items of two shares, is refused (nothing moves
  in or out of a share). The guard points the write at the owner's real workspace/topic; ids from the browser are never trusted.
* **Revoking is immediate** (owner: remove/change in the dialog or Connections; grantee: **Leave**, in the row menu,
  the folder row or Connections). Removing the connection revokes both directions. Deleting the original removes its grants
  (database trigger + the route).
* **Notifications:** the bell shows "X shared 'Folder' with you (can edit)"; an email goes out best effort (the sharer's name,
  role, email and the item's name, never its content), one per sharer and person per hour (`share_grants.notified_at`) and
  20 an hour per sender; a failed or unconfigured mailer never changes what the sharer sees.

**Agents, templates and components are shared as COPIES** (`POST /api/accounts/share-copy`, connections only; no live sync,
the dialog says "they get their own copy"). Agent: a document tagged `ai-agent` + `shared-from:<id>` in the recipient's first
ordinary topic, labelled "Shared by <name>", without the sender's saved last output; **agents bought in the Marketplace
cannot be shared**. Template: through the recipient's own template library ("<name> (shared by <sender>)"). Component: a
`shared_items` row (`item_type = 'component'`, `payload` = the validated block, 200 KB cap); on its next load the app imports
it into `localStorage` `luna.templateBlocks.v1` ("My blocks") and says so. The recipient may use and modify their copy.

## Sharing and assigning (copies)

`POST /api/accounts/share { mode: "share" | "assign", documentId, recipientIds[], dueDate?, note? }`, sender =
session. Needs an accepted link with each recipient and a document the sender owns. This is the older **copy**
mechanism; the dialog's plain **Share** now creates live grants, and this route still serves **Assign**.

* **Assign** (teacher/parent → student over a `teacher_student` / `parent_student` link; activities and study plans only):
  a read-only copy lands in the recipient's first workspace under **Shared documents / <sender's name>**, tagged
  `shared-by:<sender id>`, plus `assigned-by:<id>` and `due:YYYY-MM-DD`; activities then show in the student's Activities
  with the due date. A plan travels with the activities it uses (ids rewritten to the copies; sub-plan and agent links
  dropped; the due date becomes an extra deadline). Sending again refreshes the copy and keeps the receiver's highlights and
  ticked steps.
* **Share (copy)** is kept for old clients and still works with the same rules; existing shared copies stay readable
  (nothing was migrated).
* Never sent: received copies (no forwarding), notes, attempts, agents, goals.

Read-only copies are enforced on the server (`lib/workspaceGuard.js`): a shared copy cannot be renamed, deleted,
retagged, moved or have its content rewritten; the **Shared documents** and **Shared with me** topics and their folders
cannot be restructured. Allowed on a copy: highlights, ticking plan steps, favourites, the receiver's own notes and
attempts (separate documents in the receiver's account). The same guard checks that every workspace, topic, folder and
document id in a workspace request belongs to the logged-in account or is shared with it by a live grant.

## My students / My children

`GET /api/accounts/linked/workspaces?accountId=` returns a connected student's workspace tree to their
teacher/parent (accepted link required; same 404 for "no such student" and "not yours"). Uploaded material
and private notes are reduced to their names. The page renders the existing `PerformancePage` with that data
(read-only) plus a read-only study-plans overview; a parent can have several children (chips). Only
`teacher_student` / `parent_student` links open it: a peer connection (a classmate, a colleague, another parent) never does.

## Not done yet

* SMS verification of the phone number (needs an SMS provider; the column is ready), email deliverability (SPF/DKIM/DMARC
  on your sending domain; Gmail SMTP is for testing), a "log out everywhere" button (a password change already does it),
  phone-number login.
* Per-student class grouping, bulk assigning to a class, push notifications (the bell polls).
* Sharing v2: no "share with a group/class", no link sharing for people outside the network, no comments on a shared item,
  no live co-editing cursor (two people editing the same document at the same moment: the last save wins), shared items do
  not count in the grantee's storage view, the grantee cannot reorganise a share into their own folders (move is owner-only on purpose).
* Agents, templates and components have no live sync after the copy; a re-share of an agent replaces the recipient's copy.
* Marketplace purchases are never shareable (licensed to the buyer).
* A student's *own* Home dashboard in `/platform` still shows the sample data (Home is being rebuilt separately).
* Shared copies do not carry document chunks (RAG over a shared reference file re-chunks from its text).
* Edits to a shared resource's classification/concepts are refused (read-only), the UI shows a failed-action message.
* Real auth provider and RLS policies (this is a first version on service-role access).
* The Teacher/Parent "Performance" page of their own workspace still uses per-browser learner names; use My students.
