/**
 * LUNA dashboard — the data behind the presentation.
 *
 * Everything the page says about AI requests lives here. Two kinds of fact are kept apart:
 *  - FROM THE CODE: models, parameters, schemas and the EXACT prompts. They are pulled out of the
 *    source files by the `prompts` regexes at build time, so the page cannot drift from the code.
 *    If a regex stops matching, the build says so and the card shows a warning instead of a prompt.
 *  - MEASURED / ESTIMATED / ASSUMED: token counts and prices. Each carries its basis, shown in the
 *    page, so a number is never presented as more certain than it is.
 *
 * To change the page: edit this file (data), page.css / page.client.js / page.mjs (design), then run
 *   npm run dashboard:publish
 * which writes a NEW dated version and commits + pushes it. Old versions are never overwritten.
 */

export const META = {
  title: "LUNA",
  tagline: "Upload your material → get a study plan → generate practice with AI agents → sell what you build",
  repo: "apps/web"
};

/* ------------------------------------------------------------------------------------ prices */

/** USD per 1M tokens. GPT prices are read from MODEL_PRICING in agentBuilder.js at build time. */
export const EXTRA_PRICES = {
  "text-embedding-3-small": { input: 0.02, output: 0, source: "OpenAI list price" },
  "claude-haiku-4-5": { input: 1, output: 5, source: "Anthropic list price" }
};

