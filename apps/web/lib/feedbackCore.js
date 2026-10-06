/**
 * Beta feedback tool — the pure rules (no I/O), shared by the widget, the routes and the admin board.
 *
 * TEMPORARY: the whole tool (apps/web/modules/feedback, app/api/feedback, app/feedback-admin, this file, the
 * mount in AppShell and the table feedback_items) is meant to be deleted once the beta ends; see
 * modules/feedback/README.md for the removal list.
 */

export const FEEDBACK_MIGRATION = "202610080001_feedback_items.sql";

export const KINDS = [
  { id: "idea", label: "Idea", hint: "Something Luna should do or do differently" },
  { id: "problem", label: "Something is wrong", hint: "A bug, a confusing step, something that did not work" },
  { id: "ui", label: "How it looks", hint: "Layout, text size, colours, what is hard to find" },
  { id: "prompt", label: "AI result", hint: "A generated result or an agent that missed the mark" }
];
export const STATUSES = [
  { id: "new", label: "New" },
  { id: "queued", label: "Sent to Claude" },
  { id: "done", label: "Done" },
  { id: "dismissed", label: "Dismissed" }
];

const LIMITS = { message: 4000, quote: 1500, selector: 320, snippet: 300, section: 120, page: 120, location: 200, name: 80, viewport: 24, context: 4000, screenshot: 1_200_000 };
const IMAGE_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const text = (value, max) => String(value || "").replaceAll("\u0000", "").trim().slice(0, max);

/**
 * Where in the code each page lives, so a piece of feedback can be handed to Claude with "start here".
 * `prompts` lists the in-app prompts that page runs, with their dashboard ids (docs/dashboard/manifest.mjs).
 */
export const AREAS = {
  landing: { label: "Landing page", files: ["apps/web/components/LandingPage.js", "apps/web/components/landing"], prompts: [] },
  login: { label: "Log in / sign up", files: ["apps/web/app/login", "apps/web/components/auth"], prompts: [] },
  dashboard: { label: "Home", files: ["apps/web/modules/dashboard/ui/DashboardPage.js"], prompts: [] },
  workspaces: { label: "Workspaces", files: ["apps/web/modules/workspace/ui/WorkspaceBrowser.js", "apps/web/modules/reader/ReaderView.js"], prompts: ["apps/web/app/api/resources/concepts/route.js (P3)", "apps/web/modules/ai-tools/pipeline/conceptExtractor.js (U7)", "apps/web/modules/chat/engine.js (A8, Ask Luna)"] },
  plans: { label: "Study plans", files: ["apps/web/modules/plans/PlansPage.js"], prompts: ["apps/web/app/api/plans/generate/route.js (P1)", "apps/web/app/api/plans/revise/route.js (P2)", "apps/web/app/api/plans/update/route.js (P4)"] },
  activities: { label: "Activities", files: ["apps/web/modules/activities/ActivitiesPage.js"], prompts: ["apps/web/modules/activities/gradeBatch.js (F2, marking written answers)"] },
  performance: { label: "Performance", files: ["apps/web/modules/performance/PerformancePage.js"], prompts: ["apps/web/app/api/performance/coach/route.js (F1)", "apps/web/modules/activities/gradeBatch.js (F2)"] },
  "ai-tools": { label: "AI agents", files: ["apps/web/modules/ai-tools/registry.js", "apps/web/modules/ai-tools/tools/agent-builder/RunAgentPage.js"], prompts: [] },
  "ai-tool": { label: "Agent run", files: ["apps/web/modules/ai-tools/tools/agent-builder/RunAgentPage.js", "apps/web/modules/ai-tools/pipeline/agentBuilder.js"], prompts: ["apps/web/modules/ai-tools/pipeline/agentBuilder.js (A1/A2 run, A3 output rules)", "apps/web/app/api/ai-tools/agent-builder/refine/route.js (A4)", "apps/web/app/api/ai-tools/agent-builder/improve/route.js (A5)", "apps/web/app/api/ai-tools/agent-builder/iterate/route.js (A7)"] },
  "custom-agent": { label: "Agent run", files: ["apps/web/modules/ai-tools/tools/agent-builder/RunAgentPage.js", "apps/web/modules/ai-tools/pipeline/agentBuilder.js"], prompts: ["apps/web/modules/ai-tools/pipeline/agentBuilder.js (A1/A2 run, A3 output rules)", "apps/web/app/api/ai-tools/agent-builder/improve/route.js (A5)", "apps/web/app/api/ai-tools/agent-builder/iterate/route.js (A7)"] },
  "agent-edit": { label: "Agent Studio", files: ["apps/web/modules/agent-studio"], prompts: ["apps/web/app/api/ai-tools/agent-builder/refine/route.js (A4)"] },
  templates: { label: "Templates", files: ["apps/web/modules/template-studio"], prompts: ["apps/web/app/api/templates/template-chat/route.js (T1)", "apps/web/modules/template-studio/server/designer.js (T2-T4)"] },
  marketplace: { label: "Marketplace", files: ["apps/web/modules/marketplace/MarketplacePage.js"], prompts: [] },
  connections: { label: "Connections", files: ["apps/web/modules/accounts/ConnectionsPage.js"], prompts: [] },
  students: { label: "My students", files: ["apps/web/modules/accounts/LinkedStudentsPage.js"], prompts: [] }
};

