/**
 * The internal design agent that turns loose words into a drawn component.
 *
 * Shared by the component chatbot and the whole-template generator: a planner rewrites the request
 * into an exact brief (layout maths, fields, palette, checks), a builder produces the DSL, the
 * geometry is normalised deterministically, and a reviewer fixes whatever the checks still find.
 */

const DSL_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    fields: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, type: { type: "string", enum: ["text", "rich_text", "number", "boolean", "image", "formula"] }, list: { type: "boolean" }, description: { type: "string" } }, required: ["name", "type", "list", "description"] } },
    list: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, properties: { name: { type: "string" }, description: { type: "string" }, columns: { type: "integer" }, sampleCount: { type: "integer", description: "How many elements a full instance has (16 for a 4×4 grid, 0 = as many as needed). Previews show this many." }, derive: { type: "string", enum: ["", "tarsia"], description: "tarsia = the tiles' edge words (Top/Right/Bottom/Left) are computed from a Pairs list the agent produces; use it for any edge-matching square puzzle." }, itemFields: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, type: { type: "string", enum: ["text", "rich_text", "number", "boolean", "image", "formula"] }, list: { type: "boolean" }, description: { type: "string" } }, required: ["name", "type", "list", "description"] } } }, required: ["name", "description", "columns", "sampleCount", "derive", "itemFields"] }] },
    header: { type: "array", items: { $ref: "#/$defs/el" } },
    elements: { type: "array", items: { $ref: "#/$defs/el" } },
    height: { type: "number" },
    headerHeight: { type: "number" },
    reply: { type: "string", description: "One friendly sentence for the user describing what was built (no jargon)." }
  },
  required: ["name", "description", "fields", "list", "header", "elements", "height", "headerHeight", "reply"],
  $defs: {
    el: { type: "object", additionalProperties: false, properties: {
      kind: { type: "string", enum: ["text", "field", "box", "circle", "line"] },
      text: { type: "string" }, field: { type: "string" },
      x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" },
      size: { type: "number" }, bold: { type: "boolean" }, color: { type: "string" }, align: { type: "string", enum: ["left", "center", "right"] },
      fill: { type: "string" }, stroke: { type: "string" }, radius: { type: "number" },
      rotate: { type: "number", description: "0, 90 (text reads bottom→top, for a LEFT edge) or -90 (top→bottom, for a RIGHT edge). The frame is the unrotated box centred on the edge, so x may be negative." }
    }, required: ["kind", "text", "field", "x", "y", "w", "h", "size", "bold", "color", "align", "fill", "stroke", "radius", "rotate"] }
  }
};

const MODEL = () => process.env.LUNA_COMPONENT_MODEL || "gpt-4o";

async function chat(apiKey, { system, messages, schema, name, temperature = 0.3 }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL(), temperature, response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }, messages: [{ role: "system", content: system }, ...messages] })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "Model request failed");
  return JSON.parse(payload.choices?.[0]?.message?.content || "{}");
}

const PLAN_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    name: { type: "string" },
    interpretation: { type: "string", description: "What the user wants, in one precise paragraph, with assumptions made explicit." },
    onceFields: { type: "array", items: { type: "string" } },
    list: { type: "string", description: "Name of the repeating list, or empty if nothing repeats." },
    itemFields: { type: "array", items: { type: "string" } },
    columns: { type: "integer" },
    sampleCount: { type: "integer", description: "Total elements of one full instance (rows × columns for grids), 0 if open-ended." },
    derive: { type: "string", enum: ["", "tarsia"], description: "tarsia for edge-matching square puzzles: the agent produces Pairs (Word A / Word B) and the tiles are computed so matching edges are guaranteed." },
    cell: { type: "object", additionalProperties: false, properties: { w: { type: "number" }, h: { type: "number" } }, required: ["w", "h"] },
    contentRules: { type: "string", description: "Rules the AI agent must follow when filling the fields (e.g. tiles in solved order, outer edges empty, matching pairs on touching edges) — goes into the list description." },
    itemLayout: { type: "string", description: "Exact placement of every element of ONE item in mm (x, y, w, h), sizes in pt, colours." },
    headerLayout: { type: "string", description: "Exact placement of the header elements (title, instruction) in mm, or empty." },
    palette: { type: "array", items: { type: "string" } },
    checks: { type: "array", items: { type: "string" }, description: "Rules the final design must satisfy." }
  },
  required: ["name", "interpretation", "onceFields", "list", "itemFields", "columns", "sampleCount", "derive", "cell", "contentRules", "itemLayout", "headerLayout", "palette", "checks"]
};