export const MODELS = [
  { id: "gpt-4o", label: "GPT-4o", brand: "Luna 3 Pro", use: "Every generation call: documents, concept maps, plans, agent runs, coaching, refinement, template design. The quality floor." },
  { id: "gpt-4o-mini", label: "GPT-4o mini", brand: "Luna 3 Mini", use: "Retired: too inaccurate. Any request for it is run on Pro. Kept in the price table only." },
  { id: "gpt-4.1", label: "GPT-4.1", brand: "Luna 3 Max", use: "Optional upgrade for agent runs (cheaper per token than GPT-4o)" },
  { id: "text-embedding-3-small", label: "text-embedding-3-small", brand: "—", use: "Embeddings of every chunk of an uploaded document" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", brand: "—", use: "Fallback for scanned PDFs without selectable text" }
];

/* ------------------------------------------------------------------------------------ stages */

export const STAGES = [
  { id: "upload", label: "1 · Upload", color: "#0071e3", blurb: "A file becomes clean, searchable, structured text." },
  { id: "plan", label: "2 · Study plan", color: "#2f9e5b", blurb: "Material + a deadline become a schedule that adapts." },
  { id: "agents", label: "3 · Agents & practice", color: "#8a4fd6", blurb: "Agents write quizzes, summaries and flashcards from the material." },
  { id: "design", label: "3b · Template Studio", color: "#d8366f", blurb: "AI helps design the look of the documents agents produce." },
  { id: "track", label: "4 · Track", color: "#e0730f", blurb: "Results become a diagnosis of what to do next." }
];

/* ---------------------------------------------------------------------------------- requests */

const SRC = {
  vision: "apps/web/modules/document-processing/parsers/aiVisionExtractor.js",
  concepts: "apps/web/modules/ai-tools/pipeline/conceptExtractor.js",
  agent: "apps/web/modules/ai-tools/pipeline/agentBuilder.js",
  embed: "apps/web/modules/ai-tools/pipeline/embeddings.js",
  quiz: "apps/web/modules/ai-tools/pipeline/provider-openai.js",
  designer: "apps/web/modules/template-studio/server/designer.js",
  tchat: "apps/web/app/api/templates/template-chat/route.js",
  generate: "apps/web/app/api/plans/generate/route.js",
  revise: "apps/web/app/api/plans/revise/route.js",
  resConcepts: "apps/web/app/api/resources/concepts/route.js",
  refine: "apps/web/app/api/ai-tools/agent-builder/refine/route.js",
  iterate: "apps/web/app/api/ai-tools/agent-builder/iterate/route.js",
  improve: "apps/web/app/api/ai-tools/agent-builder/improve/route.js",
  coach: "apps/web/app/api/performance/coach/route.js",
  chat: "apps/web/modules/chat/engine.js"
};

/**
 * `tokens.typical` — one representative call. `tokens.scale` — how it grows (used by the calculators).
 * `basis`: "measured" (real call, date in MEASURED), "estimated" (counted from the prompt + judgement).
 * `prompts[].re` — regex with ONE capture group: the text to show. Template literals are shown raw,
 * with their ${…} placeholders, because that is what the code sends.
 */
export const REQUESTS = [
  /* ============================================================ 1 · UPLOAD */
  {
    id: "U1", stage: "upload", name: "PDF → Markdown", status: "live",
    purpose: "Turns an uploaded PDF into clean Markdown (headings, formulas as LaTeX, tables, figure descriptions) that both the AI and the document viewer read.",
    why: "PDFs are visual. Plain text extraction loses formulas, tables and figures, so the model reads the PDF itself, page by page.",
    position: "Right after the user drops a PDF. Everything downstream (chunks, concept map, plans, agents) is built on this text.",
    trigger: "Upload of a .pdf (workspace → upload)",
    file: SRC.vision, anchor: /async function extractPdfViaMarkdown/,
    model: "gpt-4o", modelEnv: "LUNA_DOCUMENT_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0, maxTokens: 16384, format: "Free text (Markdown), PDF sent as a file input", streaming: false },
    input: "The whole PDF (file input: OpenAI extracts the text of each page and also looks at the page image) + the system prompt + one short instruction.",
    output: "Markdown with a <!-- page N --> marker per page. Converted to the canonical document model (blocks, equations, tables) and stored.",
    fallbacks: "If it fails: pdfjs text extraction + GPT-4o JSON structuring (U4). If the PDF has no selectable text: Claude Haiku (U5).",
    tokens: { basis: "measured", scale: { unit: "page", label: "PDF page", fixedIn: 0, inPer: 744, outPer: 451, units: 10 } },
    seconds: { typical: 34, note: "≈ 3–4 s per page (measured)" },
    prompts: [
      { label: "System prompt", file: SRC.vision, re: /const MARKDOWN_SYSTEM_PROMPT = `([\s\S]*?)`;/ },
      { label: "User message (request body)", file: SRC.vision, re: /const \{ text, finishReason \} = await callOpenAIText\(\[([\s\S]*?)\n  \]\);/ }
    ]
  },
  {
    id: "U2", stage: "upload", name: "PowerPoint → document model", status: "live",
    purpose: "Reads a .pptx (slide text plus up to 5 embedded images) and returns the structured document JSON.",
    why: "Slides mix text, diagrams and images; the model describes the visuals so they become searchable material.",
    position: "After a .pptx upload.",
    trigger: "Upload of a .pptx",
    file: SRC.vision, anchor: /async function extractPptx/,
    model: "gpt-4o", modelEnv: "(fixed)", provider: "OpenAI · chat/completions",
    params: { temperature: "default (1)", maxTokens: 8192, format: "JSON object (json_object mode)", streaming: false },
    input: "System prompt + the text of every slide (first 40,000 characters) + up to 5 images at high detail.",
    output: "JSON: title, equations (LaTeX), sections → blocks (heading, paragraph, table, list, figure…).",
    fallbacks: "None. Output is capped at 8,192 tokens, so very long decks can be cut off.",
    tokens: { basis: "estimated", scale: { unit: "slide", label: "slide", fixedIn: 3250, inPer: 105, outPer: 280, units: 20 } },
    seconds: { typical: 45, note: "estimate" },
    prompts: [
      { label: "System prompt (shared with U3, U4)", file: SRC.vision, re: /function buildSystemPrompt\(sourceType\) \{\n  return `([\s\S]*?)`;\n\}/ },
      { label: "User message", file: SRC.vision, re: /const userParts = \[([\s\S]*?)\n  \];/ }
    ]
  },
  {
    id: "U3", stage: "upload", name: "Image / handwriting → document model", status: "live",
    purpose: "Transcribes a photo or scan (including handwriting and formulas) into the structured document JSON.",
    why: "Students photograph notes and board work; this makes them first-class material.",
    position: "After an image upload.",
    trigger: "Upload of an image (png, jpg…)",
    file: SRC.vision, anchor: /async function extractImage/,
    model: "gpt-4o", modelEnv: "(fixed)", provider: "OpenAI · chat/completions (vision)",
    params: { temperature: "default (1)", maxTokens: 8192, format: "JSON object (json_object mode)", streaming: false },
    input: "System prompt + the image (high detail) + one instruction line.",
    output: "JSON document model with transcribed text, LaTeX equations and a confidence per block.",
    fallbacks: "None.",
    tokens: { basis: "estimated", scale: { unit: "image", label: "image", fixedIn: 2100, inPer: 1100, outPer: 900, units: 1, firstFree: true } },
    seconds: { typical: 14, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.vision, re: /function buildSystemPrompt\(sourceType\) \{\n  return `([\s\S]*?)`;\n\}/ },
      { label: "User message", file: SRC.vision, re: /async function extractImage\(file\) \{[\s\S]*?type: "text",\n\s*text: (`[^`]*`)/ }
    ]
  },
  {
    id: "U4", stage: "upload", name: "PDF text → document model (backup path)", status: "fallback",
    purpose: "Backup for U1: pdfjs pulls the raw text locally, then GPT-4o structures it in chunks of 12,000 characters.",
    why: "Keeps uploads working when the Markdown conversion fails.",
    position: "Only if U1 throws an error.",
    trigger: "U1 failure",
    file: SRC.vision, anchor: /async function extractPdf\(file\)/,
    model: "gpt-4o", modelEnv: "(fixed)", provider: "OpenAI · chat/completions",
    params: { temperature: "default (1)", maxTokens: 8192, format: "JSON object", streaming: false },
    input: "System prompt + one 12,000-character chunk of the PDF's text (chunks run in parallel).",
    output: "JSON document model per chunk, merged into one document.",
    fallbacks: "If structuring fails, the raw text is stored as plain paragraphs.",
    tokens: { basis: "estimated", scale: { unit: "chunk", label: "12k-character chunk", fixedIn: 1100, inPer: 3000, outPer: 3500, units: 3 } },
    seconds: { typical: 20, note: "estimate (chunks in parallel)" },
    prompts: [
      { label: "User message builder", file: SRC.vision, re: /function buildPdfUserPrompt\([^)]*\) \{([\s\S]*?)\n\}/ }
    ]
  },
  {
    id: "U5", stage: "upload", name: "Scanned PDF → text (Claude)", status: "fallback",
    purpose: "Reads PDFs that have no selectable text (scans) using Claude's native PDF vision.",
    why: "Image-only PDFs would otherwise be unreadable.",
    position: "Only when pdfjs finds no text in the PDF and U1 failed.",
    trigger: "Scanned PDF",
    file: SRC.vision, anchor: /async function extractPdfWithAnthropic/,
    model: "claude-haiku-4-5", modelEnv: "(fixed)", provider: "Anthropic · messages",
    params: { temperature: "default", maxTokens: 4096, format: "Free text (Markdown-ish); then structured by U4's prompt", streaming: false },
    input: "The PDF as a document block + an extraction instruction.",
    output: "Text with headings, lists, tables, LaTeX. Capped at 4,096 output tokens (long scans are cut).",
    fallbacks: "If it fails: an honest 'no selectable text' placeholder document.",
    tokens: { basis: "estimated", scale: { unit: "page", label: "scanned page", fixedIn: 300, inPer: 1500, outPer: 400, units: 10, outCap: 4096 } },
    seconds: { typical: 30, note: "estimate" },
    prompts: [
      { label: "Request body", file: SRC.vision, re: /body: JSON\.stringify\(\{\n      model: "claude-haiku-4-5-20251001",([\s\S]*?)\n    \}\)\n  \}\);\n\n  if \(!res\.ok\) \{\n    const errText = await res\.text\(\)\.catch\(\(\) => ""\);\n    throw new Error\(`Anthropic/ }
    ]
  },
  {
    id: "U6", stage: "upload", name: "Embeddings of every chunk", status: "live",
    purpose: "Turns each chunk (up to 700 words) of the document into a vector so passages can be found by meaning.",
    why: "Retrieval: agents and the source viewer need to find the right passage inside long documents.",
    position: "When the processed document is saved to the database (after U1–U3 or the DOCX parser).",
    trigger: "Saving an uploaded/updated document",
    file: SRC.embed, anchor: /async function requestEmbeddings/,
    model: "text-embedding-3-small", modelEnv: "LUNA_EMBEDDING_MODEL", provider: "OpenAI · embeddings",
    params: { temperature: "—", maxTokens: "—", format: "1,536-number vector per chunk", streaming: false },
    input: "All chunks of the document in batches (each clamped to 7,600 tokens).",
    output: "One vector per chunk, stored in document_chunks (pgvector).",
    fallbacks: "Document is saved without vectors; keyword/heading ranking still works.",
    tokens: { basis: "estimated", scale: { unit: "chunk", label: "chunk", fixedIn: 0, inPer: 250, outPer: 0, units: 18 } },
    seconds: { typical: 2, note: "estimate" },
    prompts: [
      { label: "Request body (no prompt — raw text in, vector out)", file: SRC.embed, re: /body: JSON\.stringify\(\{([\s\S]*?)\n    \}\)\n  \}\);\n\n  const data = await response\.json\(\);/ }
    ]
  },
  {
    id: "U7", stage: "upload", name: "Concept tree of the document", status: "live",
    purpose: "Extracts a tree of at most 20 trackable concepts (root → areas → skills) from the document.",
    why: "The concept map is how LUNA tracks mastery, tags plan steps and decides what to practise.",
    position: "Right after the document is saved (non-blocking), and again when a plan is opened or the map is rebuilt.",
    trigger: "Document saved · plan opened without concepts · 'Rebuild concept map'",
    file: SRC.concepts, anchor: /export async function extractConcepts/,
    model: "gpt-4o", modelEnv: "LUNA_CONCEPT_MODEL / LUNA_AGENT_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.2, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "System prompt + the first 12,000 characters of the document text.",
    output: "≤ 20 concepts, each with name, parent, description, topic, Bloom level, difficulty, importance, question types, source pages. Saved as concepts + concept_prerequisites.",
    fallbacks: "No concepts are created; the plan page offers a rebuild.",
    tokens: { basis: "measured", typical: { in: 3600, out: 970 }, scale: null },
    seconds: { typical: 9, note: "measured: 7.9–9.8 s" },
    prompts: [
      { label: "System prompt", file: SRC.concepts, re: /const SYSTEM_PROMPT = `([\s\S]*?)`;/ },
      { label: "User message", file: SRC.concepts, re: /\{ role: "user", content: (`DOCUMENT TEXT:[^`]*`) \}/ },
      { label: "Output schema", file: SRC.concepts, re: /const EXTRACTION_SCHEMA = (\{[\s\S]*?\n\});/ }
    ]
  },

  /* ============================================================ 2 · STUDY PLAN */
  {
    id: "P1", stage: "plan", name: "Generate the study plan", status: "live",
    purpose: "Spreads the work between today and the deadline: reading, generated practice, spaced repetition and a final review.",
    why: "Turns 'I have an exam on the 30th' into dated steps that fit the time the learner has.",
    position: "When the learner presses 'Plan it for me'.",
    trigger: "Study plans → Plan it for me",
    file: SRC.generate, anchor: /export async function POST/,
    model: "gpt-4o", modelEnv: "LUNA_PLAN_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.3, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "Deadline, minutes per week, the agents the learner put in scope (built-in and their own, each with what it can make), the learner's performance history, the document's concept map (canonical names only) and the list of chosen material.",
    output: "Plan name and note, 2–6 goals, a coverage ledger (every concept → where it is studied and tested) and dated steps (read / activity / review / exam) saying what Luna should generate for each. The result is then checked in code: any concept not studied and tested is added to a step, and the final exam lists them all.",
    fallbacks: "Error shown; nothing saved. Before the call, concepts are read from the material (U7) if the documents have none yet.",
    tokens: { basis: "measured", scale: { unit: "step", label: "plan step", fixedIn: 1500, inPer: 0, outPer: 85, units: 9 } },
    seconds: { typical: 5, note: "measured 4.7 s for 9 steps" },
    prompts: [
      { label: "System prompt", file: SRC.generate, re: /content: `(You are a study planner\.[\s\S]*?)`\n          \},/ },
      { label: "User message", file: SRC.generate, re: /content: (`Deadline: \$\{deadline\}[^`]*`)/ }
    ]
  },
  {
    id: "P2", stage: "plan", name: "Re-plan when material is added", status: "live",
    purpose: "Re-schedules everything still to do (old pending steps + steps for the new material) in the time that is left; finished work is untouched.",
    why: "Adding a document should not mean starting over or losing progress.",
    position: "After the learner adds uploaded material or a generated resource to an existing plan.",
    trigger: "Study plan → Add to this plan → Confirm",
    file: SRC.revise, anchor: /export async function POST/,
    model: "gpt-4o", modelEnv: "LUNA_PLAN_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.2, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "Today, deadlines, pace, the plan's agent scope, the finished steps (fixed), the pending steps (movable, with ids), the new material and concept map, performance.",
    output: "The new schedule of everything still to do (each step either keeps an existing id or is new) + optional goals for the new material.",
    fallbacks: "A local scheduler spreads the steps evenly and keeps the exam last.",
    tokens: { basis: "estimated", typical: { in: 2400, out: 1500 }, scale: null },
    seconds: { typical: 8, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.revise, re: /content: `(You are a study planner re-planning[\s\S]*?)`\n          \},/ },
      { label: "User message", file: SRC.revise, re: /content: (`Today: \$\{today\}[^`]*`)/ }
    ]
  },
  {
    id: "P3", stage: "plan", name: "What does this resource teach?", status: "on-demand",
    purpose: "Lists 3–12 small learning goals a generated resource (quiz, summary) teaches, so several resources can be tied to the same concept.",
    why: "Plans and mastery link resources through shared concepts.",
    position: "When a resource is opened in the library and its concepts are requested.",
    trigger: "Resource detail → concepts",
    file: SRC.resConcepts, anchor: /export async function POST/,
    model: "gpt-4o", modelEnv: "LUNA_CONCEPT_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.2, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "Resource name, source material names, up to 40 questions and a 4,000-character content sample.",
    output: "A one-sentence context and 3–12 concepts (name, detail, level).",
    fallbacks: "Concepts stay empty.",
    tokens: { basis: "estimated", typical: { in: 1500, out: 450 }, scale: null },
    seconds: { typical: 5, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.resConcepts, re: /\{ role: "system", content: "([^"]*)" \}/ },
      { label: "User message", file: SRC.resConcepts, re: /\{ role: "user", content: (`Resource:[^\n]*`) \}\n/ }
    ]
  },

  /* ============================================================ 3 · AGENTS */
  {
    id: "A1", stage: "agents", name: "Run an agent (items)", status: "live",
    purpose: "The core generation call: an agent turns the learner's choices + retrieved passages of their material into structured items (quiz questions, flashcards, summaries…).",
    why: "This is what students and teachers actually use every day; it is the call whose cost scales with usage.",
    position: "When the user presses Generate on any agent (Quiz Generator, Flashcards, custom agents).",
    trigger: "Agent run page → Generate (streamed)",
    file: SRC.agent, anchor: /async function callOpenAiAgent\(/,
    model: "gpt-4o", modelEnv: "LUNA_AGENT_MODEL (floored at Pro; the runner can upgrade to Max = gpt-4.1)", provider: "OpenAI · chat/completions (streaming)",
    params: { temperature: "0.2 low · 0.55 medium · 0.9 high", maxTokens: 6000, format: "JSON schema (strict), built from the agent's output fields + a _source field", streaming: true },
    input: "System prompt + one JSON message: agent instructions, output fields, the learner's answers (count, difficulty, language…), the best-matching chunks of the material (up to 48,000 characters ≈ 12k tokens) and optional style examples.",
    output: "{ items: [...] } validated against the agent's rules; each item cites the passage it came from (_source) which becomes the source link in the answer key.",
    fallbacks: "One retry at temperature 0.2 and 3,000 tokens; then a local heuristic generator.",
    tokens: { basis: "measured", scale: { unit: "1,000 characters of material", label: "k chars of material", fixedIn: 1150, inPer: 294, outPer: 0, units: 12, outPerItem: 87, items: 10 } },
    seconds: { typical: 12, note: "measured 11.6–12.1 s for 10 questions" },
    prompts: [
      { label: "System prompt", file: SRC.agent, re: /content: withRevision\("(You are a configurable AI agent runtime[^"]*)", config\)/ },
      { label: "Added when the user iterates (A7 + this note)", file: SRC.agent, re: /const REVISION_NOTE = `([\s\S]*?)`;/ },
      { label: "User message builder", file: SRC.agent, re: /(function buildUserMessage\([\s\S]*?\n\})/ }
    ]
  },
  {
    id: "A2", stage: "agents", name: "Run a block agent", status: "live",
    purpose: "Same as A1 for agents that compose a document from Template Studio components (headings, key points, questions…) in the order the model decides.",
    why: "Lets creators build 'a summary with a title, 3 bullets and a quiz' without writing a schema.",
    position: "When a block-based agent is run.",
    trigger: "Agent run page → Generate (block agent)",
    file: SRC.agent, anchor: /async function callOpenAiAgentBlocks/,
    model: "gpt-4o", modelEnv: "LUNA_AGENT_MODEL (floored at Pro)", provider: "OpenAI · chat/completions (streaming)",
    params: { temperature: "0.2 / 0.55 / 0.9", maxTokens: 6000, format: "JSON schema (non-strict) — flat array of typed blocks", streaming: true },
    input: "System prompt listing the allowed block types and their fields + the composition rules produced by A3 + the material.",
    output: "A list of typed blocks; the planner maps them onto Template Studio components.",
    fallbacks: "Retry at low creativity; then a minimal local result.",
    tokens: { basis: "estimated", typical: { in: 4800, out: 700 }, scale: null },
    seconds: { typical: 10, note: "estimate" },
    prompts: [
      { label: "System prompt (template)", file: SRC.agent, re: /const systemPrompt = `(You are a content generation assistant[\s\S]*?)`;/ },
      { label: "User message", file: SRC.agent, re: /(const userMessage = JSON\.stringify\(\{[\s\S]*?\n  \}\);)/ }
    ]
  },
  {
    id: "A3", stage: "agents", name: "Turn vague instructions into rules (block agents)", status: "live",
    purpose: "Rewrites the creator's loose wording ('3 bullets divided by dividers') into numbered rules plus a JSON skeleton.",
    why: "Makes block agents obey exact counts and ordering.",
    position: "Just before A2, in the same run.",
    trigger: "Block agent run (only when the agent has instructions)",
    file: SRC.agent, anchor: /async function enhanceOutputInstructions/,
    model: "gpt-4o", modelEnv: "(fixed: MIN_AGENT_MODEL)", provider: "OpenAI · chat/completions",
    params: { temperature: 0, maxTokens: 500, format: "Free text", streaming: false },
    input: "The creator's instructions + the allowed block types and fields.",
    output: "A numbered ruleset and a JSON skeleton, injected into A2's system prompt.",
    fallbacks: "Uses the raw instructions.",
    tokens: { basis: "estimated", typical: { in: 950, out: 350 }, scale: null },
    seconds: { typical: 3, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.agent, re: /const systemMsg = `([\s\S]*?)`;/ },
      { label: "User message", file: SRC.agent, re: /(\{ role: "user", content: `Instructions:[^`]*` \})/ }
    ]
  },
  {
    id: "A4", stage: "agents", name: "Refine the agent's recipe", status: "live",
    purpose: "A hidden 'metaprompt engineer' rewrites what the creator wrote into a precise brief, adds implied rules and completes empty field descriptions.",
    why: "Creators never see prompts; they just get better results.",
    position: "While creating or saving an agent in Agent Studio.",
    trigger: "Agent Studio → generate/refine recipe",
    file: SRC.refine, anchor: /export async function POST/,
    model: "gpt-4o", modelEnv: "LUNA_REFINER_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.2, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "The agent spec: name, purpose, instructions, inputs, material slots, output fields, one example.",
    output: "Rewritten instructions, a style line, ≤ 6 constraints, field descriptions, a note for the creator.",
    fallbacks: "Agent keeps the creator's wording.",
    tokens: { basis: "estimated", typical: { in: 1300, out: 450 }, scale: null },
    seconds: { typical: 5, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.refine, re: /\{ role: "system", content: "([^"]*)" \}/ },
      { label: "User message", file: SRC.refine, re: /(\{ role: "user", content: JSON\.stringify\(\{[^\n]*\}\) \})/ }
    ]
  },
  {
    id: "A5", stage: "agents", name: "Improve the agent from feedback", status: "live",
    purpose: "Turns 'make it harder / shorter' feedback about a test run into minimal patches to the agent's spec.",
    why: "Creators improve agents in plain words.",
    position: "In Agent Studio's test step.",
    trigger: "Test run → feedback",
    file: SRC.improve, anchor: /export async function POST/,
    model: "gpt-4o", modelEnv: "LUNA_AGENT_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.2, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "Agent spec (name, purpose, instructions, fields) + last run + the feedback.",
    output: "A list of patches (instructions.core / style / constraints / field.description) and a short reasoning.",
    fallbacks: "Without a key: the feedback is added as a rule.",
    tokens: { basis: "estimated", typical: { in: 1200, out: 250 }, scale: null },
    seconds: { typical: 4, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.improve, re: /\{ role: "system", content: "([^"]*)" \}/ },
      { label: "User message", file: SRC.improve, re: /(\{ role: "user", content: JSON\.stringify\(\{[^\n]*\}\) \})/ }
    ]
  },
  {
    id: "A7", stage: "agents", name: "Improve an 'Iterate' request", status: "live",
    purpose: "Turns the few words a user types after reading a result ('give more examples') into a precise revision brief with a verifiable checklist, and names the original limits the request overrides (for example 'one page').",
    why: "Left as typed, the model changes little and the agent's original limits win. With the brief the change is visible.",
    position: "When the user presses 'Apply to the result' in Iterate, right before the rewrite (A1/A2).",
    trigger: "Run page → Iterate → Apply",
    file: SRC.iterate, anchor: /export async function POST/,
    model: "gpt-4o", modelEnv: "LUNA_REFINER_MODEL (floored at Pro)", provider: "OpenAI · chat/completions",
    params: { temperature: 0.2, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "The user's request, the agent's name and original instructions, the user's choices, the current result as text (first 6,000 characters) and earlier requests.",
    output: "A one-sentence 'Luna understood…' (shown to the user), the brief, a 3–6 item checklist, the constraints relaxed and what to keep. The rewrite is then run with all of it plus the previous result.",
    fallbacks: "The user's own words are sent unchanged.",
    tokens: { basis: "estimated", typical: { in: 2400, out: 330 }, scale: null },
    seconds: { typical: 4, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.iterate, re: /content: "(You are the prompt improver[\s\S]*?)"\n          \},/ }
    ]
  },
  {
    id: "A8", stage: "agents", name: "Assistant chat", status: "live",
    purpose: "The chatbot: answers about the learner's material with references, answers questions about Luna, and proposes cards (run an agent, write a document, create an agent) that do nothing until the user approves them.",
    why: "One place to ask for anything instead of hunting through pages; it is also how Luna learns which requests it cannot do yet (they are recorded as feature requests).",
    position: "Every message sent in AI agents → Chatbot. The model can call search tools first (a second call with the passages).",
    trigger: "Chatbot → Send",
    file: SRC.chat, anchor: /export async function runChat\(/,
    model: "gpt-4o", modelEnv: "LUNA_CHAT_MODEL (floored at Pro)", provider: "OpenAI · chat/completions (streaming, function calling)",
    params: { temperature: 0.3, maxTokens: 2400, format: "Text + tool calls (list_documents, search_material, list_agents, propose_*, log_unsupported_request)", streaming: true },
    input: "System prompt (scope, the documents in scope, the rules and Luna's guide) + the last 18 messages; with material, up to ~7k tokens of retrieved passages are added by the search tool.",
    output: "A streamed Markdown answer with [P1] citations, and optionally action cards. The cost is estimated before sending; above 30,000 tokens the user must confirm.",
    fallbacks: "A clear error message in the chat; nothing is run or saved without the user's approval.",
    tokens: { basis: "measured", typical: { in: 6000, out: 500 }, scale: null },
    seconds: { typical: 6, note: "measured 3–9 s" },
    prompts: [
      { label: "System prompt", file: SRC.chat, re: /return `(You are Luna's assistant[\s\S]*?)\$\{LUNA_GUIDE\}`;/ }
    ]
  },
  {
    id: "A6", stage: "agents", name: "Legacy quiz endpoint", status: "legacy",
    purpose: "The original quiz generator route. The product now uses A1 through the shared agent flow; this endpoint is kept but not called by the UI.",
    why: "Historical.",
    position: "Not part of the current flow.",
    trigger: "POST /api/ai-tools/quiz (no UI calls it)",
    file: SRC.quiz, anchor: /async function callOpenAiQuiz/,
    model: "gpt-4o", modelEnv: "LUNA_QUIZ_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.2, maxTokens: "700 × questions (2,400–12,000)", format: "JSON schema (strict)", streaming: false },
    input: "Quiz config + context chunks.", output: "Quiz JSON with source references.", fallbacks: "Local provider.",
    tokens: { basis: "estimated", typical: { in: 4000, out: 1500 }, scale: null },
    seconds: { typical: 10, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.quiz, re: /role: "system",\n          content: "([^"]*)"/ }
    ]
  },

  /* ============================================================ 3b · TEMPLATE STUDIO */
  {
    id: "T1", stage: "design", name: "Brief for a whole template", status: "on-demand",
    purpose: "Rewrites 'a vocabulary worksheet for kids' as an exact brief and splits the document into sections, reusing the house components where they fit.",
    why: "Consistent, tested components beat drawing everything from scratch.",
    position: "First step when a user asks Template Studio to generate a template from a description.",
    trigger: "Template Studio → generate template (chat)",
    file: SRC.tchat, anchor: /const brief = await chat/,
    model: "gpt-4o", modelEnv: "LUNA_COMPONENT_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.2, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "System prompt with format and audience rules + the catalogue of components + the user's request (optionally an image).",
    output: "Brief: name, canvas, palette, views, and sections (each naming the component to reuse).",
    fallbacks: "Error shown.",
    tokens: { basis: "estimated", typical: { in: 2400, out: 1100 }, scale: null },
    seconds: { typical: 10, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.tchat, re: /system: `(You are the lead document designer[\s\S]*?)`,\n      messages: \[/ }
    ]
  },
  {
    id: "T2", stage: "design", name: "Design plan for one component", status: "on-demand",
    purpose: "Plans the exact layout of a new component: fields, grid maths, palette, checks.",
    why: "Splitting plan / build / review gives far more reliable geometry.",
    position: "Step 1 of 3 for each component the designer must draw (also once per section that is not a house component).",
    trigger: "Component chatbot · template generator",
    file: SRC.designer, anchor: /export async function designComponent/,
    model: "gpt-4o", modelEnv: "LUNA_COMPONENT_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.2, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "System prompt + design rules + the request (and the previous component or a reference image when editing).",
    output: "Specification: interpretation, fields, grid, content rules, item layout in mm, palette, checks.",
    fallbacks: "Error shown.",
    tokens: { basis: "estimated", typical: { in: 2000, out: 900 }, scale: null },
    seconds: { typical: 9, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.designer, re: /name: "component_plan"[^\n]*\n\s*system: `([\s\S]*?)`,\n    messages/ },
      { label: "Design rules (appended to every design prompt)", file: SRC.designer, re: /const DESIGN_RULES = `([\s\S]*?)`;/ }
    ]
  },
  {
    id: "T3", stage: "design", name: "Build the component", status: "on-demand",
    purpose: "Draws the component in the design DSL exactly as the plan says.",
    why: "Separates deciding from drawing.",
    position: "Step 2 of 3.",
    trigger: "After T2",
    file: SRC.designer, anchor: /name: "component", schema: DSL_SCHEMA/,
    model: "gpt-4o", modelEnv: "LUNA_COMPONENT_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.3, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "The plan + the original request.",
    output: "The component as DSL: fields, list, header elements, item elements with exact positions.",
    fallbacks: "Error shown.",
    tokens: { basis: "estimated", typical: { in: 3400, out: 1800 }, scale: null },
    seconds: { typical: 15, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.designer, re: /name: "component", schema: DSL_SCHEMA[^\n]*\n\s*system: `([\s\S]*?)`,\n    messages/ }
    ]
  },
  {
    id: "T4", stage: "design", name: "Review the geometry", status: "on-demand",
    purpose: "Fixes overlaps and out-of-bounds elements that the deterministic checks found.",
    why: "Quality gate; only runs when a problem is detected.",
    position: "Step 3 of 3 (conditional).",
    trigger: "After T3, only if geometryIssues() finds something",
    file: SRC.designer, anchor: /name: "component_review"/,
    model: "gpt-4o", modelEnv: "LUNA_COMPONENT_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.2, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "The plan, the DSL and the list of issues.",
    output: "Corrected DSL.",
    fallbacks: "The unreviewed DSL is used.",
    tokens: { basis: "estimated", typical: { in: 4200, out: 1800 }, scale: null },
    seconds: { typical: 15, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.designer, re: /name: "component_review"[^\n]*\n\s*system: `([\s\S]*?)`,\n      messages/ }
    ]
  },

  /* ============================================================ 4 · TRACK */
  {
    id: "F1", stage: "track", name: "Performance coach", status: "on-demand",
    purpose: "Reads the learner's mastery, mistake types and stuck questions and says what to do next, in three voices (student, parent, teacher).",
    why: "Measurements alone don't tell people what to do; this turns them into 2–5 concrete actions.",
    position: "On the Performance page, when the user asks the coach to read the results.",
    trigger: "Performance → Coach",
    file: SRC.coach, anchor: /export async function POST/,
    model: "gpt-4o", modelEnv: "LUNA_COACH_MODEL", provider: "OpenAI · chat/completions",
    params: { temperature: 0.3, maxTokens: "default", format: "JSON schema (strict)", streaming: false },
    input: "Per-topic mastery, accuracy, retention, trend; error-type shares; the questions that keep going wrong; the plan being tracked.",
    output: "Headline, diagnosis, 2–5 actions (kind, topic, effort) and three messages (student / parent / teacher).",
    fallbacks: "Error shown.",
    tokens: { basis: "estimated", typical: { in: 1100, out: 650 }, scale: null },
    seconds: { typical: 6, note: "estimate" },
    prompts: [
      { label: "System prompt", file: SRC.coach, re: /const SYSTEM = `([\s\S]*?)`;/ },
      { label: "User message (evidence)", file: SRC.coach, re: /(const evidence = \[[\s\S]*?\]\.join\("\\n"\);)/ }
    ]
  }
];

