# LUNA — legal compliance plan (Spain + US)

Source: `LUNA_Inicios.pdf` (SL set-up, tax/invoicing, payments, COPPA/GDPR, investors). This file turns it into product work and checks it against what LUNA does today (code audit, 2026-10-13). It is an engineering backlog, **not legal advice**: have the Madrid gestor/lawyer confirm every row marked ⚖.

## 1. What the code does today (audit)

| Area | Today |
|---|---|
| Sign-up | `app/api/accounts/signup` + `AuthModal`: name, email, password, phone (required), role. **Age is optional** (set later in settings). No age gate, no parent consent, no `is_minor` flag. |
| Legal pages | Sign-up says "you agree to the Terms of Service and Privacy Policy" but **no `/terms`, `/privacy` or cookie page exists**. |
| Account data rights | No account deletion, no data export, no retention rules. |
| AI providers | OpenAI (20 call sites), Anthropic (PDF vision), Mathpix (formula OCR). Student documents, answers, working photos and chat go to them. No `store:false`, no zero-retention setting, no per-user minor flag. |
| Third-party loads | KaTeX CSS from jsDelivr in exported/preview HTML (IP leak to a CDN). No analytics found. |
| Beta feedback widget | Captures screenshots, page URL, role, tester identity into a table. Temporary, but holds personal data. |
| Auto-grading | AI grader scores written answers; mastery/diagnosis profile each student (`performance/*`). |
| Payments | None yet (lunas/marketplace are local). |
| Marketplace | Users publish agents/templates (localStorage today). |

## 2. Backlog

Priority: **P0** before any real user under 18 or any paying user · **P1** before public launch · **P2** before scaling/B2B.

### Minors and consent (PDF §2 "Privacidad y Menores", age-gate flow)
| # | Fix | Where | Pri |
|---|---|---|---|
| L1 | **Age gate at the start of sign-up** (date of birth, not stored if the user abandons). Under 14 (Spain; 13 US) → no direct account. | `AuthModal`, `signup/route.js`, `accountsCore.js` | P0 |
| L2 | **Parental consent flow**: ask the parent's email only; store nothing about the child (no name, IP, cookie) until the parent confirms; pending record deleted after 48 h; parent sets a control password and the child account is created. Reuse the email-verification token machinery. ⚖ whether the 48 h window and "email plus" are enough as COPPA *verifiable* consent (a card micro-payment is the stronger method). | new `app/api/accounts/guardian/*`, migration, `lib/mailer.js` | P0 |
| L3 | **`is_minor` on accounts** (derived from birth date, store the date or at least the flag + year). Drives L4–L6. | migration `accounts`, `ownAccount` | P0 |
| L4 | **Minors' AI calls**: zero-data-retention / no-training mode with OpenAI and Anthropic; `store:false`; no minor's text in logs. ⚖ get the providers' DPA/ZDR agreements in place. | `modules/ai-tools/pipeline/provider-openai.js`, `gradeBatch.js`, `/api/chat`, vision extraction | P0 |
| L5 | **Block for minors**: marketplace purchases/sales, public sharing, peer connections with unknown adults, phone number field (not needed for a child). | `accounts/*`, `ShareDialog`, `ConnectionsPage` | P1 |
| L6 | **School channel** (B2B): teacher/school admin ticks "I certify the school holds signed parental authorisation (COPPA school exception / GDPR educational basis)"; store who ticked, when, text version; no per-parent emails for school-managed accounts. | new school/class entity, `LinkedStudentsPage` | P1 |
| L7 | **Parent dashboard rights**: a parent can see, export and delete the child's data (fits the existing parent role). | `LinkedStudentsPage`, new routes | P1 |

