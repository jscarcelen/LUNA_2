/**
 * POST /api/concepts/extract
 * Extracts concepts from a document and saves them to the DB.
 * Called at document upload time (non-blocking) and on-demand from PlansPage.
 *
 * Body: { documentId, workspaceId, ownerUserId? }
 * Returns: { conceptCount, concepts[] }
 *
 * Text source priority:
 *   1. document_chunks.content_markdown (best — chunked + cleaned text)
 *   2. documents.content JSON blob (fallback — parse the CDM)
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabaseClient.js";
import { extractAndSaveConcepts } from "../../../../lib/conceptsRepository.js";
import { ownerUserIdFor } from "../../../../lib/session.js";
import { denyUnlessOwner } from "../../../../lib/resourceAccess.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json();
    const documentId  = String(body?.documentId  || "").trim();
    const workspaceId = String(body?.workspaceId || "").trim();
    // The owner is the logged-in account, else the demo owner; a body value is never trusted.
    const ownerUserId = ownerUserIdFor(request);

    if (!documentId || !workspaceId) {
      return NextResponse.json(
        { error: "documentId and workspaceId are required." },
        { status: 400 }
      );
    }

    const denied = await denyUnlessOwner(request, { workspaceId, documentId });
    if (denied) return denied;

    const supabase = createSupabaseAdminClient();

    // 1. Try to get text from document_chunks (richest source)
    const { data: chunks } = await supabase
      .from("document_chunks")
      .select("content_markdown, section, heading_path")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .limit(80);

    let documentText = "";

    if (chunks && chunks.length > 0) {
      documentText = chunks
        .map((c) => [c.heading_path || c.section || "", c.content_markdown || ""].filter(Boolean).join("\n"))
        .join("\n\n")
        .slice(0, 14000);
    }

    // 2. Fallback: parse the documents.content blob
    if (!documentText || documentText.length < 100) {
      const { data: doc } = await supabase
        .from("documents")
        .select("id, content, name")
        .eq("id", documentId)
        .maybeSingle();

      if (doc?.content) {
        documentText = extractTextFromBlob(doc.content);
      }
    }

    if (!documentText || documentText.length < 80) {
      return NextResponse.json({
        conceptCount: 0,
        concepts: [],
        warning: "Document has no extracted text yet. Process it first via the workspace.",
      });
    }

    await extractAndSaveConcepts(documentId, workspaceId, ownerUserId, documentText);

    // Return the saved concepts
    const { data: saved } = await supabase
      .from("concepts")
      .select("id, name, topic, difficulty, importance, bloom_level")
      .eq("source_document_id", documentId)
      .order("importance", { ascending: false });

    return NextResponse.json({
      conceptCount: saved?.length ?? 0,
      concepts: saved ?? [],
    });
  } catch (err) {
    console.error("[api/concepts/extract]", err);
    return NextResponse.json({ error: err.message || "Extraction failed." }, { status: 500 });
  }
}

/**
 * Pull readable text out of the documents.content JSON blob.
 * The blob may be a CDM object, a resource object, a plan object, etc.
 */
function extractTextFromBlob(content) {
  let parsed = content;
  if (typeof content === "string") {
    try { parsed = JSON.parse(content); } catch { return content.slice(0, 12000); }
  }
  if (!parsed || typeof parsed !== "object") return String(parsed || "").slice(0, 12000);

  // CDM shape: { blocks: [...] } or { text: "..." }
  if (parsed.text && typeof parsed.text === "string") return parsed.text.slice(0, 12000);
  if (Array.isArray(parsed.blocks)) {
    return parsed.blocks
      .map((b) => (typeof b === "string" ? b : b.text || b.content || ""))
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 12000);
  }
  if (Array.isArray(parsed.paragraphs)) {
    return parsed.paragraphs
      .map((p) => (typeof p === "string" ? p : p.text || ""))
      .join("\n")
      .slice(0, 12000);
  }
  if (parsed.content && typeof parsed.content === "string") return parsed.content.slice(0, 12000);

  // Last resort: stringify and strip JSON syntax
  return JSON.stringify(parsed)
    .replace(/["{}[\]]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 12000);
}