/* -------------------------------------------------------------------------------- not-AI work */

export const FREE_STEPS = [
  { name: "DOCX parsing", note: "Local OOXML parser: text, tables, equations, images. No model call.", cost: "$0 AI" },
  { name: "Markdown / HTML / text import", note: "Parsed locally.", cost: "$0 AI" },
  { name: "Semantic chunking & ranking", note: "Chunks follow headings and topic shifts (lexical cohesion), keep page numbers and the heading where they start, and never leave a three-line subsection on its own; keyword/heading scoring then picks the best chunks within a 48,000-character budget.", cost: "compute only" },
  { name: "Template rendering", note: "One layout engine renders HTML, PDF, DOCX and PPTX on the server.", cost: "compute only" },
  { name: "Grading & activities", note: "Answers are checked in the browser/server with rules, not a model.", cost: "$0 AI" },
  { name: "Mastery & error classification", note: "Rule-based engines (mastery, retention, patterns, priority).", cost: "$0 AI" },
  { name: "Plan 'update from performance'", note: "Rule-based replan detector (route /api/plans/replan).", cost: "$0 AI" },
  { name: "Token & cost estimate before a run", note: "Counted locally from the prompt (≈ 4 characters per token).", cost: "$0 AI" }
];

/* -------------------------------------------------------------------------------- measurements */

