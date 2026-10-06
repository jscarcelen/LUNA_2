---
name: metaprompt
description: >-
  Takes a rough or poorly-formed prompt and rewrites it following Anthropic's
  prompt engineering best practices. Use when the user says "metaprompt this",
  "mejora este prompt", "optimiza esto para Claude", or pastes a prompt that
  needs sharpening before use. Also the checklist for writing or editing any
  prompt inside the LUNA app (agent/plan/concept-map generators and improvers).
---

# Metaprompt

Rewrite a raw user prompt so it is maximally effective for Claude, following Anthropic's prompt engineering principles.

Reference: Anthropic Prompting Best Practices — docs.anthropic.com/claude/docs/

## When to invoke

- User says "metaprompt: [prompt]" or "/metaprompt [prompt]"
- User says "mejora este prompt", "optimiza esto", "hazlo mejor para Claude"
- User pastes a prompt and asks how to make it work better
- Writing or editing a prompt that ships inside the LUNA app (see "LUNA prompts" below)

## Workflow

### Step 1: Diagnose — identify what is weak

Before rewriting, silently scan for these failure modes:

| Issue | Signs |
|---|---|
| Ambiguous intent | Multiple valid interpretations; unclear desired outcome |
| Missing context | No audience, no constraints, no background |
| No output spec | Format, length, tone, language unspecified |
| Hidden assumptions | Model would have to guess key facts |
| Complexity not decomposed | Multi-step task written as one blob |
| Vague criteria | Words like "good", "clear", "detailed" without definition |
| Buried instruction | Most important directive is mid-paragraph or at the end |
| Negative-only rules | "Do not X" without stating what to do instead |
| Bare constraints | Rules without explaining why they matter |
| Data after instructions | Lengthy input (documents, code) placed below the task/query |
| No verification step | Reasoning or evaluation task without a self-check instruction |

### Step 2: Infer intent

State the most charitable, useful interpretation of what the user wants. If multiple interpretations exist, pick the most actionable one and note it briefly. Do not ask for clarification unless a critical piece of context is truly unknowable.

### Step 2.5: Classify prompt complexity

Determine which rewrite path to follow:

| Type | Signals | Rewrite path |
|---|---|---|
| Simple prompt | Single task, no variables, one-off use | Apply principles inline, output rewritten prompt |
| Template prompt | Has variables, will be reused across inputs | Follow Anthropic's 3-step architecture (see below) |
| Cursor rule / skill | Targets .mdc or SKILL.md format | Apply imperative style, micro-examples, activation mode guidance |

Anthropic 3-step architecture (for template prompts):

- Inputs: identify the minimal, non-overlapping set of input variables
- Instructions Structure: plan where each variable goes (lengthy values BEFORE task directives)
- Instructions: write the prompt template with {{VAR_NAME}} placeholders wrapped in XML tags

### Step 3: Rewrite — apply these principles

| Principle | How to apply |
|---|---|
| Top-down structure | Most important instruction first, not buried |
| Specific over vague | Replace "good analysis" with "3-bullet analysis covering X, Y, Z" |
| Explicit output format | State: bullet list / paragraph / table / JSON / slide structure |
| Role when useful | Add "You are a [role]..." when it sharpens the output |
| XML tags for separation | Use <context>, <task>, <constraints>, <examples> for complex prompts |
| Chain of thought | Add "Think step by step before answering" for reasoning tasks |
| Task decomposition | Break complex tasks into numbered sub-steps |
| Remove hedge-stacking | Delete "please", "if possible", "try to", "I was wondering if" |
| Examples | Add [EXAMPLE: ...] placeholder if few-shot would sharpen output; 3-5 diverse examples for format-sensitive tasks |
| [FILL IN: ...] | Use for context the user must supply; do not guess |
| Positive framing | Convert "do not use markdown" to "respond in flowing prose paragraphs". Positive instructions consistently outperform negative ones |
| Motivation for constraints | Add a because clause so Claude generalizes from the explanation, not just memorizes the rule |
| Data-first ordering | Move lengthy inputs (documents, code, data) ABOVE the task/query. Queries at the end improve quality by up to 30% |
| Variable templating | Use {{VAR_NAME}} wrapped in XML tags for dynamic content in reusable templates |
| Self-check | Add "Before finishing, verify your answer against [criteria]" for reasoning, math, or evaluation tasks |
| Reasoning before answer | Ask for justification/analysis BEFORE the final score, answer, or classification |
| Style mirroring | Match the prompt's own formatting to the desired output format (e.g., removing markdown from the prompt reduces markdown in the output) |

### Step 4: Explain

In 2-4 bullets: what changed and why. Teach, not just fix.

## Output Format

*Rewritten prompt:*
[improved prompt, ready to copy-paste]

*What changed:*
- [change 1 and why]
- [change 2 and why]
- [change 3 and why, if applicable]
- [change 4 and why, if applicable]

For template prompts, also output the variables list before the rewritten prompt:

*Variables:* {{VAR_1}}, {{VAR_2}}

*Rewritten prompt:*
[template with {{VAR}} placeholders and XML tags]

*What changed:*
- ...

## Rules

- Do not answer the original prompt — only rewrite it
- Preserve the user's intent; do not add new goals they did not imply
- Use the same language as the input prompt (ES/EN)
- If the prompt is already good, say so and explain why (one line)
- Output in the same language as the user's message

## Model-Aware Tuning

When rewriting, keep in mind how Claude's latest models behave:

- Opus 4.7 is more literal. If a rule should apply broadly, state the scope explicitly ("Apply this formatting to every section, not just the first"). Do not rely on Claude inferring generalization from one example.
- Dial back aggressive language. On 4.5+ models, "CRITICAL: You MUST use this tool" causes overtriggering. Prefer normal phrasing: "Use this tool when...".
- Prefer general thinking instructions over prescriptive steps. "Think thoroughly before answering" often produces better reasoning than hand-written step-by-step plans. Claude's own reasoning frequently exceeds what a human would prescribe.
- Effort-level awareness. If the prompt targets an API use case, consider noting the appropriate effort level (low for quick lookups, high/xhigh for reasoning-heavy or agentic tasks).

## LUNA prompts (prompts that ship inside the app)

The same principles apply to every prompt in `apps/web` (agent builder + its improvers, study plans, concept maps, consolidator, coach, grading, template studio). On top of the rules above:

- Keep the prompt an inline string where it is today. `docs/dashboard/manifest.mjs` extracts prompts from the source with regexes (`prompts[].re`); after editing one, run `npm run dashboard:check` and fix the regex or the manifest if it stops matching, then publish a new dashboard version.
- Generators return **content-only JSON** matching the existing schema. Never change a schema or field name just to reword a prompt.
- Put long input (document text, plan state, chat history) above the task, wrapped in XML tags; state the task and the output format last.
- Say why each rule exists, and phrase rules positively ("write in the language of the material", not "do not write in English").
- Prompts that rewrite or improve another prompt (agent refine / improve / iterate) must preserve the user's intent, add no goals they did not imply, and keep their language.
- Ask for reasoning/analysis fields before the final answer fields when the schema allows it, and end with a short self-check against the stated criteria.
- Keep `provider-local.js` (no-key fallback) working and the output language equal to the user's.
