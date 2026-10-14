# DPIA / EIPD and Registro de Actividades de Tratamiento (RAT) — LUNA

Working draft written from the code (2026-10-13) for the company's lawyer / DPO to review and sign. Spanish version to be produced from this one. Not legal advice.

## 1. Record of processing activities (RAT)

| # | Activity | Data subjects | Data | Purpose / basis | Recipients (processors) | Retention |
|---|---|---|---|---|---|---|
| 1 | Accounts | students, teachers, parents | name, email, password hash, phone, role, birth date, terms version | provide the service (contract); age check (legal obligation) | Supabase, Vercel, email provider | while the account exists; erased 30 days after a deletion request |
| 2 | Guardian consent (under 14) | child (first name only), guardian | first name, birth date, guardian email, link hash | consent / legal obligation (LOPDGDD art. 7, COPPA) | Supabase, email provider | max 48 h; deleted on consent, refusal or expiry |
| 3 | Study material and generated content | all | uploaded documents, notes, generated quizzes/plans, chat | provide the service (contract) | Supabase; OpenAI, Anthropic, Mathpix (processing) | while the account exists |
| 4 | Learning analytics | students | attempts, scores, mastery per concept and skill, AI diagnosis | provide the service; guidance to student, teacher, parent | Supabase; OpenAI (grading, coach) | while the account exists |
| 5 | Connections and sharing | all | links teacher/parent/peer, shares, groups | contract | Supabase | until removed / account deleted |
| 6 | Service emails | all | email address, message content | contract / legitimate interest | email provider | provider logs per its policy |
| 7 | Beta feedback | testers | message, page, role, optional screenshot | legitimate interest (improve product) | Supabase | until the beta ends (module is temporary) |

Special categories: none intentionally collected; children's data is treated as high-risk. No biometric data, no advertising use, no sale of data.

## 2. DPIA (EIPD)

**Why one is needed:** systematic evaluation of learners (profiling) at scale, partly children, using new technology (LLMs).

**Necessity and proportionality:** every field above serves the study features; birth date only to apply the age rules; phone number is collected today but not needed for the service (open point, see risks); prompts to AI providers carry the task text only (no name or email; the coach no longer receives the student's name).

**Risks and measures**

| Risk | Measure in place | Open |
|---|---|---|
| Child account without parental consent | age gate; no account under 14 without guardian consent; 48 h pending data only (L1–L3) | legal confirmation that the email link meets COPPA "verifiable" consent (card micro-payment is the stronger method) |
| Children's content kept by AI providers or used to train | `store:false` on every OpenAI call; no personal names in prompts | sign OpenAI/Anthropic DPAs and request zero-data-retention at organisation level; no Anthropic/Mathpix setting in code |
| Wrong AI score affects a child | every AI score/diagnosis is labelled as guidance; "teacher decides what counts"; never an official mark | build a teacher override / "ask for review" action |
| Over-collection | phone is collected for all roles | make phone optional (at least under 18) |
| Data kept too long | account deletion with 30-day grace; daily purge job; export | retention for feedback screenshots and inactive accounts |
| Unauthorised access | server-side owner checks on every request; session cookie HttpOnly/SameSite | enable Postgres RLS as a second layer; access log for minors' data |
| International transfers | processors under SCCs/DPF | document regions; Supabase/Vercel EU regions if available |
| Breach | none yet | written 72 h procedure with AEPD notification template |

**Conclusion:** acceptable once the "open" items above are closed; the first four should be closed before onboarding real users under 18.

## 3. Operations checklist (not code)

- Apply `supabase/migrations/202610130001_legal_compliance.sql`; set `CRON_SECRET` in Vercel (enables the daily purge); set `LUNA_LEGAL_NAME`, `LUNA_LEGAL_ADDRESS`, `LUNA_PRIVACY_EMAIL`.
- Have a lawyer review `lib/legalTexts.js` (Terms, Privacy, AI notice) and produce the Spanish versions.
- Sign DPAs: Supabase, Vercel, OpenAI, Anthropic, Mathpix, email provider, payment provider. Ask OpenAI/Anthropic for zero data retention.
- Data-processing agreement template for schools (LUNA as encargado).
