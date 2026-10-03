"use client";

import { useMemo } from "react";
import { ActivityPlayer } from "../activities/ActivityPlayer";
import { activityLook, outputTitle, resourceBlocks } from "../resources/look";
import { MARKDOWN_CSS } from "./markdown";
import { READER_CSS, blocksToReaderHtml } from "./documentHtml";

/**
 * The interactive HTML form of an output, in place (not a full-screen overlay): a quiz or exam is
 * answered on the page and the answers are shown once it is checked; a flashcard set is the flip
 * deck; a document is the reading page. Used for the preview in Configure output.
 */
export function InteractiveView({ resource, activity = null, onSubmit, title = "" }) {
  const playable = activity || (resource?.activity?.questions?.length ? resource.activity : null);
  const look = useMemo(() => activityLook(resource), [resource]);
  const heading = outputTitle(resource);
  const html = useMemo(() => {
    if (playable) return "";
    const blocks = resourceBlocks(resource);
    return blocks ? blocksToReaderHtml(blocks, { title: title || heading }) : "";
  }, [playable, resource, title]);
  return (
    <div className="tw-scope px-3 py-5 sm:px-6">
      <style>{MARKDOWN_CSS}{READER_CSS}</style>
      {playable
        ? <ActivityPlayer activity={{ ...playable, title: heading || playable.title }} look={look} onSubmit={onSubmit} />
        : html
          ? <article className="md mx-auto max-w-3xl rounded-[18px] border border-ink/8 bg-white px-6 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] sm:px-10" dangerouslySetInnerHTML={{ __html: html }} />
          : <p className="m-0 text-center text-sm text-soft-ink">There is no interactive form of this output.</p>}
    </div>
  );
}
