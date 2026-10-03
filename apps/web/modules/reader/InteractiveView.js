"use client";

import { useMemo, useRef, useState } from "react";
import { ActivityPlayer } from "../activities/ActivityPlayer";
import { activityLook, outputTitle, resourceBlocks } from "../resources/look";
import { MARKDOWN_CSS } from "./markdown";
import { READER_CSS, blocksToReaderHtml } from "./documentHtml";
import { DownloadPanel } from "./DownloadPanel";
import { markedHtml } from "./highlights";

/**
 * The interactive HTML form of an output, in place (not a full-screen overlay): a quiz or exam is
 * answered on the page and the answers are shown once it is checked; a flashcard set is the flip
 * deck; a document is the reading page. Used for the preview in Configure output. The Download
 * button at the top right opens the PDF page-size × view matrix and the HTML.
 */
export function InteractiveView({ resource, activity = null, onSubmit, title = "" }) {
  const rootRef = useRef(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [problem, setProblem] = useState("");
  const playable = activity || (resource?.activity?.questions?.length ? resource.activity : null);
  const look = useMemo(() => activityLook(resource), [resource]);
  const heading = outputTitle(resource);
  const html = useMemo(() => {
    if (playable) return "";
    const blocks = resourceBlocks(resource);
    return blocks ? blocksToReaderHtml(blocks, { title: title || heading }) : "";
  }, [playable, resource, title]);
  const getHtml = () => {
    const article = rootRef.current?.querySelector("article");
    return article ? markedHtml(article, [], { notes: false }) : "";
  };
  return (
    <div className="tw-scope relative px-3 py-5 sm:px-6">
      <style>{MARKDOWN_CSS}{READER_CSS}</style>
      <div className="mb-3 flex justify-end">
        <button type="button" aria-expanded={downloadOpen} aria-label="Download" className="inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]" onClick={() => setDownloadOpen((open) => !open)}>⤓<span className="ml-1">Download</span></button>
      </div>
      {downloadOpen ? (
        <>
          <button type="button" aria-label="Close download" className="fixed inset-0 z-10 cursor-default bg-black/20" onClick={() => setDownloadOpen(false)} />
          <div className="absolute right-3 top-12 z-20 max-h-[75vh] w-[min(94vw,540px)] overflow-y-auto rounded-2xl border border-ink/10 bg-white p-4 shadow-[0_16px_48px_rgba(0,0,0,0.25)] sm:right-6">
            <div className="mb-3 flex items-center justify-between"><p className="m-0 text-sm font-bold text-ink">Download</p><button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => setDownloadOpen(false)}>Close</button></div>
            <DownloadPanel resource={resource} filename={heading || resource?.name} activity={playable} getHtml={getHtml} onError={setProblem} />
            {problem ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{problem}</p> : null}
          </div>
        </>
      ) : null}
      <div ref={rootRef}>
        {playable
          ? <ActivityPlayer activity={{ ...playable, title: heading || playable.title }} look={look} onSubmit={onSubmit} />
          : html
            ? <article className="md mx-auto max-w-3xl rounded-[18px] border border-ink/8 bg-white px-6 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] sm:px-10" dangerouslySetInnerHTML={{ __html: html }} />
            : <p className="m-0 text-center text-sm text-soft-ink">There is no interactive form of this output.</p>}
      </div>
    </div>
  );
}
