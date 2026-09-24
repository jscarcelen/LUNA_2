import { NextResponse } from "next/server";
import { chat, designComponent, DESIGN_RULES } from "../../../../modules/template-studio/server/designer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Brief for a whole document. The first pass is the hidden prompt-improver: it turns the user's
 * description into an exact brief — page size, the sections in order, what repeats, which views
 * exist — so the sections that follow are designed against one coherent plan instead of each
 * model call guessing again.
 */
const BRIEF_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    name: { type: "string", description: "Short template name, e.g. \"Year 7 vocabulary worksheet\"." },
    improvedPrompt: { type: "string", description: "The user's request rewritten as a precise, complete description of the document: purpose, audience, what the AI fills, what is fixed, tone. Resolve every ambiguity explicitly." },
    canvas: { type: "string", enum: ["a4-portrait", "a4-landscape", "letter-portrait", "card-a6", "slides-16-9", "slides-4-3"] },
    accent: { type: "string", description: "Hex accent colour for the whole document." },
    audience: { type: "string", enum: ["children", "teenagers", "adults"], description: "Who the document is for — children means playful cards, big type and space to write." },
    styleNotes: { type: "string", description: "The visual direction in one or two sentences: the card colours per section, the shape of the badges, the feel (playful, formal, minimal). Every section request must follow it." },
    reuseTemplateName: { type: "string", description: "Exact name of one of the user's existing templates to start from, or empty." },
    sections: {
      type: "array",
      description: "The document in order, 2–5 sections. One of them is the repeating content.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string" },
          role: { type: "string", enum: ["header", "content", "section", "footer"] },
          request: { type: "string", description: "A complete component request for the designer: what it contains, which fields the AI fills, and exactly how it looks — the card's fill and stroke colours, its radius, the badge, the type sizes, the padding and the space left for writing. Self-contained: the designer does not see the rest of the document." },
          repeats: { type: "boolean", description: "True when this section repeats once per generated item." },
          placement: { type: "string", enum: ["flow", "fixed", "new_page"] },
          pageScope: { type: "string", enum: ["page", "first", "every", "last"] },
          reuseBlock: { type: "string", description: "Name of an existing block/component of the user's library to reuse instead of designing a new one, or empty." }
        },
        required: ["title", "role", "request", "repeats", "placement", "pageScope", "reuseBlock"]
      }
    },
    views: {
      type: "array",
      description: "Versions of the same document, e.g. Student / Answer key. Always at least one.",
      items: {
        type: "object", additionalProperties: false,
        properties: { name: { type: "string" }, description: { type: "string" }, hideFields: { type: "array", items: { type: "string" }, description: "Field names hidden in this view (e.g. Answer, Explanation)." } },
        required: ["name", "description", "hideFields"]
      }
    },
    images: { type: "array", items: { type: "string" }, description: "Picture placeholders the document needs, described in a few words ('space for the student's drawing'), or empty." },
    notes: { type: "string", description: "One friendly sentence for the user about what was built." }
  },
  required: ["name", "improvedPrompt", "canvas", "accent", "audience", "styleNotes", "reuseTemplateName", "sections", "views", "images", "notes"]
};

/**
 * Whole-template generator: the user describes the document they want (optionally with a reference
 * image and a nod to templates they already have) and Luna designs it end to end — brief, sections,
 * views — and hands back a template they can edit like any other.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const prompt = String(body?.prompt || "").trim();
    const image = typeof body?.image === "string" && body.image.startsWith("data:image/") ? body.image : "";
    const templates = Array.isArray(body?.templates) ? body.templates.slice(0, 40) : [];
    const blocks = Array.isArray(body?.blocks) ? body.blocks.slice(0, 60) : [];
    if (!prompt) return NextResponse.json({ error: "Describe the template first." }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No model configured." }, { status: 500 });

    const library = [
      templates.length ? `Templates the user already has: ${templates.map((row) => `"${row.name}"`).join(", ")}.` : "",
      blocks.length ? `Blocks available to reuse: ${blocks.join(", ")}.` : ""
    ].filter(Boolean).join(" ");

    // 1. Improve the request into a complete brief for the document.
    const brief = await chat(apiKey, {
      name: "template_brief", schema: BRIEF_SCHEMA, temperature: 0.2,
      system: `You are the lead document designer of an education platform. A teacher describes the printable they want; you rewrite it as an exact brief and split the document into sections a component designer can draw one by one.
Design every section as a CARD, not as lines of text: say in each request which pastel fill and stroke the card uses, its radius, the badge or strip that carries the number or icon, the padding, and where the student writes. Decide the palette once in styleNotes and make the sections use it consistently (a different pastel per section, one accent for headings and badges). For children, make it playful: bigger type, rounder cards, a friendly emoji, plenty of writing space.
Rules: exactly one section has repeats=true (the generated content) unless the document genuinely repeats nothing. A header is pageScope "first" (or "every" for slides), a footer is pageScope "every" and placement "fixed". Keep it to the fewest sections that do the job. Anything the AI writes is a field, never fixed text; anything the teacher writes every time is also a field. Give answer-bearing documents a second view that hides the answer fields. ${library}
${DESIGN_RULES}`,
      messages: [image
        ? { role: "user", content: [{ type: "text", text: `${prompt}\n\nUse the attached image as the visual reference for structure, proportions and colour feel.` }, { type: "image_url", image_url: { url: image, detail: "high" } }] }
        : { role: "user", content: prompt }]
    });

    // 2. Design each section with the same agent that draws single components.
    const sections = (brief.sections || []).slice(0, 5);
    const designed = await Promise.all(sections.map(async (section) => {
      const context = `This component is the "${section.title}" (${section.role}) of a document: ${brief.improvedPrompt}. Accent colour ${brief.accent || "#5b5bd6"}. Audience: ${brief.audience || "teenagers"}. Visual direction for the whole document (follow it exactly): ${brief.styleNotes || "soft pastel cards with one accent colour"}. ${section.repeats ? "It repeats once per generated item." : "It appears once."}`;
      try {
        // A repeating item must leave room for its neighbours; a header or footer is a band.
        const maxHeight = section.repeats ? 62 : section.role === "footer" ? 22 : 55;
        const { dsl } = await designComponent({ apiKey, prompt: `${section.request}\n\nDocument: ${brief.improvedPrompt}\n\nThis part must fit in ${maxHeight} mm of height.`, image: section.role === "content" ? image : "", context, maxHeight });
        // Only the repeating section may carry a list: a header or footer that "repeats" would
        // duplicate itself down the page, and its item fields would double the document's schema.
        if (!section.repeats && dsl.list) dsl.list = null;
        return { ...section, dsl };
      } catch (error) {
        return { ...section, dsl: null, error: String(error.message || error) };
      }
    }));

    const failed = designed.filter((section) => !section.dsl);
    return NextResponse.json({
      brief: { name: brief.name, canvas: brief.canvas, accent: brief.accent, audience: brief.audience, styleNotes: brief.styleNotes, views: brief.views, improvedPrompt: brief.improvedPrompt, reuseTemplateName: brief.reuseTemplateName, images: brief.images, notes: brief.notes },
      sections: designed.filter((section) => section.dsl),
      reply: `${brief.notes || "Here is your template."}${failed.length ? ` (${failed.length} section could not be drawn: ${failed.map((section) => section.title).join(", ")}.)` : ""}`
    });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