export const MEASURED = {
  date: "2026-10-01",
  note: "Real calls against the demo workspace. Prices applied are the list prices above.",
  pdfMarkdown: [
    { doc: "Statistics.pdf", pages: 4, kb: 296, in: 2275, out: 1389, seconds: 10.8 },
    { doc: "Accounting.pdf", pages: 9, kb: 384, in: 7399, out: 4480, seconds: 36.1 }
  ],
  conceptTree: [
    { doc: "Statistics.pdf", in: 2749, out: 870, seconds: 7.9, concepts: 13 },
    { doc: "Accounting.pdf", in: 4436, out: 1063, seconds: 9.8, concepts: 16 }
  ],
  quizRun: [
    { doc: "Statistics.pdf", chunks: 6, in: 2554, out: 847, seconds: 12.1, items: 10, model: "gpt-4o-mini (before Pro floor)" },
    { doc: "Accounting.pdf", chunks: 18, in: 6445, out: 878, seconds: 11.6, items: 10, model: "gpt-4o-mini (before Pro floor)" }
  ],
  planGenerate: { steps: 9, outChars: 3065, seconds: 4.7, model: "gpt-4o" },
  storage: [
    { doc: "Accounting.pdf", originalKb: 384, base64Chars: 524736, markdownChars: 17798, renderHtmlChars: 61608, chunks: 18 },
    { doc: "Statistics.pdf", originalKb: 296, base64Chars: 403692, markdownChars: 5522, renderHtmlChars: 41357, chunks: 6 }
  ],
  generatedResourceKb: { min: 4, typical: 10, max: 20, note: "quiz / summary / flashcards JSON (100-document workspace sample)" }
};