### Data-subject rights, retention, security (GDPR / LOPDGDD, COPPA)
| # | Fix | Where | Pri |
|---|---|---|---|
| L8 | **Delete account** (and all rows keyed by `owner_user_id`, storage files, attempts, feedback) with a grace period; **export my data** (JSON/ZIP). | `AccountSettings`, new routes, `workspacesRepository` | P0 |
| L9 | **Retention policy**: delete inactive accounts, abandoned pending consents, working-box photos (currently sent to the grader only; keep it that way), feedback screenshots after the beta. Publish it. | cron/Supabase function, docs | P1 |
| L10 | **Cookie/consent**: session cookie is strictly necessary (no banner needed). Keep it that way: no analytics/ads/tracking pixels for minors; if analytics is added later, consent banner + not for minors. | `layout.js` | P1 |
| L11 | **Self-host KaTeX CSS/fonts** instead of jsDelivr (no third-party request with the user's IP). | `DownloadPanel.js`, `WorkspaceBrowser.js`, `mathHtml.js` already inlines for docs | P1 |
| L12 | **RLS and access review**: RLS is not enabled today; all access is service-role guarded in code. Add RLS as defence in depth, and log access to minors' data. | Supabase migrations | P1 |
| L13 | **Breach procedure** (AEPD 72 h) and incident log; sub-processor list (Supabase, Vercel, OpenAI, Anthropic, Mathpix, mail provider, Paddle/Stripe) with regions and DPAs; EU data region for Supabase/Vercel if possible; ⚖ SCCs / DPF for US transfers. | docs + settings | P1 |

### AI-specific (PDF: "no automated profiling with legal effects")
| # | Fix | Where | Pri |
|---|---|---|---|
| L14 | **Human-in-the-loop wording**: every grade, diagnosis and "Luna's read" is shown as guidance, never a final mark; teacher can override a grade; student can contest/re-grade ("Why this score?" already partly exists). Never use it for admission, certification or school-level decisions. | `ActivityPlayer`, `CoachPanel`, `LevelReport`, teacher views | P0 |
| L15 | **EU AI Act**: tools that evaluate learning outcomes or steer learning are listed as *high-risk* in education (Annex III). ⚖ confirm scope and the current application date (it has been under revision). Prepare: risk management, data governance, logging, human oversight, transparency to users ("this was generated by AI"), AI-literacy duty. Label all AI output as AI-generated. | docs + UI labels | P1 |
| L16 | **DPIA / EIPD** (large-scale processing of minors + profiling) and the **RAT** (Registro de Actividades de Tratamiento) the PDF asks for. Document, not code, but L1–L14 are its measures. | `docs/` | P0 |
| L17 | **Data minimisation in AI**: send only what the task needs (question, answer, no name/email); pseudonymous learner ids in prompts. Audit prompts in `docs/dashboard` for personal data. | pipeline prompts | P1 |

### Content, marketplace, terms
| # | Fix | Where | Pri |
|---|---|---|---|
| L18 | **Terms of Service, Privacy Policy (plain language, child-readable summary), Cookie notice, AI notice** as real pages, versioned; store acceptance (version + timestamp) per account; link from sign-up, footer and parent email. English + Spanish. | `app/terms`, `app/privacy`, `accounts` | P0 |
| L19 | **Copyright**: users upload textbooks/exams. Terms must put responsibility on the uploader, forbid sharing others' copyrighted material publicly, and add a **notice-and-takedown** contact + process (also DSA for the marketplace). Uploaded files stay private by default (they do). | terms, marketplace listing flow | P1 |
| L20 | **Marketplace (DSA + consumer law)**: sellers are traders → identify them (name, address, email), clear price/VAT info, reporting button, terms for sellers, who invoices (see payments). Block minors as sellers. | `agent-marketplace`, `marketplace` | P2 |
| L21 | **Consumer rules for subscriptions/lunas**: price with taxes shown before paying, 14-day withdrawal for digital services (waiver wording when use starts immediately), easy cancellation, auto-renewal reminder, refund/credit expiry terms. ⚖ | checkout (not built), terms | P1 |

### Payments and tax (PDF: invoicing, Stripe vs Paddle, W-8BEN-E)
| # | Fix | Where | Pri |
|---|---|---|---|
| L22 | **Decide Merchant of Record**: the PDF recommends Paddle/Lemon Squeezy for B2C (they handle US sales tax, EU VAT, invoices) and Stripe + Stripe Tax mainly for B2B. For lunas/tokens/storage top-ups to families, MoR is the lower-risk choice. ⚖ gestor sign-off. | `docs/dashboard` economics, future `payments` module | P1 |
| L23 | Store per payment: country, B2B/B2C flag, VAT/tax-ID (EU B2B reverse charge, US EIN), invoice id; generate invoice text with the legal mention (art. 69 / art. 70.Uno.8º LIVA — ⚖ confirm which applies per case; for EU consumers Spanish/EU VAT does apply and OSS is needed). | future `payments` tables | P1 |
| L24 | Minors never pay directly: purchases only from an adult/parent account or school. | payments + L3 | P0 once payments exist |
| L25 | Keep a **USD/EUR ledger** for exports (ECB rate on invoice date, per the PDF). | finance export | P2 |

### Company/process items (no code, listed so they are not forgotten)
SL constitution (CIRCE/PAE, 3,000 € capital, solidary administrators) · **Pacto de socios** (50/50 deadlock, Texas shoot-out) · Autónomo societario/RETA registration question ⚖ · W-8BEN-E · Modelo 303/200/202 · D-1A and NIE/NIF-M for a US investor · SAFE draft review (⚖ US counsel) · trademark "LUNA" and IP assignment from both founders to the SL · DPO check: schools must appoint one under LOPDGDD art. 34, and as their *encargado de tratamiento* LUNA needs the art. 28 data-processing contract with each school.

## 3. Points in the PDF to double-check with a lawyer

- The "store nothing, not even IP, for under-14s until the parent confirms" rule is stricter than practice allows: rate-limiting and security logs use IP. Agree a minimal, short-lived, security-only exception.
- COPPA was amended (2025): separate parental consent for disclosing a child's data to third parties (OpenAI/Anthropic count), a written information-security programme and a data-retention policy. Not in the PDF.
- Under-14 in Spain (LOPDGDD art. 7) vs 13 in the US is correct, but other EU states use 13–16; fine while operating only in Spain + US, add a per-country threshold before expanding.
- "No VAT to US customers" is right for US customers; **EU consumers** do pay VAT (OSS), which matters if Spanish families sign up at the price list for the US.
- The PDF's SAFE/valuation parts and the US-subsidiary option are corporate advice outside what this plan covers.

## 4. Status (2026-10-13)

Implemented in code: L1, L2, L3, L4 (OpenAI `store:false` + no student name to the coach; provider DPAs/ZDR still to sign), L8, L14 (labels; a teacher override is still to build), L16 (draft in `docs/DPIA_RAT.md`), L18 (English texts, to be lawyer-reviewed and translated). Everything else is still open.

## 5. Suggested order of work

1. **Now (P0, ~1–2 weeks):** L18 legal pages + acceptance log · L1–L3 age gate, guardian flow, `is_minor` · L4 zero-retention AI for minors · L8 delete/export · L14 "guidance not final grade" labelling · L16 DPIA/RAT.
2. **Before public launch (P1):** L5–L7, L9–L13, L15, L17, L19, L21–L23.
3. **Before marketplace money / schools at scale (P2):** L20, L25, school contracts.

Related code facts: sign-up `apps/web/app/api/accounts/signup/route.js`, session `lib/session.js`, accounts `lib/accountsRepository.js`, grader `modules/activities/gradeBatch.js`, AI calls `modules/ai-tools/pipeline/*`, feedback tool `modules/feedback/*` (delete when the beta ends).
