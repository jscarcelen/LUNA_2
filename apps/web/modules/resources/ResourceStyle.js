"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OutputPreviewPane, OutputStylePanel } from "../template-studio/output/OutputDesigner";
import { buildOutputDocument, itemsToBlocks, planOutput } from "../template-studio/output/outputDocument";
import { resolveOutputLanguage } from "../template-studio/output/labels";

/** Plain-text reading of typed blocks, for the Raw tab. */
function blocksToText(blocks = []) {
  return blocks.map((block) => {
    if (!block) return "";
    const type = String(block.type || "").toLowerCase();
    if (type === "heading" || type === "paragraph" || type === "callout") return String(block.text || "");
    if (type === "bullet_list") return [block.title, ...(Array.isArray(block.items) ? block.items : [])].filter(Boolean).join("\n");
    if (type === "question_mc" || type === "question_open") return String(block.question || "");
    if (type === "question_tf") return String(block.statement || "");
    if (type === "question_fill") return String(block.sentence || "");
    if (type === "flashcard") return `${block.front || ""}: ${block.back || ""}`;
    return "";
  }).filter(Boolean).join("\n\n");
}

/** The typed blocks a saved resource is made of, or null when it has no component layout. */
export function resourceBlocks(resource) {
  const data = resource?.data || {};
  if (data.isBlockOutput && Array.isArray(data.blocks)) return data.blocks;
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return null;
  try {
    const blocks = itemsToBlocks(items);
    return Array.isArray(blocks) && blocks.length ? blocks : null;
  } catch {
    return null;
  }
}

/**
 * Change the look of a saved resource at any time: format and colour for each component, with the
 * result previewed in every page size and view, and exported from the same place. The choice is
 * saved with the resource a moment after each change, so there is no Save button to forget.
 */
export function ResourceStyle({ resource, onSaveStyles, onStatus }) {
  const blocks = useMemo(() => resourceBlocks(resource), [resource]);
  const isBlocks = Boolean(resource?.data?.isBlockOutput);
  const [styles, setStyles] = useState(() => (resource?.request?.outputStyles && typeof resource.request.outputStyles === "object" ? resource.request.outputStyles : {}));
  const [selection, setSelection] = useState({ layoutIndex: 0, viewIndex: 0 });
  const [saved, setSaved] = useState("");
  const firstRun = useRef(true);

  const rawText = useMemo(() => (blocks ? blocksToText(blocks) : ""), [blocks]);
  const language = useMemo(() => resolveOutputLanguage([], {}, rawText), [rawText]);
  const plan = useMemo(() => {
    if (!blocks) return null;
    return planOutput({
      blocks,
      title: String(resource.data?.title || "").trim() || resource.name || "",
      subtitle: String(resource.data?.subtitle || ""),
      framed: !isBlocks,
      passages: Array.isArray(resource.data?.sources) ? resource.data.sources : [],
      linkBase: typeof window !== "undefined" ? window.location.origin : "",
      language
    });
  }, [blocks, resource, isBlocks, language]);
  const doc = useMemo(() => {
    if (!plan) return null;
    try { return buildOutputDocument(plan, styles, { language }); } catch (error) { console.error("[ResourceStyle] could not build the document", error); return null; }
  }, [plan, styles, language]);

  useEffect(() => {
    if (doc && (selection.layoutIndex >= doc.layouts.length || selection.viewIndex >= doc.views.length)) setSelection({ layoutIndex: 0, viewIndex: 0 });
  }, [doc, selection.layoutIndex, selection.viewIndex]);

  // Save a moment after the last change (not on the first render).
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined; }
    setSaved("Saving…");
    const timer = window.setTimeout(async () => {
      try {
        await onSaveStyles?.(styles);
        setSaved("Look saved with this resource");
      } catch (error) {
        setSaved("");
        onStatus?.(String(error.message || error));
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [styles]);

  if (!blocks || !plan) {
    return <p className="m-0 text-sm text-soft-ink">This resource has no component layout to restyle. Regenerate it with a current agent to choose its format and colour.</p>;
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="grid gap-2">
        <OutputStylePanel plan={plan} styles={styles} onStylesChange={setStyles} />
        <p className="m-0 text-[11px] text-soft-ink">{saved || "Change a format or colour whenever you like — it is saved with the resource."}</p>
      </div>
      <div className="lg:sticky lg:top-4">
        <OutputPreviewPane
          doc={doc}
          selection={selection}
          onSelection={setSelection}
          dataJson={JSON.stringify(blocks, null, 2)}
          rawText={rawText}
          filename={resource.name || "resource"}
          onError={onStatus}
          emptyHint="Nothing to show yet."
        />
      </div>
    </div>
  );
}
