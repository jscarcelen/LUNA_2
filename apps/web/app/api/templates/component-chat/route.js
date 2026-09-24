import { NextResponse } from "next/server";
import { designComponent } from "../../../../modules/template-studio/server/designer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Component chatbot: the user describes a block in plain words and Luna designs it (fields +
 * layout) through the internal design agent. Premium feature.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const prompt = String(body?.prompt || "").trim();
    const previous = body?.previous || null;
    const image = typeof body?.image === "string" && body.image.startsWith("data:image/") ? body.image : "";
    if (!prompt) return NextResponse.json({ error: "Describe the component first." }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No model configured." }, { status: 500 });
    const { dsl, plan, reply } = await designComponent({ apiKey, prompt, previous, image });
    return NextResponse.json({ dsl, reply: `${reply}${plan.interpretation ? ` (${plan.interpretation.split(". ")[0]}.)` : ""}`, plan: { interpretation: plan.interpretation, checks: plan.checks } });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