const REVIEW_SCHEMA = { ...DSL_SCHEMA, properties: { ...DSL_SCHEMA.properties, issuesFixed: { type: "array", items: { type: "string" } } }, required: [...DSL_SCHEMA.required, "issuesFixed"] };

const DESIGN_RULES = `Design language: soft pastel fills (#ffe4ec #e3f1ff #e6f7ea #fff5d6 #efe6ff), accent #5b5bd6, dark text #1f2a6b, radius 2–4 mm, titles 16–22 pt bold centred, body 9–13 pt, generous padding (≥3 mm inside boxes).
Geometry: the block is 186 mm wide; the item is ONE cell of the grid: width = 186/columns − 3 (columns 1 → 186). All item elements must sit inside 0..cellW × 0..cellH. Text elements must be wide enough for their text: at least 0.55 mm per character at 10 pt (e.g. a 12-letter word ≈ 7 mm tall, ≥ 26 mm wide). A box behind text must fully contain it with padding. Never overlap two texts. Item height is the height of ONE item (10–60 mm), never the whole grid.
Expand simple requests like an expert: infer the full count (a 4×4 grid = 16 elements → sampleCount 16), what is fixed and what the agent fills, how answers are checked, and any content rule the agent must follow (write it in contentRules / the list description).
Known patterns: "square puzzle / tarsia / N×N grid puzzle with word pairs" = N×N cut-apart square tiles (columns N, cell ≈ 43×43 mm, sampleCount N×N) with item fields Top, Right, Bottom, Left = the word on each EDGE, and derive = "tarsia": the agent produces numbered PAIRS (Word A / Word B — pair 1a/1b, 2a/2b…) and the platform computes which tile edge carries which word, so matching is guaranteed and the grid's OUTER edges stay empty. Never ask the agent to fill tile edges directly.
Borders: the tile's box IS the cut line — never draw extra lines along the box edges (no double borders); cut guides are only used between halves inside a tile. Side words are rotated: Left uses rotate 90, Right uses rotate -90, each an unrotated box w 35 h 6 centred on its edge (Left: x −13.5, y 18.5; Right: x 21.5, y 18.5 for a 43 mm tile); Top/Bottom centred horizontally at y 1.5 / y 35.5. Add thin cut guides. "match the pairs" = two columns (Left, Right) connected by lines; "pair puzzle tiles" = split tiles (Left | Right); "bingo" = grid of cells with one Word; "flashcards" = Front / Back.
Fields: content that changes per document is a field or a list, never fixed text. Every item field must have a field element. For answerable designs use the names Question/Options/Answer, Statement/Answer, Sentence/Answer, Problem/Answer, Left/Right, Front/Back so Luna can check answers; the Answer element is small (6.5 pt, accent colour) so it can be hidden.`;

