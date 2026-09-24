import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    context: { type: "string", description: "One or two sentences: what this resource is about and where it sits in the subject." },
    concepts: {
      type: "array",
      description: "The learning goals this resource actually teaches or tests, from 3 to 12, each small enough to be ticked off on its own.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          name: { type: "string", description: "The concept in 2–6 words, as a teacher would list it ('factorising quadratics', 'parts of a plant cell')." },
          detail: { type: "string", description: "One short sentence saying what the learner can do once they have it." },
          level: { type: "string", enum: ["remember", "understand", "apply", "analyse"] }
        },
        required: ["name", "detail", "level"]
      }
    }
  },
  required: ["context", "concepts"]
};

/**
 * Reads a generated resource and lists what it teaches: a short context and granular learning
 * goals. The list is a proposal — the person edits it — and it is what plans are built from, so it
 * is deliberately fine-grained: several resources ending up on the same concept is the point.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const questions = Array.isArray(body?.questions) ? body.questions.slice(0, 40) : [];
    const sample = typeof body?.sample === "string" ? body.sample.slice(0, 4000) : "";
    const sources = Array.isArray(body?.sources) ? body.sources.slice(0, 10) : [];
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No model configured." }, { status: 500 });
    if (!name && !questions.length && !sample) return NextResponse.json({ error: "Nothing to read." }, { status: 400 });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.LUNA_CONCEPT_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: { name: "resource_concepts", strict: true, schema: SCHEMA } },
        messages: [
          { role: "system", content: "You are a teacher cataloguing material for a study planner. List what a resource teaches as small, checkable learning goals — never a summary of the document, never one goal per question. Prefer the wording a syllabus would use, so the same goal from two different resources reads the same." },
          { role: "user", content: `Resource: ${name}\nMaterial it came from: ${sources.join(", ") || "unknown"}\n\nQuestions it contains:\n${questions.map((question, index) => `${index + 1}. ${question}`).join("\n") || "(none)"}\n\nContent sample:\n${sample}` }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Model request failed");
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    return NextResponse.json({ context: parsed.context || "", concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [] });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
