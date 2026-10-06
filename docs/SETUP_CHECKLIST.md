# Setup checklist — what only you can do (step by step)

Everything in the code is merged and deployed. These steps need your accounts (Supabase, Vercel, an email provider), so they are listed in order. Tick them off as you go.

## A. Database (5 minutes)
1. [ ] Open Supabase → project **Luna** (`fekeupkjljbgimntxpnv`) → **SQL Editor** → New query.
2. [ ] Paste the whole file `supabase/migrations/202610050001_account_verification_phone_tokens.sql` and **Run**. (The first accounts migration is already applied.) It takes effect ~15 s later — no redeploy.
3. [ ] Optional but recommended: Supabase → **Advisors** → run the Security check and look for anything on `accounts`, `account_links`, `account_tokens`, `shared_items` (they have RLS on and no policies on purpose: only the server, with the service key, reads them).
4. [ ] Optional: the migration (`supabase/migrations/202610030001_feature_requests.sql`) for the chatbot's "requests Luna can't do yet" is still not applied. Run it the same way.

## B. Sending email (10 minutes) — pick ONE
**B1. Gmail (free, for testing with friends, no domain):**
1. [ ] Use a Google account with 2-Step Verification on → Google Account → Security → **App passwords** → create one called "Luna" → copy the 16 letters (remove spaces).
2. [ ] In Vercel → `luna2-share-web` → Settings → **Environment Variables** (Projects tab), add for Production (and Preview if you want):
   - `LUNA_SMTP_URL` = `smtps://YOURADDRESS%40gmail.com:THE16LETTERS@smtp.gmail.com:465`  (the `@` in the address must be written `%40`)
   - `LUNA_MAIL_FROM` = `Luna <youraddress@gmail.com>`
3. [ ] Redeploy (Deployments → latest → ⋯ → Redeploy).

**B2. Resend test sender (free, delivers ONLY to your own Resend login email):**
1. [ ] Create a Resend account, make an API key.
2. [ ] Vercel env vars: `RESEND_API_KEY` = the key, `LUNA_MAIL_FROM` = `Luna <onboarding@resend.dev>`.
3. [ ] Redeploy. Emails then reach only the address you registered with Resend — use that address for your test accounts.

(`LUNA_PUBLIC_URL` = `https://luna2-share-web.vercel.app` was already added for Production.)

## C. Try it by hand (15 minutes)
1. [ ] Sign up a **teacher** with your email + phone (`+1…` format) — try mismatched passwords first (it should refuse). Check your inbox, open the link, press the button.
2. [ ] Sign up a **student** in a private window (another email you own, e.g. `you+student@gmail.com` works with Gmail).
3. [ ] Teacher → Connections → add the student's email. Student's bell 🔔 should show 1 request (and an email arrives). Accept it from the bell.
4. [ ] Teacher → workspace → **Share with…** a document; student → open **Shared documents** (read-only). Teacher → study plans → **Assign…** a plan.
5. [ ] Create a parent account, link it to the student, open **My children** → performance.
6. [ ] Try **Forgot password?** with a real and an unknown email (same answer both times), set a new password, and check that an old logged-in browser is signed out.
7. [ ] Account settings (profile menu): change the phone (a number already used by another account is refused).
Until the email provider exists, accounts still work but nothing is mailed; the app says "Email is not set up yet". To trust an account without email, run in the SQL editor: `update accounts set email_verified_at = now() where email = 'you@example.com';`.

## D. First real runs to watch (they have never run on live keys)
1. [ ] **Summary Notes Consolidator**: AI agents → run it on 2–3 short documents; then build a study plan from 2+ uploaded documents and check the master document appears in the plan folder. If a big run is cut off, Vercel Hobby limits function time — upgrade to Pro or tell me and I'll make it resumable.
2. [ ] **Ask Luna** inside a quiz and a document (the floating button).
3. [ ] **Plan progress panel** while building a plan.

## E. Housekeeping
1. [ ] Vercel → Environment Variables → **Shared** tab: delete the unused team-level `LUNA_SESSION_SECRET` (the project has its own).
2. [ ] The 6 failing tests in `tests/template-studio` (blocks ×5, engine ×1) are old and unrelated.

## F. Before real users (not needed for testing)
- [ ] A domain you own + SPF/DKIM/DMARC in your email provider (so mail doesn't land in spam); switch `LUNA_MAIL_FROM` to it.
- [ ] Vercel **Pro** (Hobby is for personal, non-commercial use) and Supabase **Pro** (the free project pauses when idle).
- [ ] Phone verification by SMS (Twilio or similar) — phones are stored and unique but **not verified**.
- [ ] Terms of Service and Privacy Policy pages (the sign-up links point nowhere yet); under-13 rules depend on your country.
- [ ] Rate limits are per server instance; move them to the database if you get real traffic.
- [ ] Real payments, lunas purchases and marketplace payouts do not exist yet.

## G. Added 2026-10-06 — sharing with view/edit rights, open network
1. [ ] Supabase SQL Editor → run `supabase/migrations/202610060001_network_sharing_grants.sql` (safe to run twice). Until then everything classic keeps working; peer connections and live shares answer "setup needed".
2. [ ] Hand test with the three test accounts (password `LunaTest#2026`): parent requests the teacher (a peer connection) → teacher accepts; teacher shares a folder with the student as "Can edit" → student edits a document under Shared with me → the original changes; switch to "Can view" → read-only at once; remove → gone. Share an agent, a template and a "My blocks" component (they arrive as the receiver's own copies).
3. [ ] Written answers: in a quiz with short answers press Check — Luna marks them by meaning ("Almost" gets half marks). Needs the OpenAI key (already set).
4. [ ] Move: drag a document from Accounting to Statistics, or use ⋯ → Move to…; try Undo.

## H. Added 2026-10-07 — Update anything Luna generated (no migration, no new env var)
1. [ ] **A quiz**: Workspaces → a quiz nobody has answered → ⋯ → **Update…** → "make the questions harder" → Update. Watch the progress steps, then the result: new / changed / removed questions. **Replace this** (default). Open the quiz → **Versions** tab shows the old one → **Restore this version**.
2. [ ] **A quiz with attempts** (answer one first): Update… again. The default is now **Save as a new version** ("Quiz (v2)") and the original is untouched; the plan step / Activities row still points at the original.
3. [ ] **Different material**: Update… → tick **Use different material** → pick another document → the new version reads that one. Untick **Keep the format and colours** to drop the look.
4. [ ] **A deleted agent**: save an agent, make a resource with it, delete the agent, Update… the resource → it says the agent is gone and offers **Run it as a copy with the built-in agent**.
5. [ ] **Everywhere**: the same **Update…** button is in the reader header (✦), Activities rows, a study-plan step, and the chat's result cards (an unsaved card is replaced in the card).
6. [ ] **A master document** (plan from 2+ uploaded documents): Update… → "add a section on …" (the consolidator runs again, takes minutes). Then open a quiz made from it: it says "Based on an older version of …".
7. [ ] **A plan**: Study plans → a plan card → **Update…** (or the plan page → ✎ Update this plan…) → "lighter workload in the last two weeks" / "add a mock exam two days before the deadline" → read the preview (added / removed / moved steps with dates) → **Apply changes** → when asked, **Build now** for the new steps. A step you already finished must be unchanged. Change "Time per week" or the new deadline date too.
8. [ ] **A deadline set by someone else** (a teacher's assignment): the date field is disabled and the dialog says it cannot be changed; asking "move the deadline" never moves it.
9. [ ] **Restore a plan**: Update this plan… → Show earlier versions → **Restore**. Finished steps and built material are kept.