/* -------------------------------------------------------------------------------- infrastructure */

export const INFRA = {
  note: "Assumptions from public list prices — edit in the page's calculator.",
  vercel: { plan: "Pro", perSeatMonth: 20, seats: 2 },
  supabase: { plan: "Pro", month: 25, dbIncludedGb: 8, dbOverGb: 0.125, storageIncludedGb: 100, storageOverGb: 0.021, egressOverGb: 0.09 },
  other: { month: 10, label: "domain, monitoring, email" },
  vectorBytesPerChunk: 6144,
  note2: "The original file is stored as base64 inside Postgres (+33 %). Supabase Storage is ~6× cheaper per GB than database space."
};

/* ---------------------------------------------------------------------------- business model */

export const BUSINESS = {
  status: {
    built: [
      "Lunas ledger in the app: 1 luna = 1 AI token, 1,000,000 welcome lunas, charged after every agent run (stored in the browser)",
      "Token & cost estimate shown before each run",
      "Marketplace for 6 kinds of listing with stores, ratings and install (stored in the browser)",
      "Pricing types on listings: one-time, per use, pay-as-you-go, monthly, subscription"
    ],
    planned: [
      "Real accounts and server-side ledger (today: localStorage)",
      "Payments: subscription billing, buying lunas, payouts",
      "Marketplace purchases, platform fee and lunas credited to sellers",
      "Storage and token tiers per archetype (teacher / student / parent)",
      "Transfers between users, friends, referral rewards"
    ]
  },
  defaults: {
    lunaPriceUsd: 0.00001, // $10 per 1,000,000 lunas
    payAsYouGoMarkup: 4,
    tiers: [
      { id: "student", label: "Student", priceUsd: 9, lunas: 500000, storageGb: 2 },
      { id: "teacher", label: "Teacher", priceUsd: 19, lunas: 1500000, storageGb: 10 },
      { id: "parent", label: "Parent", priceUsd: 12, lunas: 700000, storageGb: 3 }
    ],
    usage: [
      { id: "student", label: "Student", users: 1000, uploadsPdf: 2, uploadsDocx: 2, pages: 10, plans: 1, revises: 1, agentRuns: 8, agentRunsMax: 0, resourceConcepts: 8, coach: 4, templateDesigns: 0, storageMb: 6 },
      { id: "teacher", label: "Teacher", users: 200, uploadsPdf: 6, uploadsDocx: 6, pages: 12, plans: 2, revises: 4, agentRuns: 32, agentRunsMax: 8, resourceConcepts: 30, coach: 10, templateDesigns: 6, storageMb: 40 },
      { id: "parent", label: "Parent", users: 300, uploadsPdf: 1, uploadsDocx: 1, pages: 8, plans: 1, revises: 1, agentRuns: 6, agentRunsMax: 0, resourceConcepts: 6, coach: 6, templateDesigns: 0, storageMb: 4 }
    ],
    marketplace: { salePriceUsd: 5, platformFeePct: 25, redemptionHaircutPct: 0 }
  }
};