/** "plans?open=x" -> "plans", "ai-tool:quiz" -> "ai-tool", "custom-agent:abc" -> "custom-agent". */
export const areaKeyOf = (page) => String(page || "").split(/[?:]/)[0].trim().slice(0, 40);
export const areaLabelOf = (key) => AREAS[key]?.label || (key ? key : "Somewhere else");

/** Turns what the browser sent into the row to store, or { error }. Never trusts shapes or sizes. */
export function sanitizeFeedback(body = {}) {
  const kind = KINDS.some((entry) => entry.id === body.kind) ? body.kind : "idea";
  const message = text(body.message, LIMITS.message);
  const quote = text(body.quote, LIMITS.quote);
  const screenshot = typeof body.screenshot === "string" ? body.screenshot.trim() : "";
  if (screenshot && (screenshot.length > LIMITS.screenshot || !IMAGE_URL.test(screenshot))) return { error: "That screenshot could not be used. Try a smaller picture." };
  if (message.length < 3 && !screenshot && !quote) return { error: "Write a few words about what you noticed." };
  let target = null;
  if (body.target && typeof body.target === "object") {
    target = { selector: text(body.target.selector, LIMITS.selector), text: text(body.target.text, LIMITS.snippet), section: text(body.target.section, LIMITS.section), tag: text(body.target.tag, 30) };
    if (!target.selector && !target.text) target = null;
  }
  let context = null;
  if (body.context && typeof body.context === "object") {
    const raw = JSON.stringify(body.context);
    if (raw.length <= LIMITS.context) { try { context = JSON.parse(raw); } catch { context = null; } }
  }
  const page = text(body.page, LIMITS.page);
  return {
    row: {
      kind, message, quote, target, context,
      area: areaKeyOf(page),
      page,
      role: ["student", "teacher", "parent"].includes(body.role) ? body.role : "",
      author_name: text(body.author, LIMITS.name),
      location: text(body.location, LIMITS.location),
      viewport: text(body.viewport, LIMITS.viewport),
      screenshot: screenshot || null,
      has_screenshot: Boolean(screenshot)
    }
  };
}

/** A short title for a card: the first sentence of what the person wrote. */
export function titleOf(item) {
  const source = String(item.message || item.quote || (item.target && item.target.text) || "(screenshot only)").replace(/\s+/g, " ").trim();
  const first = source.split(/(?<=[.!?])\s/)[0] || source;
  return first.length > 90 ? `${first.slice(0, 87)}…` : first;
}
export const shortId = (id) => String(id || "").replace(/-/g, "").slice(0, 8);