/** Deterministic geometry clean-up: keep every element inside its cell, give text room, add a background box to grid items. */
function normalise(dsl) {
  const NUMERIC = new Set(["x", "y", "w", "h", "size", "radius", "rotate"]);
  const clean = (list) => (list || []).map((el) => Object.fromEntries(Object.entries(el).filter(([k, v]) => (NUMERIC.has(k) ? true : v !== "" && v !== false && v !== null))));
  dsl.header = clean(dsl.header);
  dsl.elements = clean(dsl.elements);
  dsl.fields = (dsl.fields || []).map((f) => ({ ...f, description: f.description || undefined }));
  dsl.list = dsl.list && dsl.list.name ? { ...dsl.list, itemFields: (dsl.list.itemFields || []).map((f) => ({ ...f, description: f.description || undefined })) } : null;
  if (dsl.list) dsl.fields = dsl.fields.filter((f) => f.name.toLowerCase() !== dsl.list.name.toLowerCase());
  const columns = dsl.list ? Math.max(1, Number(dsl.list.columns) || 1) : 1;
  const cellW = columns > 1 ? Math.floor(186 / columns) - 3 : 186;
  let cellH = Number(dsl.height) || 0;
  const contentBottom = Math.max(...dsl.elements.filter((e) => e.kind !== "box" && e.kind !== "line" && !Number(e.rotate)).map((e) => (Number(e.y) || 0) + (Number(e.h) || 6)), 12) + 2;
  if (!cellH || cellH > (columns > 1 ? 70 : 120)) cellH = Math.min(columns > 1 ? 60 : 120, contentBottom + 1);
  else if (contentBottom > cellH && contentBottom <= (columns > 1 ? 70 : 120)) cellH = contentBottom;
  const minTextW = (el) => Math.min(cellW - 4, Math.max(20, ((el.text || el.field || "").length || 8) * (el.size || 10) * 0.06));
  dsl.elements = dsl.elements.map((el) => {
    const rotated = Number(el.rotate) ? true : false;
    const e = { ...el, x: rotated ? Number(el.x) || 0 : Math.max(0, Number(el.x) || 0), y: Math.max(0, Number(el.y) || 0), w: Math.max(2, Number(el.w) || 10), h: Math.max(0.3, Number(el.h) || 6) };
    if (rotated) return e; // rotated boxes are centred on an edge; their unrotated frame may cross the cell
    if (e.x + e.w > cellW) e.w = Math.max(2, cellW - e.x);
    if (e.x >= cellW) { e.x = 2; e.w = cellW - 4; }
    if (e.y + e.h > cellH) e.h = Math.max(0.3, cellH - e.y);
    if (e.y >= cellH) { e.y = 2; }
    if ((e.kind === "text" || e.kind === "field") && e.w < minTextW(e)) { e.w = minTextW(e); if (e.x + e.w > cellW) e.x = Math.max(0, cellW - e.w); }
    if ((e.kind === "text" || e.kind === "field") && e.h < (e.size || 10) * 0.5) e.h = (e.size || 10) * 0.5 + 1;
    return e;
  });
  if (dsl.list && dsl.list.derive === "tarsia") {
    // Edge-matching puzzle: the list is the TILES (Top/Right/Bottom/Left); pairs are added by the DSL converter.
    // Edge fields are assigned by geometry so the design cannot mislabel them.
    dsl.list.name = /pair/i.test(dsl.list.name) || !dsl.list.name ? "Tiles" : dsl.list.name;
    dsl.list.itemFields = ["Top", "Right", "Bottom", "Left"].map((name) => ({ name, type: "text", list: false, description: `Word on the ${name.toLowerCase()} edge` }));
    const cellH = Number(dsl.height) || 43;
    dsl.elements = dsl.elements.filter((e) => e.kind !== "field" || true).map((e) => {
      if (e.kind !== "field" && e.kind !== "text") return e;
      const rot = Number(e.rotate) || 0;
      const edge = rot > 0 ? "Left" : rot < 0 ? "Right" : (Number(e.y) || 0) < cellH / 2 ? "Top" : "Bottom";
      return { ...e, kind: "field", field: edge, text: edge };
    });
    const seen = new Set();
    dsl.elements = dsl.elements.filter((e) => { if (e.kind !== "field") return true; if (seen.has(e.field)) return false; seen.add(e.field); return true; });
    dsl.list.sampleCount = dsl.list.sampleCount || 16;
    dsl.list.columns = Math.max(2, Math.round(Math.sqrt(dsl.list.sampleCount)));
  }
  if (dsl.list) {
    // Bind every field element to a real field name (exact, then fuzzy); static labels that just repeat a field name become that field.
    const names = [...(dsl.list.itemFields || []), ...(dsl.fields || [])].map((f) => f.name);
    const resolve = (raw) => {
      const key = String(raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key) return "";
      return names.find((n) => n.toLowerCase().replace(/[^a-z0-9]/g, "") === key) || names.find((n) => key.includes(n.toLowerCase().replace(/[^a-z0-9]/g, "")) || n.toLowerCase().replace(/[^a-z0-9]/g, "").includes(key)) || "";
    };
    dsl.elements = dsl.elements.map((e) => {
      if (e.kind === "field") { const name = resolve(e.field); return name ? { ...e, field: name } : { ...e, kind: "text", text: e.text || e.field || "" }; }
      if (e.kind === "text") { const name = resolve(e.text); return name && String(e.text || "").trim().length <= name.length + 2 ? { ...e, kind: "field", field: name } : e; }
      return e;
    });
    const shown = new Set(dsl.elements.filter((e) => e.kind === "field").map((e) => String(e.field || "").toLowerCase()));
    const missing = (dsl.list.itemFields || []).filter((f) => !shown.has(String(f.name).toLowerCase()));
    missing.forEach((f, index) => dsl.elements.push({ kind: "field", field: f.name, text: f.name, x: 3, y: 4 + index * 8, w: cellW - 6, h: 7, size: 11, bold: index === 0, align: columns > 1 ? "center" : "left" }));
    if (columns > 1 && !dsl.elements.some((e) => e.kind === "box" && e.w >= cellW * 0.8)) dsl.elements.unshift({ kind: "box", x: 0, y: 0, w: cellW, h: cellH, fill: "#e3f1ff", stroke: "#bcd9f5", radius: 3 });
  }
  // De-overlap texts deterministically: a text that collides with an earlier one moves below it.
  const texts = dsl.elements.filter((e) => (e.kind === "text" || e.kind === "field") && !Number(e.rotate));
  for (let i = 1; i < texts.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const a = texts[j], b = texts[i];
      const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      if (overlaps) { b.y = a.y + a.h + 1; }
    }
  }
  const maxBottom = Math.max(...texts.map((e) => e.y + e.h + 2), 12);
  cellH = Math.min(columns > 1 ? 70 : 140, Math.max(maxBottom, Math.min(cellH, maxBottom + 8)));
  dsl.elements = dsl.elements.map((e) => (e.kind === "line" ? { ...e, h: Math.min(e.h, e.w > e.h ? 0.3 : e.h), w: e.w > e.h ? e.w : Math.min(e.w, 0.3) } : e));
  // A line hugging the item's border duplicates the box outline — drop it.
  dsl.elements = dsl.elements.filter((e) => !(e.kind === "line" && ((e.w >= e.h && (e.y <= 1.2 || e.y >= cellH - 1.2)) || (e.h > e.w && (e.x <= 1.2 || e.x >= cellW - 1.2)))));
  dsl.elements = dsl.elements.map((e) => (e.kind === "box" && e.w >= cellW * 0.8 && e.h >= cellH * 0.6 ? { ...e, h: cellH } : e));
  dsl.height = cellH;
  dsl.header = dsl.header.map((el) => ({ ...el, x: Math.max(0, Number(el.x) || 0), y: Math.max(0, Number(el.y) || 0), w: Math.min(186, Math.max(2, Number(el.w) || 100)), h: Math.max(0.3, Number(el.h) || 8) }));
  dsl.headerHeight = dsl.header.length ? Math.max(Number(dsl.headerHeight) || 0, ...dsl.header.map((e) => e.y + e.h)) + 2 : 0;
  return dsl;
}

