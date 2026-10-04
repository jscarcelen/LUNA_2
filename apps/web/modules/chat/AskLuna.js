"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MARKDOWN_CSS } from "../reader/markdown";
import { chargeRun } from "../credits/credits";
import { streamChat } from "./client";
import { CITE_CSS, SourceList, jumpToCitation, renderAssistant } from "./ChatParts";
import { useAskLunaWorkspace } from "./AskLunaContext";
import { describeView, selectMaterial } from "./materialChat";

const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-40";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";

let counter = 0;
const uid = (prefix) => `${prefix}${Date.now().toString(36)}${(counter += 1).toString(36)}`;
const fmt = (n) => Number(n || 0).toLocaleString("en-US");

const SUGGESTIONS = {
  quiz: ["Give me a hint for the question I am on", "Which part of the material covers this quiz?", "Explain the idea behind this topic simply"],
  flashcards: ["Explain the card I am on with an example", "How do these terms connect to each other?", "Which part of the material covers these cards?"],
  document: ["Summarise the part I am reading", "Explain this part in simpler words", "What are the key points to remember?"],
  generated: ["Summarise this in five points", "Explain the hardest idea here simply", "Where in the material does this come from?"]
};

/**
 * "Ask Luna": the assistant next to a piece of material (a quiz, an exam, flashcards, a summary, an
 * uploaded document). It answers from the material the learner is studying — their study plan's
 * documents, its master document and the reference documents it was made from — and knows what they
 * are doing right now, so it can give a hint on the question they are on without giving the answer
 * away. Chatting records nothing: no attempt, no score. Usage is charged in lunas like the Assistant.
 *
 *   item  { documentId, planId, sourceDocumentIds, readSelf, subjectId }  what the material is
 *   view  { kind, title, agentName, section, progress, notesView }        what the user is doing (describeView)
 *   layout "aside"    a column in a flex row (the reader), a bottom sheet on a phone
 *          "floating" a floating card (an in-place view), a bottom sheet on a phone
 *   open / onOpenChange   controlled by the host, so it can keep the notes panel and this one apart
 */
