import Link from "next/link";
import { loadWorkspaceTreeForAi } from "../../modules/ai-tools/pipeline/workspaceSource.js";
import { chunkDocuments, DEFAULT_CHUNK_WORDS, DEFAULT_OVERLAP_WORDS } from "../../modules/ai-tools/pipeline/chunking.js";
import { MARKDOWN_CSS, markdownToHtml } from "../../modules/reader/markdown.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Source passage · LUNA" };

const page = { minHeight: "100vh", background: "#f5f5f7", color: "#1d1d1f", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: "32px 16px" };
const card = { maxWidth: 760, margin: "0 auto", background: "#fff", borderRadius: 18, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)", padding: "28px 32px" };
const kicker = { margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6e6e73" };

/** The first occurrence of `quote` in `content`, tolerant of line breaks and repeated spaces. */
function findQuote(content, quote) {
  const words = String(quote || "").trim().split(/\s+/).filter(Boolean);
  for (const take of [words.length, Math.min(words.length, 12), Math.min(words.length, 6)]) {
    if (take < 3) break;
    const pattern = words.slice(0, take).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    const match = new RegExp(pattern, "i").exec(content);
    if (match) {
      // Extend to the end of the quote when the whole of it matched, else to the end of the sentence.
      const end = take === words.length ? match.index + match[0].length : (content.slice(match.index).search(/[.!?]\s|\n/) + 1 || match[0].length) + match.index;
      return { start: match.index, end: Math.max(end, match.index + match[0].length) };
    }
  }
  return null;
}

export default async function SourcePage({ searchParams }) {
  const params = await searchParams;
  const documentId = String(params?.d || "").trim();
  const chunkNumber = Math.max(1, Number(params?.c) || 1);
  const quote = String(params?.q || "").slice(0, 400);

  let documentName = "";
  let chunks = [];
  if (documentId) {
    const workspaces = await loadWorkspaceTreeForAi();
    const document = workspaces.flatMap((workspace) => workspace.subjects || []).flatMap((subject) => subject.documents || []).find((item) => item.id === documentId);
    if (document) {
      documentName = document.name || "Document";
      chunks = chunkDocuments([{ ...document, documentId: document.id, documentName }], { chunkWords: DEFAULT_CHUNK_WORDS, overlapWords: DEFAULT_OVERLAP_WORDS });
    }
  }
  let index = Math.min(chunkNumber, chunks.length) - 1;
  // The words are the reliable address: if the document was re-chunked or edited since the link was
  // made, open the passage that really contains the quote.
  if (quote && chunks.length && !(chunks[index] && findQuote(String(chunks[index].content || ""), quote))) {
    const found = chunks.findIndex((candidate) => findQuote(String(candidate.content || ""), quote));
    if (found >= 0) index = found;
  }
  const chunk = chunks[index];

  if (!chunk) {
    return (
      <main style={page}>
        <div style={card}>
          <p style={kicker}>Source passage</p>
          <h1 style={{ margin: "8px 0 4px", fontSize: 22 }}>We couldn't find that passage</h1>
          <p style={{ margin: 0, color: "#6e6e73" }}>The document may have been removed or edited since this was created.</p>
          <p style={{ margin: "20px 0 0" }}><Link href="/" style={{ color: "#0071e3" }}>← Back to LUNA</Link></p>
        </div>
      </main>
    );
  }

  const content = String(chunk.content || "");
  const heading = Array.isArray(chunk.headingPath) && chunk.headingPath.length ? chunk.headingPath.join(" › ") : chunk.section || "";
  const link = (n) => `/source?d=${encodeURIComponent(documentId)}&c=${n}`;

  return (
    <main style={page}>
      <div style={card}>
        <p style={kicker}>Source passage</p>
        <h1 style={{ margin: "8px 0 2px", fontSize: 24, letterSpacing: "-0.01em" }}>{documentName}</h1>
        <p style={{ margin: 0, color: "#6e6e73", fontSize: 14 }}>{heading ? `${heading} · ` : ""}{chunk.page ? (chunk.pageEnd && chunk.pageEnd !== chunk.page ? `pages ${chunk.page}–${chunk.pageEnd} · ` : `page ${chunk.page} · `) : ""}passage {chunk.chunkIndex + 1} of {chunks.length}</p>
        <style dangerouslySetInnerHTML={{ __html: MARKDOWN_CSS }} />
        <div className="md" style={{ marginTop: 20, padding: "8px 22px 14px", background: "#fff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)" }} dangerouslySetInnerHTML={{ __html: markdownToHtml(content, { quote }) }} />
        <script dangerouslySetInnerHTML={{ __html: "document.getElementById('quote')&&document.getElementById('quote').scrollIntoView({block:'center'})" }} />
        <nav style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 20, fontSize: 14 }}>
          {index > 0 ? <Link href={link(index)} style={{ color: "#0071e3" }}>← Previous passage</Link> : <span />}
          <Link href="/" style={{ color: "#6e6e73" }}>Back to LUNA</Link>
          {index < chunks.length - 1 ? <Link href={link(index + 2)} style={{ color: "#0071e3" }}>Next passage →</Link> : <span />}
        </nav>
      </div>
    </main>
  );
}
