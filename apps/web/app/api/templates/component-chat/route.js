import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DSL_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    fields: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, type: { type: "string", enum: ["text", "rich_text", "number", "boolean", "image", "formula"] }, list: { type: "boolean" }, description: { type: "string" } }, required: ["name", "type", "list", "description"] } },
    list: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, properties: { name: { type: "string" }, description: { type: "string" }, columns: { type: "integer" }, itemFields: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, type: { type: "string", enum: ["text", "rich_text", "number", "boolean", "image", "formula"] }, list: { type: "boolean" }, description: { type: "string" } }, required: ["name", "type", "list", "description"] } } }, required: ["name", "description", "columns", "itemFields"] }] },
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
      fill: { type: "string" }, stroke: { type: "string" }, radius: { type: "number" }
    }, required: ["kind", "text", "field", "x", "y", "w", "h", "size", "bold", "color", "align", "fill", "stroke", "radius"] }
  }
};

/**
 * Component chatbot: describe a component in words → a component (fields + design) the user can
 * insert like any premium block. Premium feature later; free while the platform is in preview.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const prompt = String(body?.prompt || "").trim();
    const previous = body?.previous || null;
    if (!prompt) return NextResponse.json({ error: "Describe the component first." }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No model configured." }, { status: 500 });
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.LUNA_COMPONENT_MODEL || "gpt-4o",
        temperature: 0.4,
        response_format: { type: "json_schema", json_schema: { name: "component", strict: true, schema: DSL_SCHEMA } },
        messages: [
          { role: "system", content: `You design printable/interactive educational components for kids and students. Output a component in the DSL. Rules:
- Coordinates in millimetres inside a 186 mm wide block; y grows downward. Keep everything within x 0–186. Item height = "height" (typically 10–40 mm). Header (title, instruction) is optional and sits above at y < headerHeight.
- Content that changes from one document to the next (words, questions, answers, titles) is NEVER fixed text: make it a field or a list. Only labels like "Name:", "True", "False" are fixed text.
- "fields" = information that appears once (title, instruction, date). "list" = the repeating part (questions, pairs, words, cells) with its item fields; set columns 2–4 for card/tile grids (a 4×4 bingo = list "Words" with columns 4, one cell design), else 1.
- "elements" describe ONE item only (one cell, one card, one question) — the platform repeats it. Include a {kind:"field"} element for EVERY item field so its content is visible, plus the item's own box/decoration. "height" is the height of ONE item (e.g. a bingo cell 40 mm, a question card 30 mm), never the whole grid. Item element x/w must fit one column: with columns 4 the item is at most 44 mm wide.
- A field element shows a field by name (once field or item field). If an item field is itself a list (list:true), its element repeats inside the item (e.g. options).
- Use boxes/circles/lines for the visual design (soft pastel fills like #ffe4ec #e3f1ff #e6f7ea #fff5d6 #efe6ff, accent #5b5bd6, radius 2–4), bold titles, readable sizes (9–13 pt, titles 16–22).
- For answerable components name fields so the platform can check them: "Question" + "Options" (list) + "Answer"; "Statement" + "Answer" (true/false); "Sentence" + "Answer" (fill in the blank); "Problem" + "Answer" (math); "Left" + "Right" (matching pairs); "Front" + "Back" (flashcards). Put the Answer element as small text (size 6.5, accent colour) so it can be hidden in the student view.
- Unused DSL properties must be empty strings / 0 / false (never omit keys). Reply in one friendly sentence.` },
          ...(previous ? [{ role: "assistant", content: JSON.stringify(previous) }] : []),
          { role: "user", content: prompt }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Component request failed");
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    const NUMERIC = new Set(["x", "y", "w", "h", "size", "radius"]);
    const clean = (list) => (list || []).map((el) => Object.fromEntries(Object.entries(el).filter(([k, v]) => NUMERIC.has(k) ? true : v !== "" && v !== false && v !== null)));
    const dsl = { ...parsed, header: clean(parsed.header), elements: clean(parsed.elements), fields: (parsed.fields || []).map((f) => ({ ...f, description: f.description || undefined })), list: parsed.list ? { ...parsed.list, itemFields: (parsed.list.itemFields || []).map((f) => ({ ...f, description: f.description || undefined })) } : null };
    // Guard rails: an item must show its fields; a grid item cannot be the whole page.
    if (dsl.list) {
      const columns = Math.max(1, Number(dsl.list.columns) || 1);
      const cellW = Math.floor(186 / columns) - 3;
      const shown = new Set(dsl.elements.filter((e) => e.kind === "field").map((e) => String(e.field || "").toLowerCase()));
      const missing = (dsl.list.itemFields || []).filter((f) => !shown.has(String(f.name).toLowerCase()));
      if (columns > 1 && dsl.elements.some((e) => e.x + e.w > cellW + 2)) {
        // Whole-grid drawing: keep only one cell's worth of decoration.
        const first = dsl.elements.filter((e) => e.kind !== "field").slice(0, 1).map((e) => ({ ...e, x: 0, y: 0, w: cellW, h: Math.min(e.h || 30, 60) }));
        dsl.elements = [...first, ...dsl.elements.filter((e) => e.kind === "field" && e.x + e.w <= cellW + 2)];
        dsl.height = Math.min(Number(dsl.height) || 30, 60);
      }
      missing.forEach((f, index) => dsl.elements.push({ kind: "field", field: f.name, text: f.name, x: 3, y: 4 + index * 7, w: Math.max(20, (columns > 1 ? cellW : 186) - 6), h: 6, size: columns > 1 ? 11 : 10, bold: index === 0, align: columns > 1 ? "center" : "left" }));
      if (!Number(dsl.height) || dsl.height > 120) dsl.height = Math.max(...dsl.elements.map((e) => (e.y || 0) + (e.h || 6)), 10) + 3;
    }
    return NextResponse.json({ dsl, reply: parsed.reply || "Here is your component." });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
