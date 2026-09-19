import { NextResponse } from "next/server";
import { estimateAgentRun } from "../../../../../modules/ai-tools/pipeline/agentBuilder.js";
import { normalizeConfig } from "../../../../../modules/ai-tools/pipeline/agentConfig.js";

// Pre-run cost estimate: same material selection as a real run, no model call.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const config = normalizeConfig(body?.config || {});
    return NextResponse.json(await estimateAgentRun(config));
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