/* ------------------------------------------------------------------------------------ the flow */

export const LANES = [
  { id: "client", label: "Browser (React)" },
  { id: "server", label: "Server (Next.js on Vercel)" },
  { id: "ai", label: "AI providers" },
  { id: "data", label: "Data (Supabase · browser storage)" }
];

/** col = horizontal slot (0–11), lane = row. `reqs` link to the request catalog. */
export const NODES = [
  { id: "up", col: 0, lane: 0, label: "Upload file", sub: "PDF · DOCX · PPTX · image · MD", phase: "upload" },
  { id: "proc", col: 1, lane: 1, label: "Document pipeline", sub: "detect type · DOCX parsed locally", phase: "upload" },
  { id: "vision", col: 1, lane: 2, label: "GPT-4o reads the file", sub: "PDF→Markdown · slides · images", reqs: ["U1", "U2", "U3"], phase: "upload" },
  { id: "store", col: 2, lane: 1, label: "Chunk · embed · save", sub: "700-word chunks", reqs: ["U6"], phase: "upload" },
  { id: "embed", col: 2, lane: 2, label: "Embeddings", sub: "text-embedding-3-small", reqs: ["U6"], phase: "upload" },
  { id: "db", col: 3, lane: 3, label: "documents · chunks · vectors", sub: "Supabase Postgres + pgvector", phase: "upload" },
  { id: "cmap", col: 3, lane: 2, label: "Concept tree", sub: "GPT-4o · ≤ 20 concepts", reqs: ["U7"], phase: "upload" },
  { id: "plan", col: 4, lane: 0, label: "Plan it for me", sub: "material + deadline", phase: "plan" },
  { id: "planapi", col: 5, lane: 1, label: "Plan builder", sub: "/api/plans/generate · revise", phase: "plan" },
  { id: "plangpt", col: 5, lane: 2, label: "GPT-4o schedules", sub: "dated steps, goals", reqs: ["P1", "P2"], phase: "plan" },
  { id: "plandb", col: 6, lane: 3, label: "Plan · goals · steps", sub: "saved as a document", phase: "plan" },
  { id: "run", col: 6, lane: 0, label: "Run an agent", sub: "choices + material", phase: "agents" },
  { id: "retr", col: 7, lane: 1, label: "Retrieve passages", sub: "≤ 48k characters", phase: "agents" },
  { id: "agent", col: 7, lane: 2, label: "Agent generates JSON", sub: "Luna 3 Pro (default) / Max", reqs: ["A1", "A2", "A3", "A7"], phase: "agents" },
  { id: "tpl", col: 8, lane: 1, label: "Template Studio engine", sub: "HTML · PDF · DOCX · PPTX", phase: "agents" },
  { id: "design", col: 8, lane: 2, label: "AI template design", sub: "optional", reqs: ["T1", "T2", "T3", "T4"], phase: "design" },
  { id: "res", col: 9, lane: 3, label: "Resources", sub: "quiz · flashcards · summary", phase: "agents" },
  { id: "doit", col: 9, lane: 0, label: "Do it on LUNA", sub: "answer · export", phase: "track" },
  { id: "perf", col: 10, lane: 1, label: "Mastery engine", sub: "rules, no AI", phase: "track" },
  { id: "coach", col: 11, lane: 2, label: "AI coach", sub: "GPT-4o", reqs: ["F1"], phase: "track" },
  { id: "attempts", col: 10, lane: 3, label: "Attempts · mastery", sub: "per concept", phase: "track" },
  { id: "market", col: 11, lane: 0, label: "Marketplace", sub: "sell agents, templates, resources, plans", phase: "track" },
  { id: "lunas", col: 11, lane: 3, label: "Lunas ledger", sub: "buy · spend · earn", phase: "track" }
];

