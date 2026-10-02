---
name: luna-dashboard
description: Update the LUNA presentation dashboard (docs/dashboard) and publish a new dated HTML version. Use whenever an AI prompt, model, price, AI request, flow step or the lunas/marketplace model changes, or when asked to change the dashboard.
---

# LUNA dashboard

The dashboard is generated, never hand-edited: `docs/dashboard/manifest.mjs` (data) +
`page.mjs` / `page.css` / `page.client.js` (design) → `build.mjs` → `versions/luna-dashboard-<date>.html`.

1. Edit the right file: content/numbers → `manifest.mjs`; layout/design → `page.*`.
   - New or changed AI request: add/update its entry in `REQUESTS` (purpose, why, position, model, params,
     token basis, and a `prompts` regex that captures the exact prompt from the source file).
   - Re-measure when you can and switch `basis` to `"measured"`.
2. `npm run dashboard:check` — must report 0 warnings (every prompt still found in the code).
3. `npm run dashboard:publish` — writes a NEW dated version (never overwrites; `-2`, `-3` suffixes the same
   day), updates `latest.html`, commits only `docs/dashboard`, and pushes.
4. Tell the user the new file name.

The user has standing permission for this commit + push (CLAUDE.md). Do not use it for other files.
