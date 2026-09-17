import { NextResponse } from "next/server";
import { runAgentGeneration } from "../../../../modules/ai-tools/pipeline/agentBuilder.js";
import { normalizeConfig } from "../../../../modules/ai-tools/pipeline/agentConfig.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const config = normalizeConfig(body?.config || {});
    const result = await runAgentGeneration(config);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
