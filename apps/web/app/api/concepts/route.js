/**
 * GET /api/concepts?workspaceId=&subjectId=
 * Returns all concepts + prerequisites for a workspace.
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabaseClient.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = String(searchParams.get("workspaceId") || "").trim();

    if (!workspaceId) {
      return NextResponse.json({ concepts: [], prerequisites: [] });
    }

    const supabase = createSupabaseAdminClient();

    const { data: concepts, error: cErr } = await supabase
      .from("concepts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("importance", { ascending: false });

    if (cErr) throw new Error(cErr.message);

    const conceptIds = (concepts || []).map((c) => c.id);

    const { data: prereqs } = conceptIds.length
      ? await supabase
          .from("concept_prerequisites")
          .select("concept_id, prerequisite_id, strength")
          .in("concept_id", conceptIds)
      : { data: [] };

    return NextResponse.json({
      concepts: concepts || [],
      prerequisites: prereqs || [],
    });
  } catch (err) {
    console.error("[api/concepts]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