/**
 * The hand-off. Turns the chosen feedback into one message to paste into Claude Code: what was said, where in the
 * app it was said, which files to start in, which prompts are involved, and how to work. Screenshots cannot travel in
 * text, so each card says which file to attach (the board's "Save screenshots" names them the same way).
 */
export function buildBrief(items, { origin = "", today = new Date() } = {}) {
  const date = today.toISOString().slice(0, 10);
  const lines = [
    `# LUNA beta feedback to implement — ${items.length} item${items.length === 1 ? "" : "s"} (${date})`,
    "",
    "Work through each item below. For every one: confirm it fits docs/LUNA_VISION.md (say so and skip it if it conflicts), find the code from \"Start in\", make the smallest change that satisfies it, and keep UI changes inside the design language in CLAUDE.md. Where an item is about an AI result or a prompt, edit the prompt (an inline string in the file named under \"Prompts involved\"), keep the JSON schema as it is, apply the metaprompt rules, then run `npm run dashboard:check`. Group related items into one commit per scope. When done, list which feedback ids are finished so I can mark them Done.",
    "Screenshots, where an item has one, are attached to this message as feedback-<id>.jpg (or .png / .webp).",
    ""
  ];
  items.forEach((item, index) => {
    const key = item.area || areaKeyOf(item.page);
    const area = AREAS[key];
    const kind = KINDS.find((entry) => entry.id === item.kind)?.label || item.kind;
    lines.push(`## ${index + 1}. [${kind}] ${areaLabelOf(key)} — ${titleOf(item)}`);
    lines.push(`- Feedback id: ${shortId(item.id)}`);
    lines.push(`- Where: page \`${item.page || "?"}\`${item.role ? ` · role ${item.role}` : ""}${item.viewport ? ` · screen ${item.viewport}` : ""}${item.signed_in ? " · signed-in tester" : " · demo visitor"}${item.location ? ` · ${origin}${item.location}` : ""}`);
    if (area?.files?.length) lines.push(`- Start in: ${area.files.map((file) => `\`${file}\``).join(", ")}`);
    if (item.kind === "prompt" && area?.prompts?.length) lines.push(`- Prompts involved: ${area.prompts.join("; ")}`);
    if (item.target) lines.push(`- Part of the screen they pointed at: \`${item.target.selector || item.target.tag}\`${item.target.section ? ` inside the section “${item.target.section}”` : ""}${item.target.text ? ` — text on it: “${item.target.text}”` : ""}`);
    if (item.quote) lines.push(`- Text they selected: “${item.quote}”`);
    const ctx = item.context;
    if (ctx && typeof ctx === "object") {
      const parts = [];
      if (ctx.agent) parts.push(`agent “${ctx.agent.name || ctx.agent.id}”${ctx.agent.id ? ` (id ${ctx.agent.id})` : ""}`);
      if (ctx.run) parts.push(`last run: ${ctx.run}`);
      if (ctx.step) parts.push(`step: ${ctx.step}`);
      if (ctx.inputs) parts.push(`inputs: ${JSON.stringify(ctx.inputs).slice(0, 400)}`);
      if (parts.length) lines.push(`- Context: ${parts.join(" · ")}`);
    }
    if (item.message) lines.push("- What they wrote:", ...item.message.split("\n").map((line) => `  > ${line}`));
    if (item.has_screenshot) lines.push(`- Screenshot: attached as feedback-${shortId(item.id)}`);
    if (item.admin_note) lines.push(`- My note: ${item.admin_note}`);
    lines.push("");
  });
  return lines.join("\n");
}

/** Grouping for the board: counts per area, most feedback first. */
export function countByArea(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.area || "", (counts.get(item.area || "") || 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, label: areaLabelOf(key), count })).sort((a, b) => b.count - a.count);
}