export function AskLuna({ open, onOpenChange, item = {}, view = {}, layout = "aside", launcherClassName = "" }) {
  const { workspaces, selectedWorkspaceId, selectedSubjectId } = useAskLunaWorkspace();
  const workspace = useMemo(() => workspaces.find((entry) => entry.id === selectedWorkspaceId) || workspaces[0] || null, [workspaces, selectedWorkspaceId]);
  const itemKey = JSON.stringify([item.documentId, item.planId, item.sourceDocumentIds, item.readSelf, item.subjectId]);
  const selection = useMemo(
    () => selectMaterial(workspace, { subjectId: item.subjectId || selectedSubjectId, documentId: item.documentId, planId: item.planId, sourceDocumentIds: item.sourceDocumentIds, readSelf: item.readSelf }),
    [workspace, selectedSubjectId, itemKey]
  );
  const context = useMemo(() => describeView({ ...view, planName: selection.plans[0]?.name || "", planDeadline: selection.plans[0]?.deadline || "" }), [view, selection]);
  const kind = SUGGESTIONS[view.kind] ? view.kind : "document";

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const threadRef = useRef(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }); }, [messages, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text, { confirmed = false, reuse = null } = {}) {
    const clean = String(text || "").trim();
    if (!clean || busy) return;
    const userMessage = reuse?.user || { id: uid("u"), role: "user", text: clean };
    const reply = { id: uid("a"), role: "assistant", text: "", status: "Thinking…" };
    const base = reuse ? reuse.history : messages;
    const transcript = [...base, userMessage].map((message) => ({ role: message.role, content: message.text }));
    setMessages([...base, userMessage, reply]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const patch = (change) => setMessages((current) => current.map((message) => (message.id === reply.id ? (typeof change === "function" ? change(message) : { ...message, ...change }) : message)));
    try {
      await streamChat({
        messages: transcript,
        scope: selection.scope,
        referencedDocumentIds: selection.referencedDocumentIds,
        context,
        confirmed,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "delta") patch((message) => ({ ...message, text: message.text + event.text, status: "" }));
          else if (event.type === "status") patch({ status: event.text });
          else if (event.type === "confirm") patch({ status: "", confirm: event, pending: { text: clean, user: userMessage, history: base } });
          else if (event.type === "sources") patch({ sources: event.sources });
          else if (event.type === "usage") { patch({ usage: event }); chargeRun({ agentName: "Ask Luna", usage: { total_tokens: event.totalTokens }, model: event.model }); }
          else if (event.type === "error") patch({ status: "", error: event.error });
        }
      });
    } catch (error) {
      if (error?.name !== "AbortError") patch({ status: "", error: String(error?.message || error) });
    } finally {
      patch((message) => ({ ...message, status: "" }));
      setBusy(false);
      abortRef.current = null;
    }
  }

  const confirmRun = (message) => message.pending && send(message.pending.text, { confirmed: true, reuse: { user: message.pending.user, history: message.pending.history } });
  const cancelRun = (message) => setMessages((current) => current.filter((entry) => entry.id !== message.id));
  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setBusy(false);
  }

  const panelClass = layout === "aside"
    ? "fixed inset-x-0 bottom-0 z-[61] flex h-[70vh] flex-col rounded-t-2xl border-t border-ink/10 bg-white shadow-[0_-12px_32px_rgba(0,0,0,0.15)] lg:static lg:z-auto lg:h-auto lg:w-96 lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
    : "fixed inset-x-0 bottom-0 z-[46] flex h-[70vh] flex-col rounded-t-2xl border-t border-ink/10 bg-white shadow-[0_-12px_32px_rgba(0,0,0,0.15)] lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-20 lg:h-auto lg:w-96 lg:rounded-2xl lg:border lg:shadow-[0_16px_48px_rgba(0,0,0,0.2)]";
  const launcherBase = layout === "aside" ? "fixed bottom-5 right-5 z-[5]" : "fixed bottom-5 right-5 z-[45]";

  return (
    <>
      {!open ? (
        <button type="button" aria-label="Ask Luna about this material" onClick={() => onOpenChange?.(true)} className={`${launcherBase} ${launcherClassName} inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,113,227,0.35)] transition hover:bg-[#0077ed] active:scale-[0.98]`}>
          <span aria-hidden>✦</span> Ask Luna
        </button>
      ) : null}
      {open ? (
        <aside className={`tw-scope ${panelClass}`} aria-label="Ask Luna">
          <style>{MARKDOWN_CSS}{CITE_CSS}</style>
          <div className="flex items-center gap-2 border-b border-ink/8 px-4 py-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">L</span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-bold text-ink">Ask Luna</p>
              <p className="m-0 truncate text-[11px] text-soft-ink" title={context}>{selection.label}</p>
            </div>
            {messages.length ? <button type="button" className={ghostBtn} onClick={newChat}>New chat</button> : null}
            <button type="button" className={ghostBtn} aria-label="Close Ask Luna" onClick={() => onOpenChange?.(false)}>Close</button>
          </div>
          {selection.documents.length ? (
            <details className="border-b border-ink/8 px-4 py-1.5 text-[11px] text-soft-ink">
              <summary className="cursor-pointer font-semibold">Reading from {selection.documents.length} document{selection.documents.length === 1 ? "" : "s"}{selection.plans.length ? ` of ${selection.plans.length === 1 ? `“${selection.plans[0].name}”` : `${selection.plans.length} plans`}` : ""}</summary>
              <ul className="m-0 mt-1 grid list-none gap-0.5 p-0">{selection.documents.slice(0, 30).map((document) => <li key={document.id} className="truncate">· {document.name}</li>)}</ul>
            </details>
          ) : null}
          <div ref={threadRef} onClick={jumpToCitation} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!messages.length ? (
              <div className="grid gap-3 py-2">
                <p className="m-0 text-sm text-soft-ink">{kind === "quiz" || kind === "flashcards" ? "Stuck? Ask for a hint or an explanation — I answer from your material and will not give away an answer you have not checked." : "Ask anything about what you are reading — I answer from your material and show where it came from."}</p>
                <div className="grid gap-2">
                  {SUGGESTIONS[kind].map((suggestion) => <button key={suggestion} type="button" onClick={() => send(suggestion)} className="rounded-2xl border border-ink/10 bg-white px-3 py-2 text-left text-sm text-ink transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">{suggestion}</button>)}
                </div>
                <p className="m-0 text-[11px] text-soft-ink">Chatting here does not count as an attempt and does not change your results.</p>
              </div>
            ) : (
              <div className="grid gap-5">
                {messages.map((message) => (
                  <div key={message.id} data-message={message.id} className={message.role === "user" ? "flex justify-end" : "min-w-0"}>
                    {message.role === "user" ? (
                      <p className="m-0 max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--accent-soft)] px-3.5 py-2 text-sm text-ink">{message.text}</p>
                    ) : (
                      <div className="min-w-0">
                        {message.status ? <p className="m-0 text-sm text-soft-ink"><span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-[var(--accent)]" />{message.status}</p> : null}
                        {message.text ? <div className="md !text-[14px]" dangerouslySetInnerHTML={{ __html: renderAssistant(message.text) }} /> : null}
                        {message.error ? <p className="m-0 mt-2 rounded-xl bg-[rgba(255,59,48,0.08)] px-3 py-2 text-sm text-[var(--color-danger)]">{message.error}</p> : null}
                        {message.confirm ? (
                          <div className="mt-2 rounded-2xl border border-ink/10 bg-white p-3">
                            <p className="m-0 text-sm font-semibold text-ink">This is a big request</p>
                            <p className="m-0 mt-1 text-xs text-soft-ink">It would use about <strong className="text-ink">{fmt(message.confirm.tokens)} lunas</strong>. Run it?</p>
                            <div className="mt-2 flex gap-2"><button type="button" className={primaryBtn} onClick={() => confirmRun(message)}>Run it</button><button type="button" className={ghostBtn} onClick={() => cancelRun(message)}>Cancel</button></div>
                          </div>
                        ) : null}
                        <SourceList messageId={message.id} sources={message.sources} />
                        {message.usage ? <p className="m-0 mt-2 text-[10px] text-soft-ink">{fmt(message.usage.totalTokens)} lunas used</p> : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-ink/8 p-3">
            <div className="flex items-end gap-2 rounded-3xl border border-ink/12 bg-white p-1.5 focus-within:border-[var(--accent)]">
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                placeholder="Ask about this material…"
                onChange={(event) => { setInput(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(120, event.target.scrollHeight)}px`; }}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(input); } }}
                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none"
              />
              {busy
                ? <button type="button" onClick={() => abortRef.current?.abort()} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white" aria-label="Stop">■</button>
                : <button type="button" disabled={!input.trim()} onClick={() => send(input)} className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white transition disabled:opacity-40" aria-label="Send">↑</button>}
            </div>
            <p className="m-0 mt-1 text-center text-[10px] text-soft-ink">Answers come from your material. It can be wrong — check the references.</p>
          </div>
        </aside>
      ) : null}
    </>
  );
}
