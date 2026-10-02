# LUNA dashboard

A self-contained HTML presentation of what LUNA does, how information flows, every AI request
(model, tokens, cost, **exact prompt**), unit costs, an operating-cost calculator, the lunas
financial model, performance metrics and risks. Open any file in `versions/` in a browser; press
**P** for presentation mode.

## Versions

Every change produces a **new dated file** and nothing is overwritten:

```
docs/dashboard/versions/luna-dashboard-2026-10-01.html
docs/dashboard/versions/luna-dashboard-2026-10-01-2.html   # second change the same day
docs/dashboard/latest.html                                 # copy of the newest version
```

## Commands (repo root)

```bash
npm run dashboard            # build a new version if anything changed
npm run dashboard:publish    # ...and commit + push it (only docs/dashboard)
npm run dashboard:check      # verify every prompt is still found in the code, write nothing
node docs/dashboard/build.mjs --date 2026-12-01   # force the date in the file name
```

If the content is identical to the newest version (same hash) no file is written.

## Files

| File | Role |
| --- | --- |
| `manifest.mjs` | All the facts: requests, stages, flow nodes, measured numbers, infra and pricing assumptions, risks. **Edit this to change the content.** |
| `page.mjs` | HTML template (sections, flow diagram SVG, request cards). |
| `page.css`, `page.client.js` | Design, calculators, filters, presentation mode. |
| `build.mjs` | Reads the code, extracts prompts, computes costs, writes the versioned file, optional git publish. |

## What is read from the code vs. written by hand

- **From the code at build time:** `MODEL_PRICING` (agentBuilder.js) and the text of every prompt.
  Each prompt in `manifest.mjs` has a regex; if the code changes and a regex stops matching, the
  build warns and the card shows a visible warning instead of a prompt. Fix the regex and rebuild.
- **Measured** (real calls, see `MEASURED`): PDF → Markdown, concept tree, agent run, plan generate.
- **Estimated:** everything labelled `estimated` (token counts from prompt size). Replace with
  measurements when available and change `basis` to `"measured"`.
- **Assumed:** user counts, usage per month, plan prices, lunas price, Vercel/Supabase prices.
  They are inputs in the page's calculators, defaults in `manifest.mjs`.

## When to rebuild

Whenever a prompt, model, price, AI request, flow step, or the lunas/marketplace model changes, add
or update the entry in `manifest.mjs` and run `npm run dashboard:publish`.
