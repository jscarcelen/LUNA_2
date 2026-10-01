/**
 * POST /api/concepts/extract
 * Extracts concepts from a document and saves them to the DB.
 * Called at document upload time (non-blocking) and on-demand.
 *
 * Body: { documentId, workspaceId, ownerUserId }
 * Returns: { conceptCount, concepts[] }
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabaseClient.js";
import { extractAndSaveConcepts } from "../../../../lib/conceptsRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json();
    const documentId  = String(body?.documentId  || "").trim();
    const workspaceId = String(body?.workspaceId || "").trim();
    const ownerUserId = String(body?.ownerUserId || "").trim();

    if (!documentId || !workspaceId || !ownerUserId) {
      return NextResponse.json(
        { error: "documentId, workspaceId, and ownerUserId are required." },
        { status: 400 }
      );
    }

    // Fetch the document text from Supabase
    const supabase = createSupabaseAdminClient();
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, extracted_content, title")
      .eq("id", documentId)
      .eq("owner_user_id", ownerUserId)
      .single();

    if (docErr || !doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    // Extract text from the canonical document model JSON
    const extractedContent = doc.extracted_content || {};
    const documentText = extractTextFromCDM(extractedContent) || String(extractedContent);

    if (!documentText || documentText.length < 100) {
      return NextResponse.json({ conceptCount: 0, concepts: [], warning: "Document text too short for extraction." });
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
 * Flatten a CDM (canonical document model) object to plain text for concept extraction.
 * The CDM may be a string, an object with a `text` or `blocks` array, or similar.
 */
function extractTextFromCDM(cdm) {
  if (!cdm) return "";
  if (typeof cdm === "string") return cdm;
  if (typeof cdm !== "object") return String(cdm);

  // Common CDM shapes used in LUNA's document processing pipeline
  if (cdm.text) return String(cdm.text);
  if (Array.isArray(cdm.blocks)) {
    return cdm.blocks
      .map((b) => {
        if (typeof b === "string") return b;
        if (b.text) return String(b.text);
        if (b.content) return String(b.content);
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if (cdm.content) return String(cdm.content);
  if (cdm.paragraphs && Array.isArray(cdm.paragraphs)) {
    return cdm.paragraphs.map((p) => (typeof p === "string" ? p : p.text || "")).join("\n");
  }

  // Fallback: stringify keys that look like text content
  return JSON.stringify(cdm).slice(0, 12000);
}
