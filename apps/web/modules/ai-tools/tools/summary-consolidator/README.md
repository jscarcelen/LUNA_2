# Summary Notes Consolidator

A built-in agent (AI agents tab) that merges several documents into **one** exhaustive set of notes:
organised by topic, overlapping information written once, formulas (LaTeX), tables and figure
descriptions kept, and **every statement tagged with the original document and page/section it came
from**. It is also what builds a study plan's *master document* (see `../../../plans/master.js`).

- `consolidatorAgent.js` — the agent config (`CONSOLIDATOR_AGENT`), compiled from
  `createSummaryNotesConsolidatorSpec()` (`agent-studio/engine/model.ts`). Inputs: **Language** and an
  optional **Focus**. The documents are picked in the run page's material step from *any* subject or
  folder (`agent-builder/WorkspaceDocumentPicker.js`). Output blocks: document structure only —
  `document_header`, `section_header`, `heading`, `paragraph`, `bullet_list`, `callout`, `vocabulary`
  (the table row) — so it renders, restyles and exports like every other block agent.
- `index.js` — the tool manifest (registered in `../../registry.js`; the hub lists it automatically).
- The spec carries `pipeline: "consolidate"`; `pipeline/agentBuilder.js` sees it and runs
  `pipeline/consolidator.js` instead of one model call.

## Why not one model call: the long-input strategy

A normal agent run reads at most ~48k characters (best passages, `selectChunksWithinBudget`) and may
write ~6k tokens (`callOpenAiAgentBlocks`, `maxTokens: 6000`). For a consolidation that would silently
drop most of several long documents, which defeats the purpose. So the consolidator never ranks or
truncates: every passage of every document is read, in four passes that each fit the model, and every
pass keeps the passage ids (`S1…`) so provenance survives to the end.

1. **Map** — passages are packed into parts of ~12k characters (`MAP_GROUP_CHARS`, new part at a
   document boundary once 60 % full) and rewritten, up to 6 parts at a time, as topic-titled notes
   (strict JSON schema) that keep every fact/formula/table row/figure and cite their passages. A part
   the model cannot finish (`finish_reason: length`, unreadable JSON) is **halved and retried**; a
   passage the model did not cite is asked for again, then **carried over verbatim** by the local
   Markdown parser (`markdownToNotes`).
2. **Organise** — one small call sees only the draft *topic titles* (not the text) and returns the
   outline by subject matter, not by document; every topic id must be used exactly once (unknown ids
   dropped, forgotten topics appended).
3. **Merge** — per outline section, the drafts from all documents are merged into one section (overlaps
   once, disagreements kept in a warning callout, sources united). A single draft needs no merge; a
   section too big for one call (`MERGE_BATCH_CHARS`) is merged in batches and the results merged
   again. A merge that loses most of the text (<35 %) is discarded for the drafts with exact duplicates
   removed (`dedupeNotes`).
4. **Check** — deterministic: every LaTeX formula in the sources must appear in the result; missing
   ones are appended under a closing section with their source. Passage coverage is reported.

The whole run streams `progress` events (`phase`, `done`, `total`, `label`) and must finish inside the
stream route's 300 s window. Past 60 % of the 270 s `TIME_BUDGET_MS` the remaining parts use the local
parser instead of the model; past 90 % the remaining sections are only de-duplicated — larger inputs
lose polish, **never information**. Without `OPENAI_API_KEY` the local path does the whole job (merged
by heading, exact duplicates removed, still traced). Model: Luna 3 Pro floor (`resolveAgentModel`),
temperature 0.2.

Known limits: a table wider than three columns is written as one bullet per row (the block registry has
a 3-column table row only); duplicates the model does not recognise as equal can survive a merge;
near-duplicate bullets across *batches* of an oversized section are only merged while the second round
shrinks them.

## Provenance in the output

Every unit of text ends with a visible tag — `[D1 p.3 · D2 §Osmosis]` — and a **source key** at the top
lists `D1 — Biology notes.docx`, … . The blocks also carry the same places as data: `_tags` (the exact
suffixes) and `_refs` (document id/name, page, heading, passage), one entry per paragraph / bullet /
table row. `pipeline/masterDocument.js` turns the blocks into Markdown with each tag expanded to the
full document names, which is how retrieval, `/source` and the chat read a master document.

## Master document of a study plan

See `../../../plans/master.js` and `execute.js`: with 2+ uploaded documents the first thing a plan
builds is this agent's output, filed once in the plan's folder and stored as `plan.masterDocumentId`;
every later quiz/flashcard/summary reads it (`scope.documentIds = [master]`) so source links point at it.