function geometryIssues(dsl) {
  const issues = [];
  const columns = dsl.list ? Math.max(1, Number(dsl.list.columns) || 1) : 1;
  const cellW = columns > 1 ? Math.floor(186 / columns) - 3 : 186;
  const texts = dsl.elements.filter((e) => (e.kind === "text" || e.kind === "field") && !Number(e.rotate));
  for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) {
    const a = texts[i], b = texts[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) issues.push(`Texts "${a.text || a.field}" and "${b.text || b.field}" overlap.`);
  }
  for (const e of texts) if ((e.field || e.text || "").length * (e.size || 10) * 0.06 > e.w + 0.5) issues.push(`"${e.field || e.text}" is too narrow for its text (w ${e.w} mm).`);
  if (dsl.list && !dsl.elements.some((e) => e.kind === "field")) issues.push("No field element in the item.");
  if (columns > 1 && cellW < 30) issues.push("Cells narrower than 30 mm — reduce columns.");
  return issues;
}


/** One component, designed end to end. `previous` refines an earlier design. */
export async function designComponent({ apiKey, prompt, previous = null, image = "", context = "" }) {
  const plan = await chat(apiKey, {
    name: "component_plan", schema: PLAN_SCHEMA, temperature: 0.2,
    system: `You are a senior worksheet designer for an education platform. Turn the user's request into an exact component specification that a builder can draw without guessing. Resolve ambiguity with sensible assumptions and state them. Decide what repeats (the list and its item fields) and what appears once. Compute the grid: columns, cell width = 186/columns − 3 mm, cell height that comfortably fits the content, coordinates for every element. ${DESIGN_RULES}`,
    messages: [
      ...(context ? [{ role: "system", content: context }] : []),
      ...(previous ? [{ role: "assistant", content: `Current component: ${JSON.stringify(previous)}` }] : []),
      image
        ? { role: "user", content: [{ type: "text", text: `${prompt}\n\nUse the attached image as the visual reference: reproduce its structure, shapes, proportions and colour feel (not its exact words).` }, { type: "image_url", image_url: { url: image, detail: "high" } }] }
        : { role: "user", content: prompt }
    ]
  });

  const built = await chat(apiKey, {
    name: "component", schema: DSL_SCHEMA, temperature: 0.3,
    system: `You build the component exactly as specified in the plan, in the DSL. "elements" describe ONE item; "header" the once-only part above. Unused DSL keys must be "" / 0 / false (never omitted). ${DESIGN_RULES}`,
    messages: [{ role: "user", content: `PLAN:\n${JSON.stringify(plan)}\n\nUSER REQUEST:\n${prompt}` }]
  });
  if (built.list && !built.list.sampleCount && plan.sampleCount) built.list.sampleCount = plan.sampleCount;
  if (built.list && plan.derive && !built.list.derive) built.list.derive = plan.derive;
  if (built.list && plan.contentRules && !String(built.list.description || "").includes(plan.contentRules.slice(0, 40))) built.list.description = `${built.list.description || ""} ${plan.contentRules}`.trim();
  let dsl = normalise({ ...built, name: built.name || plan.name });

  const issues = geometryIssues(dsl);
  if (issues.length) {
    const fixed = await chat(apiKey, {
      name: "component_review", schema: REVIEW_SCHEMA, temperature: 0.2,
      system: `You are the design reviewer. Return the corrected DSL (same shape, all keys present) fixing every listed issue while keeping the plan's intent. ${DESIGN_RULES}`,
      messages: [{ role: "user", content: `PLAN:\n${JSON.stringify(plan)}\n\nDSL:\n${JSON.stringify(dsl)}\n\nISSUES:\n- ${issues.join("\n- ")}` }]
    });
    dsl = normalise({ ...fixed, name: fixed.name || dsl.name });
  }
  return { dsl, plan, reply: built.reply || "Here is your component." };
}

export { chat, DESIGN_RULES, normalise, geometryIssues };
