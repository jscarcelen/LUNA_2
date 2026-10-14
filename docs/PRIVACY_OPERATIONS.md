# Privacy operations — breach procedure and sub-processors

For the founders and the DPO/lawyer. Draft from `docs/LEGAL_COMPLIANCE_PLAN.md` L13; fill the blanks once the SL exists.

## Personal-data breach procedure (GDPR arts. 33–34, AEPD)

1. **Detect and contain (hour 0).** Anyone who suspects a breach (leaked key, wrong access, data sent to the wrong person) tells the founders at once. Contain: rotate the keys involved (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `LUNA_SESSION_SECRET` — changing it logs everyone out), disable the affected route, revoke sessions.
2. **Record.** Open an entry in the incident log (date/time found, what happened, which data, how many people, whether children, who found it). Keep it even if no notification is needed.
3. **Assess risk (within 24 h).** Is it likely to result in a risk to people's rights? Children's data, grades/learning profiles, passwords and contact details count as risk.
4. **Notify the AEPD within 72 h of becoming aware** (sede.aepd.gob.es) when there is a risk; say why if later than 72 h. If a school is the controller, tell the school immediately so it can notify.
5. **Tell the people affected without undue delay** when the risk is high (and the parents for children): what happened, what data, what we did, what they should do, contact. US users: check state breach laws with the lawyer.
6. **Fix and learn.** Root cause, fix, test, update the DPIA (`docs/DPIA_RAT.md`).

Contact to put in the log: ______ (founder 1) · ______ (founder 2) · DPO/lawyer ______ · AEPD: https://sedeagpd.gob.es

## Sub-processors (keep this list in sync with the Privacy Policy)

| Provider | Used for | Data | Region | Contract / transfer basis | To do |
|---|---|---|---|---|---|
| Supabase | database, storage | everything an account holds | choose an EU region | DPA + SCCs/DPF | confirm project region; sign DPA |
| Vercel | hosting, serverless functions, cron | requests in transit, logs | EU functions if available | DPA + SCCs/DPF | set function region near Supabase |
| OpenAI | quiz/plan/grading/chat generation, embeddings | task text, images, questions (no name/email) | US | DPA + SCCs/DPF | request zero data retention; `store:false` is set in code |
| Anthropic | PDF/scan reading | document pages | US | DPA + SCCs/DPF | confirm no-training terms |
| Mathpix | formula OCR | images of formulas | US | DPA | sign DPA |
| Email provider (Resend/SMTP) | service emails | email address, message | | DPA | choose and sign |
| Payments (not live) | cards, taxes | billing data | | DPA | decide Paddle vs Stripe (see plan L22) |

## Retention jobs (automatic)

`/api/cron/privacy` runs daily (needs `CRON_SECRET`): erases accounts 30 days after a deletion request, drops expired guardian requests and expired one-time tokens, removes beta-feedback screenshots after 90 days.

## Requests from people

Access/export/delete: from Account settings (own) or "My students" (a parent for a child). Anything else (restrict, object, complaint about a grade): the privacy email; answer within one month.
