import { NextResponse } from "next/server";
import { createSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: "Supabase environment variables are missing."
    }, { status: 500 });
  }

  try {
    const client = createSupabaseAdminClient();
    const { error } = await client.from("workspaces").select("id", { count: "exact", head: true });

    if (error) {
      return NextResponse.json({
        ok: false,
        configured: true,
        message: error.message
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, configured: true });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      configured: true,
      message: String(error.message || error)
    }, { status: 500 });
  }
}
