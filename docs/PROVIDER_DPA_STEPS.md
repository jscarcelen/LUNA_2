# Provider DPAs, retention and regions — what to do in each dashboard

Not legal advice. Provider menus and terms change: where a step says *verify*, confirm it on the provider's current page before relying on it, then record the date and a PDF of the signed DPA in your records (`docs/PRIVACY_OPERATIONS.md`, processor table). Sign as the company (SL) once it exists, not as an individual.

## Supabase (database + files — the one that holds everything)
1. **Region**: Project → Settings → General shows the region. A region cannot be changed in place; if it is not in the EU (Frankfurt, Ireland, London, Paris, …), create a new project in the EU and migrate (dump/restore + storage copy), then update `SUPABASE_URL` and keys. Project ref `fekeupkjljbgimntxpnv` is in `eu-west-2` (London), checked 2026-10-19.
2. **DPA**: Supabase publishes a DPA (with SCCs) on its legal pages; the organisation Owner requests/signs it from the dashboard (Organization → Legal documents) or the DPA form on supabase.com/legal/dpa. *verify exact location*.
3. Keep RLS on (migration `202610130002`), apply the new migrations, and enable backups (paid plan for point-in-time recovery).

## Vercel (hosting, cron)
1. **Region**: Project → Settings → Functions → Function Region: pinned to `lhr1` (London, next to Supabase `eu-west-2`) by `"regions"` in the root `vercel.json`; change it there if the database moves. Static assets are served from the global CDN; that carries no personal data.
2. **DPA**: Vercel's DPA is incorporated by reference in its terms and is also downloadable from vercel.com/legal/dpa; Pro/Enterprise accounts can countersign through sales/support. *verify*.
3. Logs: keep log retention short and never log request bodies (code already avoids it).

## OpenAI (generation, grading, chat, embeddings)
1. **DPA**: platform.openai.com → Settings → Organization → *Data controls* / *Legal* → "Request a Data Processing Addendum" (form at openai.com/policies/data-processing-addendum). Needs the organisation name and signer. *verify menu*.
2. **No training on API data** is the default for the API; confirm under Settings → Data controls.
3. **Zero data retention**: normal API retention is up to 30 days for abuse monitoring. ZDR is by approval: request through the sales/support form ("Zero Data Retention") explaining the use (education, minors). The code already sends `store:false`. Until ZDR is approved, say "up to 30 days" in the privacy texts, not "not kept". *verify*.
4. **Region**: OpenAI offers EU data residency for eligible API projects: Settings → Project → create a project with the **Europe** data residency (new projects only; availability by approval). If granted, use that project's API key. *verify eligibility*.

## Anthropic (reading PDFs and scans)
1. **DPA**: the Commercial Terms (API) already include a DPA with SCCs; Console → Settings → (Legal / Data processing) lets an admin accept it, otherwise email the sales/privacy contact. *verify*.
2. **Training**: Anthropic does not train on commercial/API data by default.
3. **Retention**: API inputs/outputs are kept for a limited period (check the current number in the Privacy Center, "How long do you store my organization's data?"). Zero-retention is by agreement with sales for eligible customers.
4. **Region**: the standard API processes in the US; ask sales whether an EU option exists for your volume. Otherwise rely on SCCs/DPF and disclose it (the texts already do).

## Mathpix (formula OCR)
1. **DPA / privacy**: Mathpix publishes a privacy policy and offers a DPA on request (privacy/legal contact on mathpix.com). Email them from the company address asking for the DPA and their sub-processor list. *verify*.
2. **Retention**: in the Mathpix account/API settings, turn off *saving images/results* (API option `"metadata": {"improve_mathpix": false}` for no use of your data to improve their models, and the "don't save" setting for request logging). *verify option names*.
3. **Region**: US processing; rely on SCCs.

## Email provider (Resend/SMTP) — not in your list but needed
Same pattern: sign the DPA in the dashboard (Resend: Settings → Legal), choose the EU region where offered, and set `LUNA_MAIL_FROM`/`RESEND_API_KEY`.

## After signing
- Replace "ask them not to retain" wording in `lib/legalTexts*.js` with what is true (e.g. "retention up to 30 days" until ZDR is granted).
- Fill the sub-processor table in `docs/SCHOOL_DPA_TEMPLATE_*.md` with the confirmed regions.
- Re-run `npm run dashboard:publish` if a model/provider changes.
