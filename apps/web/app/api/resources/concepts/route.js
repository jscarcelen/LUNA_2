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
        model: process.env.LUNA_CONCEPT_MODEL || "gpt-4o",
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: { name: "resource_concepts", strict: true, schema: SCHEMA } },
        messages: [
          { role: "system", content: `You are a teacher cataloguing material for a study planner. Read the resource in the user message and list what it teaches as 3 to 12 small, checkable learning goals, after a one or two sentence "context" saying what the resource is about and where it sits in the subject.

<what_a_goal_is>
A goal is checkable when one question could test it and a learner could get that question right or wrong ("factorising quadratics", "parts of a plant cell"). Give each goal a name of 2-6 words, one short sentence of detail saying what the learner can do once they have it, and a level (remember, understand, apply or analyse) that matches what the questions actually ask of the learner.
</what_a_goal_is>

<rules>
1. Write goals, never a summary of the document and never one goal per question: questions that test the same skill share one goal, because plans link resources through goals that several resources have in common.
2. Use the wording a syllabus would use, in its general form ("factorising quadratics", not "factorising x^2 + 5x + 6"), because the same goal coming from two different resources must read the same.
3. Base every goal on the questions and content sample given, because the person edits this list and goals the material does not support are noise.
4. Write context, names and details in the language of the resource.
</rules>

Before you answer, check that each goal can be traced to the questions or the sample, that no two goals overlap, and that names are 2-6 words. Fix what fails, then answer.` },
          { role: "user", content: `<resource_name>${name}</resource_name>\n<source_material>${sources.join(", ") || "unknown"}</source_material>\n\n<questions>\n${questions.map((question, index) => `${index + 1}. ${question}`).join("\n") || "(none)"}\n</questions>\n\n<content_sample>\n${sample}\n</content_sample>\n\nList what this resource teaches now.` }
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