export const EDGES = [
  ["up", "proc"], ["proc", "vision"], ["vision", "store"], ["proc", "store"], ["store", "embed"], ["store", "db"], ["db", "cmap"],
  ["db", "plan"], ["plan", "planapi"], ["planapi", "plangpt"], ["plangpt", "plandb"],
  ["plandb", "run"], ["db", "retr"], ["run", "retr"], ["retr", "agent"], ["agent", "tpl"], ["design", "tpl"], ["tpl", "res"],
  ["res", "doit"], ["doit", "perf"], ["perf", "attempts"], ["attempts", "coach"], ["attempts", "plandb"],
  ["res", "market"], ["market", "lunas"], ["agent", "lunas"]
];

/* -------------------------------------------------------------------------------- data stores */

export const STORES = [
  { name: "documents", where: "Supabase Postgres", holds: "Every uploaded or generated file: extracted Markdown, the canonical document model, the preview HTML, the ORIGINAL FILE as base64, tags, review status, plans and resources (as JSON)." },
  { name: "document_chunks", where: "Supabase Postgres + pgvector", holds: "Chunks of up to 700 words with keywords, heading path and a 1,536-number embedding each." },
  { name: "concepts · concept_prerequisites", where: "Supabase Postgres", holds: "The concept tree of each document (parent → child edges)." },
  { name: "attempts · student_concept_state", where: "Supabase Postgres", holds: "Every answered activity and the mastery per concept, with error types." },
  { name: "workspaces · subjects · folders · tags", where: "Supabase Postgres", holds: "The workspace structure. Every row carries owner_user_id (a demo user until real auth lands)." },
  { name: "Lunas ledger · marketplace listings · stores", where: "Browser localStorage", holds: "Balance, history, listings and stores — local to one browser until accounts and payments exist." }
];

