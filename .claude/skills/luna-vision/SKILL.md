---
name: luna-vision
description: Align any change, feature, refactor or product decision in LUNA (~/LUNA_2) with the founder's product vision in docs/LUNA_VISION.md. Use before planning or implementing anything in this repo, when the founder gives new context about the idea ("remember that…", "the platform should…", "add to the vision"), or when a request might conflict with the vision.
---

# LUNA vision alignment

The single source of truth is **`docs/LUNA_VISION.md`**. It holds the founder's product vision
(profiles, archetypes, subscription flow, key functionality, agent generator rules, revenue model,
agent architecture), the standing rules from earlier sessions, and an alignment checklist.

## Before any change

1. Read `docs/LUNA_VISION.md` (at least sections 3, 5, 9 and 10) if it is not already in context.
2. Run the **alignment checklist (section 10)** against the request:
   archetype & profiles · agents/templates decoupled & sellable · no AI jargon for teachers/parents ·
   feeds tracking (difficulty, objective scores, error list) · token-cost visibility · environment
   not app (identity over time, parent↔child links, friends, lunas) · agent hygiene (dedupe,
   guardrails, critic layer) · design language and the shared 3-step agent flow.
3. If the request is aligned, build it — mention in one line which principle it serves when that
   is not obvious.
4. If it conflicts, say so in one or two sentences, propose the aligned alternative, then follow the
   founder's decision (a repeated request is a decision).
5. Prefer changes that move the roadmap toward the vision (e.g. store difficulty on generated
   questions now so tracking can use it later) over isolated conveniences.

## When the founder gives new vision context

- Append it to `docs/LUNA_VISION.md`: structured/improved wording in the relevant section **and**
  the verbatim original in Appendix A (dated). Add a line to Appendix B.
- Never drop or paraphrase-away a point; if two instructions conflict, keep both and flag the
  conflict at the top of the affected section.
- Commit and push the doc with the next change.

## Where things live

- Vision & principles: `docs/LUNA_VISION.md`
- Current architecture: `docs/AGENT_STUDIO_ARCHITECTURE.md`, `docs/TEMPLATE_STUDIO_ARCHITECTURE.md`
- What has been built: `docs/IMPLEMENTATION_LOG.md`
- Deployment: production follows `main` → https://luna2-share-web.vercel.app