export const COMPARISON_NOTES = [
  "Uploading is by far the most expensive AI step per action, because the model reads every page of the file.",
  "Everything the learner does afterwards (agent runs, plans, coaching) costs fractions of a cent to a few cents.",
  "Storage is cheap per document, but the original file is kept as base64 inside the database: moving originals to Supabase Storage would cut storage cost ~6× and shrink the database by a third."
];

/* ------------------------------------------------------------------------------ the four steps */

export const PROCESS = [
  { n: 1, id: "upload", title: "Upload", color: "#0071e3", line: "Bring your material in.", body: "PDF, Word, slides, photos or handwritten notes. Every file is read in full — text, headings, formulas, tables, figures — split into searchable passages and mapped into a tree of concepts.", out: "Searchable library + concept map", ai: "U1–U7" },
  { n: 2, id: "plan", title: "Study plan", color: "#2f9e5b", line: "Turn material and a deadline into a schedule.", body: "Pick what to study and when the exam is. LUNA schedules reading, practice, spaced repetition and a final review. Add material later and only the unfinished work is re-planned.", out: "Dated steps, goals, concept tags", ai: "P1–P3" },
  { n: 3, id: "agents", title: "Agents", color: "#8a4fd6", line: "Create practice that complements the plan.", body: "Pre-built agents (quizzes, flashcards, summaries) or your own, built in four steps. They read your material, answer your settings and produce documents in the formats you pick in Template Studio.", out: "Quizzes · flashcards · summaries · worksheets", ai: "A1–A5 · T1–T4" },
  { n: 4, id: "market", title: "Marketplace", color: "#e0730f", line: "Sell what you built, if you want to.", body: "Agents, templates, resources and plans can be listed. Buyers pay in lunas; sellers earn lunas, which they can spend on AI or (planned) cash out.", out: "Lunas earned from sales", ai: "none" }
];

export const ROLES = [
  { role: "Student", asks: "What do I need to improve? Am I on track for my exam? Which mistakes repeat, and why?" },
  { role: "Teacher", asks: "Who needs help on which topic? Generate a resource for exactly those students, straight from the results." },
  { role: "Parent", asks: "Is my child progressing, and is the study time efficient? How can I help?" }
];

export const PERFORMANCE_METRICS = [
  { name: "Score & completion", q: "How am I doing overall?", note: "Average score, activities done, time spent.", roles: "all", ai: false },
  { name: "Mistakes by topic", q: "Where do I lose points?", note: "Errors grouped by concept and topic.", roles: "student · teacher", ai: false },
  { name: "Mastery per concept", q: "What do I really know?", note: "Weighted by recency and difficulty; drives the plan tags.", roles: "all", ai: false },
  { name: "Skills: topic vs transversal", q: "Is it the content or a core skill (algebra, reading)?", note: "Recurring error patterns across subjects.", roles: "student · teacher", ai: false },
  { name: "Repeated mistakes", q: "What do I keep getting wrong?", note: "Same question or pattern missed 2+ times.", roles: "student · parent", ai: false },
  { name: "Retry gains", q: "Does redoing it help?", note: "Score change between attempts of the same activity.", roles: "student", ai: false },
  { name: "Resource efficiency", q: "Which resources work best for me?", note: "Score gain per minute, by resource type.", roles: "student · teacher", ai: false },
  { name: "Trend & streak", q: "Am I improving over time?", note: "Timeline, daily activity, streak.", roles: "all", ai: false },
  { name: "Exam readiness", q: "Am I on track?", note: "Estimated minutes to finish an exam, plan progress.", roles: "student · parent", ai: false },
  { name: "Difficulty profile", q: "Do I fail the hard ones or the easy ones?", note: "Accuracy by difficulty level.", roles: "student · teacher", ai: false },
  { name: "Plan re-plan trigger", q: "Does the plan still fit?", note: "Rule-based detector proposes an update from performance.", roles: "student", ai: false },
  { name: "Coach (AI)", q: "What should I do next?", note: "Reads all of the above and writes 2–5 concrete actions and a message for student, parent and teacher.", roles: "all", ai: true, req: "F1" }
];

export const RISKS = [
  { level: "high", title: "Uploads are not charged in lunas", body: "A 10-page PDF costs ≈ $0.06 in OpenAI fees, but only agent runs deduct lunas today. Upload cost is absorbed by the subscription." },
  { level: "high", title: "Quality floor raised to Pro: agent calls cost ~17× more", body: "Luna 3 Mini was too inaccurate, so every generation call now runs on GPT-4o. A 10-question quiz costs ≈ $0.02 instead of ≈ $0.001. With 1 luna = 1 token and the same number of lunas charged for every model, the gross margin on agent runs depends heavily on the luna price — see the lunas section." },
  { level: "med", title: "Ledger and marketplace live in the browser", body: "Balances, listings and stores are in localStorage: not shareable between devices, and editable by the user. Payments and server-side accounting are the next build." },
  { level: "med", title: "Original files kept as base64 in Postgres", body: "+33 % size and ~6× the price per GB of Supabase Storage. Moving originals to Storage shrinks the database and the bill." },
  { level: "med", title: "Output caps can cut long files", body: "Slides/images/backup PDF path are capped at 8,192 output tokens; Claude scan fallback at 4,096. Very long decks or scans may be truncated." },
  { level: "low", title: "Prices are hard-coded", body: "MODEL_PRICING in agentBuilder.js mirrors OpenAI's list prices. If OpenAI changes prices, the in-app estimate and this page drift until updated." },
  { level: "low", title: "No real auth / RLS yet", body: "Every row is keyed to a demo owner. Required before any paying customer." }
];
