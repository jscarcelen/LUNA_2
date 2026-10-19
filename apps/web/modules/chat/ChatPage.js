"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MARKDOWN_CSS } from "../reader/markdown";
import { FolderPicker } from "../ui/FolderTree";
import { branchOf, foldersOf, parseNode, pathOf, subjectNode } from "../workspace/ui/folderModel";
import { SaveResourceDialog } from "../resources/SaveResourceDialog";
import { ReaderView } from "../reader/ReaderView";
import { UpdateDialog } from "../resources/UpdateDialog";
import { parseResource } from "../resources/resource";
import { canUpdateResource } from "../resources/update";
import { chargeRun, readCredits } from "../credits/credits";
import { planChoicesOf, saveResourceFlow } from "../resources/saveFlow";
import { agentFromAction, documentFromAction, runProposedAgent } from "./actions";
import { LOOSE_FOLDER } from "../plans/folders";
import { streamChat } from "./client";
import { formatNumber } from "../../lib/i18n/index.js";
import { CITE_CSS, GroundingNote, SourceList, jumpToCitation, renderAssistant } from "./ChatParts";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const STORAGE_KEY = "luna.chat.v1";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-40";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const cardBox = "rounded-2xl border border-ink/10 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

const SUGGESTIONS = ["misc.chat.sug.0", "misc.chat.sug.1", "misc.chat.sug.2", "misc.chat.sug.3"];

let counter = 0;
const uid = (prefix) => `${prefix}${Date.now().toString(36)}${(counter += 1).toString(36)}`;
const fmt = (n, locale) => formatNumber(Number(n || 0), locale);

/**
 * Luna's assistant: a chat that answers about the user's material with references, answers about
 * Luna, drops in documents, runs agents (after asking), writes documents and turns repeatable
 * processes into agents. Every card it proposes does nothing until the user approves it.
 */
export function ChatPage({ toolContext = {} }) {
  const t = useT();
  const { workspaces = [], selectedWorkspaceId, selectedSubjectId, onUploadTxt, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onCreateFolder, onOpenPage } = toolContext;
  const workspace = workspaces.find((entry) => entry.id === selectedWorkspaceId) || workspaces[0] || null;
  const subject = workspace?.subjects?.find((entry) => entry.id === selectedSubjectId) || null;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(false);
  const [scopeNode, setScopeNode] = useState("");
  const [referenced, setReferenced] = useState([]); // [{ id, name }]
  const [uploading, setUploading] = useState([]); // [{ key, name }]
  const [popover, setPopover] = useState(null); // "scope" | "refs" | null
  const [refQuery, setRefQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [actions, setActions] = useState({}); // id → { phase, resource, ... }
  const [reading, setReading] = useState(null);
  const [saving, setSaving] = useState(null); // { id, resource, kind }
  const [updating, setUpdating] = useState(null); // { actionId, document, resource }: "Update…" on a result card
  const threadRef = useRef(null);
  const fileRef = useRef(null);
  const abortRef = useRef(null);

  const allFolders = useMemo(() => foldersOf(workspace), [workspace]);
  const documents = useMemo(() => (workspace?.subjects || []).flatMap((entry) => (entry.documents || []).filter((document) => document.sourceType !== "generated" || (document.tags || []).includes("resource")).map((document) => ({ id: document.id, name: document.name, subject: entry.name, generated: document.sourceType === "generated" }))), [workspace]);
  const agentDocuments = useMemo(() => (workspace?.subjects || []).flatMap((entry) => (entry.documents || []).filter((document) => document.sourceType === "generated" && (document.tags || []).includes("ai-agent"))), [workspace]);
  const planChoices = useMemo(() => planChoicesOf(workspace), [workspace]);

  // The conversation survives a reload.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved?.messages)) setMessages(saved.messages);
    } catch { /* start fresh */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-40).map(({ pending, ...rest }) => rest) })); } catch { /* storage full */ }
  }, [messages]);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }); }, [messages, actions]);

  const scopeLabel = useMemo(() => {
    if (!focus) return t("misc.chat.wholeWorkspace");
    return scopeNode ? pathOf(allFolders, scopeNode) || t("misc.chat.chosenFolder") : subject?.name || t("misc.chat.currentSubject");
  }, [focus, scopeNode, allFolders, subject, t]);

  function scopePayload() {
    if (!focus) return { workspaceId: workspace?.id, focus: false };
    const node = parseNode(scopeNode || subjectNode(selectedSubjectId || ""));
    let folderIds = [];
    if (node.folderId) {
      const branch = branchOf(allFolders, scopeNode);
      folderIds = [...branch].map((id) => parseNode(id)).filter((entry) => entry.folderId).map((entry) => entry.folderId);
    }
    return { workspaceId: workspace?.id, subjectId: node.subjectId || selectedSubjectId, folderIds, focus: true, label: scopeLabel };
  }

  /* ───────────────────────────────────────────── sending */

  async function send(text, { confirmed = false, reuse = null } = {}) {
    const clean = String(text || "").trim();
    if (!clean || busy) return;
    const userMessage = reuse?.user || { id: uid("u"), role: "user", text: clean, refs: referenced.map((entry) => entry.name) };
    const reply = { id: uid("a"), role: "assistant", text: "", status: t("misc.thinking") };
    const base = reuse ? reuse.history : messages;
    const transcript = [...base, userMessage].map((message) => ({ role: message.role, content: message.text }));
    setMessages([...base, userMessage, reply]);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const patch = (change) => setMessages((current) => current.map((message) => (message.id === reply.id ? (typeof change === "function" ? change(message) : { ...message, ...change }) : message)));
    try {
      await streamChat({
        messages: transcript,
        scope: scopePayload(),
        referencedDocumentIds: referenced.map((entry) => entry.id),
        confirmed,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "delta") patch((message) => ({ ...message, text: message.text + event.text, status: "" }));
          else if (event.type === "status") patch({ status: event.text });
          else if (event.type === "estimate") patch({ estimate: event });
          else if (event.type === "confirm") patch({ status: "", confirm: event, pending: { text: clean, user: userMessage, history: base } });
          else if (event.type === "sources") patch({ sources: event.sources });
          else if (event.type === "grounding") patch({ grounding: event });
          else if (event.type === "actions") patch({ actions: event.actions });
          else if (event.type === "usage") { patch({ usage: event }); chargeRun({ agentName: "Assistant", usage: { total_tokens: event.totalTokens }, model: event.model }); }
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

  function confirmRun(message) {
    if (!message.pending) return;
    const { text, user, history } = message.pending;
    send(text, { confirmed: true, reuse: { user, history } });
  }
  function cancelRun(message) {
    setMessages((current) => current.filter((entry) => entry.id !== message.id));
  }
  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setActions({});
    setReferenced([]);
    setBusy(false);
  }

  /* ───────────────────────────────────────────── files and references */

  async function takeFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (typeof onUploadTxt !== "function" || !selectedSubjectId) {
      setMessages((current) => [...current, { id: uid("a"), role: "assistant", text: t("misc.chat.needSubject") }]);
      return;
    }
    const keys = files.map((file) => ({ key: uid("f"), name: file.name }));
    setUploading((current) => [...current, ...keys]);
    try {
      const result = await onUploadTxt(files, { folderIds: [] });
      const uploaded = Array.isArray(result?.uploadedDocuments) ? result.uploadedDocuments : [];
      setReferenced((current) => [...current, ...uploaded.filter((document) => document?.id).map((document) => ({ id: document.id, name: document.name }))]);
    } catch (error) {
      setMessages((current) => [...current, { id: uid("a"), role: "assistant", text: t("misc.chat.readFail", { error: String(error?.message || error) }) }]);
    } finally {
      setUploading((current) => current.filter((entry) => !keys.some((key) => key.key === entry.key)));
    }
  }

  const toggleRef = (document) => setReferenced((current) => (current.some((entry) => entry.id === document.id) ? current.filter((entry) => entry.id !== document.id) : [...current, { id: document.id, name: document.name }]));

  /* ───────────────────────────────────────────── cards */

  const setAction = (id, change) => setActions((current) => ({ ...current, [id]: { ...(current[id] || {}), ...change } }));

  async function runAgent(action) {
    setAction(action.id, { phase: "running", error: "" });
    try {
      const made = await runProposedAgent(action, { workspaceId: workspace?.id, subjectId: selectedSubjectId, subjectName: subject?.name || "", agentDocuments });
      if (made.tokens) chargeRun({ agentName: action.agentName, usage: { total_tokens: made.tokens }, model: made.model });
      setAction(action.id, { phase: "done", resource: made.resource, summary: made.questions ? t("misc.chat.nQuestions", { count: made.questions }) : made.preview });
    } catch (error) {
      setAction(action.id, { phase: "error", error: String(error?.message || error) });
    }
  }

  /** "Update…" on a result card: a saved one is updated in the workspace, one not saved yet is replaced in the card. */
  function startUpdate(action) {
    const state = actions[action.id] || {};
    const document = state.saved?.id ? (workspace?.subjects || []).flatMap((entry) => entry.documents || []).find((entry) => entry.id === state.saved.id) || null : null;
    const resource = (document && parseResource(document)) || state.resource;
    if (resource) setUpdating({ actionId: action.id, document: document && parseResource(document) ? document : null, resource });
  }

  function openDocumentCard(action) {
    const resource = documentFromAction(action, { subjectName: subject?.name || "" });
    setAction(action.id, { phase: "done", resource, summary: t("misc.chat.nBlocks", { count: action.blocks.length }) });
    return resource;
  }

  async function saveFromDialog(form) {
    if (!saving) return;
    try {
      const outcome = await saveResourceFlow({ resource: saving.resource, form, fallbackSubjectId: selectedSubjectId, planChoices, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument });
      setAction(saving.id, { saved: { id: outcome.saved?.id, name: outcome.name, addedTo: outcome.addedTo, isActivity: outcome.isActivity } });
      setSaving(null);
    } catch (error) {
      setAction(saving.id, { error: String(error?.message || error) });
      setSaving(null);
    }
  }

  async function saveAgent(action) {
    const built = agentFromAction(action);
    setAction(action.id, { phase: "running" });
    try {
      const saved = await onSaveGeneratedQuizDocument({ folderIds: [], tags: ["ai-agent"], file: { name: built.fileName, content: built.content, sizeBytes: built.content.length } }, selectedSubjectId);
      setAction(action.id, { phase: "done", savedAgentId: saved?.id || "" });
    } catch (error) {
      setAction(action.id, { phase: "error", error: String(error?.message || error) });
    }
  }

  /* ───────────────────────────────────────────── render */

  const filteredDocs = documents.filter((document) => !refQuery.trim() || document.name.toLowerCase().includes(refQuery.toLowerCase()));
  const balance = typeof window !== "undefined" ? readCredits().balance : 0;

  return (
    <section
      className="tw-scope relative flex min-h-[calc(100vh-150px)] flex-col"
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOver(false); }}
      onDrop={(event) => { event.preventDefault(); setDragOver(false); takeFiles(event.dataTransfer?.files); }}
    >
      <style>{MARKDOWN_CSS}{CITE_CSS}</style>

      {dragOver ? <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)]/70"><p className="m-0 text-lg font-bold text-[var(--accent-ink)]">{t("misc.chat.drop")}</p></div> : null}

      {/* Scope bar */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <div className="flex items-center gap-1 rounded-full bg-[var(--surface-soft)] p-1">
          <button type="button" onClick={() => { setFocus(false); setPopover(null); }} className={`rounded-full px-3 py-1 text-xs font-semibold ${!focus ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.1)]" : "text-soft-ink"}`}>{t("misc.chat.wholeWorkspace")}</button>
          <button type="button" onClick={() => { setFocus(true); setPopover("scope"); }} className={`rounded-full px-3 py-1 text-xs font-semibold ${focus ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.1)]" : "text-soft-ink"}`}>{t("misc.chat.focusOn")}</button>
        </div>
        {focus ? <button type="button" className={ghostBtn} onClick={() => setPopover(popover === "scope" ? null : "scope")}>📁 {scopeLabel} ▾</button> : <span className="text-xs text-soft-ink">{t("misc.chat.readsAll", { name: workspace?.name || t("misc.chat.yourWorkspace") })}</span>}
        <span className="flex-1" />
        <span className="text-[11px] text-soft-ink">{t("misc.chat.modelBalance", { n: fmt(balance, t.locale) })}</span>
        <button type="button" className={ghostBtn} onClick={newChat}>{t("misc.askLuna.newChat")}</button>
      </div>
      {popover === "scope" ? (
        <div className={`${cardBox} mb-3 max-w-md`}>
          <p className="m-0 mb-2 text-xs font-semibold text-soft-ink">{t("misc.chat.scopeHelp")}</p>
          <FolderPicker folders={allFolders} selectedId={scopeNode || subjectNode(selectedSubjectId || "")} onSelect={(id) => { setScopeNode(id); setFocus(true); }} maxHeight={200} hideUnfiled />
          <div className="mt-2 flex justify-end"><button type="button" className={primaryBtn} onClick={() => setPopover(null)}>{t("common.done")}</button></div>
        </div>
      ) : null}

      {/* Thread */}
      <div ref={threadRef} onClick={jumpToCitation} className="flex-1 overflow-y-auto rounded-3xl bg-white px-4 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] sm:px-8" style={{ maxHeight: "calc(100vh - 330px)", minHeight: 320 }}>
        {!messages.length ? (
          <div className="mx-auto grid max-w-2xl gap-4 py-8 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-xl text-[var(--accent-ink)]">✦</div>
            <h3 className="m-0 text-2xl font-bold tracking-tight text-ink">{t("misc.chat.howHelp")}</h3>
            <p className="m-0 text-sm text-soft-ink">{t("misc.chat.intro")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => send(t(suggestion))} className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-left text-sm text-ink transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">{t(suggestion)}</button>)}
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-3xl gap-6">
            {messages.map((message) => (
              <div key={message.id} data-message={message.id} className={message.role === "user" ? "flex justify-end" : "flex gap-3"}>
                {message.role === "assistant" ? <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">L</div> : null}
                <div className={message.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent-soft)] px-4 py-2.5 text-sm text-ink" : "min-w-0 flex-1"}>
                  {message.role === "user" ? (
                    <>
                      <p className="m-0 whitespace-pre-wrap">{message.text}</p>
                      {message.refs?.length ? <p className="m-0 mt-1 text-[11px] text-soft-ink">📎 {message.refs.join(" · ")}</p> : null}
                    </>
                  ) : (
                    <>
                      {message.status ? <p className="m-0 text-sm text-soft-ink"><span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-[var(--accent)]" />{message.status}</p> : null}
                      {message.text ? <div className="md !text-[15px]" dangerouslySetInnerHTML={{ __html: renderAssistant(message.text) }} /> : null}
                      {message.error ? <p className="m-0 mt-2 rounded-xl bg-[rgba(255,59,48,0.08)] px-3 py-2 text-sm text-[var(--color-danger)]">{message.error}</p> : null}
                      {message.confirm ? (
                        <div className={`${cardBox} mt-2`}>
                          <p className="m-0 text-sm font-semibold text-ink">{t("misc.chat.bigRequest")}</p>
                          <p className="m-0 mt-1 text-xs text-soft-ink">{t("misc.askLuna.wouldUse")} <strong className="text-ink">{t("misc.askLuna.lunas", { n: fmt(message.confirm.tokens, t.locale) })}</strong> {t("misc.chat.bigTail", { cost: message.confirm.costUsd?.toFixed?.(2) ?? "0.00", model: message.confirm.model === "gpt-4o" ? "Luna 3 Pro" : message.confirm.model })}</p>
                          <div className="mt-3 flex gap-2"><button type="button" className={primaryBtn} onClick={() => confirmRun(message)}>{t("misc.runIt")}</button><button type="button" className={ghostBtn} onClick={() => cancelRun(message)}>{t("common.cancel")}</button></div>
                        </div>
                      ) : null}
                      <SourceList messageId={message.id} sources={message.sources} /><GroundingNote grounding={message.grounding} />
                      {(message.actions || []).map((action) => (
                        <ActionCard key={action.id} action={action} state={actions[action.id] || {}} subject={subject} onRun={() => runAgent(action)} onPreview={() => setReading({ resource: actions[action.id]?.resource || openDocumentCard(action), document: null })} onSave={() => setSaving({ id: action.id, resource: actions[action.id]?.resource || openDocumentCard(action) })} onSaveAgent={() => saveAgent(action)} onUpdate={() => startUpdate(action)} onOpenPage={onOpenPage} />
                      ))}
                      {message.usage ? <p className="m-0 mt-2 text-[10px] text-soft-ink">{t("misc.askLuna.used", { n: fmt(message.usage.totalTokens, t.locale) })}</p> : null}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="mt-3">
        {referenced.length || uploading.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {referenced.map((entry) => <span key={entry.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent-ink)]">📎 <span className="max-w-[200px] truncate">{entry.name}</span><button type="button" aria-label={t("misc.chat.removeRef", { name: entry.name })} className="text-[var(--accent-ink)]/70 hover:text-[var(--accent-ink)]" onClick={() => setReferenced((current) => current.filter((item) => item.id !== entry.id))}>×</button></span>)}
            {uploading.map((entry) => <span key={entry.key} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-xs text-soft-ink"><span className="inline-block size-2 animate-pulse rounded-full bg-[var(--accent)]" />{t("misc.chat.reading", { name: entry.name })}</span>)}
          </div>
        ) : null}
        {popover === "refs" ? (
          <div className={`${cardBox} mb-2 max-w-lg`}>
            <input className="mb-2 w-full rounded-xl border border-ink/12 px-3 py-1.5 text-sm" placeholder={t("misc.chat.searchDocs")} value={refQuery} onChange={(event) => setRefQuery(event.target.value)} autoFocus />
            <div className="grid max-h-52 gap-0.5 overflow-y-auto">
              {filteredDocs.slice(0, 80).map((document) => (
                <label key={document.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[var(--surface-soft)]">
                  <input type="checkbox" checked={referenced.some((entry) => entry.id === document.id)} onChange={() => toggleRef(document)} />
                  <span className="min-w-0 flex-1 truncate">{document.name}</span>
                  <span className="shrink-0 text-[10px] text-soft-ink">{document.generated ? t("misc.chat.resourcePrefix") : ""}{document.subject}</span>
                </label>
              ))}
              {!filteredDocs.length ? <p className="m-0 px-2 py-1 text-xs text-soft-ink">{t("misc.chat.noMatch")}</p> : null}
            </div>
          </div>
        ) : null}
        <div className="flex items-end gap-2 rounded-3xl border border-ink/12 bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.06)] focus-within:border-[var(--accent)]">
          <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.heic" onChange={(event) => { takeFiles(event.target.files); event.target.value = ""; }} />
          <button type="button" title={t("misc.chat.attach")} aria-label={t("misc.chat.attach")} onClick={() => fileRef.current?.click()} className="grid size-9 shrink-0 place-items-center rounded-full text-lg text-soft-ink transition hover:bg-[var(--surface-soft)]">＋</button>
          <button type="button" title={t("misc.chat.refTitle")} aria-label={t("misc.chat.refAria")} onClick={() => setPopover(popover === "refs" ? null : "refs")} className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold transition hover:bg-[var(--surface-soft)] ${popover === "refs" ? "text-[var(--accent)]" : "text-soft-ink"}`}>@</button>
          <textarea
            value={input}
            rows={1}
            placeholder={t("misc.chat.placeholder")}
            onChange={(event) => { setInput(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(160, event.target.scrollHeight)}px`; }}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(input); } }}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-ink outline-none"
          />
          {busy ? <button type="button" onClick={() => abortRef.current?.abort()} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white" aria-label={t("misc.stop")}>■</button> : <button type="button" disabled={!input.trim()} onClick={() => send(input)} className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white transition disabled:opacity-40" aria-label={t("common.send")}>↑</button>}
        </div>
        <p className="m-0 mt-1.5 text-center text-[10px] text-soft-ink">{t("misc.chat.disclaimer")}</p>
      </div>

      {updating ? (
        <UpdateDialog
          document={updating.document}
          resource={updating.resource}
          workspace={workspace}
          fallbackSubjectId={selectedSubjectId}
          onClose={() => setUpdating(null)}
          onSaveGeneratedQuizDocument={onSaveGeneratedQuizDocument}
          onUpdateGeneratedDocument={onUpdateGeneratedDocument}
          onReplaceUnsaved={(resource) => setAction(updating.actionId, { resource })}
          onDone={(message) => setAction(updating.actionId, { summary: message })}
        />
      ) : null}
      {reading ? <ReaderView resource={reading.resource} notice={t("misc.chat.previewNotice")} onClose={() => setReading(null)} /> : null}
      {saving ? (
        <SaveResourceDialog
          defaultName={saving.resource.name}
          folders={allFolders}
          hideUnfiled
          defaultFolderId={allFolders.find((folder) => folder.subjectId === selectedSubjectId && folder.name === LOOSE_FOLDER)?.id || subjectNode(selectedSubjectId || "")}
          plans={planChoices.map((choice) => ({ id: choice.id, name: choice.name }))}
          canActivity={Boolean(saving.resource.activity?.questions?.length)}
          summary={`${saving.resource.activity?.questions?.length ? `${t("misc.chat.nQuestions", { count: saving.resource.activity.questions.length })} · ` : ""}${t("misc.chat.madeBy")}`}
          onCancel={() => setSaving(null)}
          onSave={saveFromDialog}
          onCreateFolder={typeof onCreateFolder === "function" ? async (name, parentNode) => {
            const parent = parseNode(parentNode || subjectNode(selectedSubjectId || ""));
            const target = parent.subjectId || selectedSubjectId;
            const created = await onCreateFolder(name, parent.folderId, target);
            return created?.id ? { id: `f:${target}:${created.id}` } : null;
          } : undefined}
        />
      ) : null}
    </section>
  );
}

/* ─────────────────────────────────────────────── the cards the assistant proposes */

function ActionCard({ action, state, subject, onRun, onPreview, onSave, onSaveAgent, onUpdate, onOpenPage }) {
  const t = useT();
  if (action.type === "run_agent") {
    return (
      <div className={`${cardBox} mt-3`}>
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink">{t("misc.chat.runAgent")}</p>
        <p className="m-0 mt-1 text-base font-bold text-ink">{action.title}</p>
        <p className="m-0 text-xs text-soft-ink">{t("misc.chat.with")} <strong className="text-ink">{action.agentName}</strong>{action.sourceNames?.length ? ` ${t("misc.chat.from", { names: action.sourceNames.join(", ") })}` : ""}</p>
        {Object.keys(action.options || {}).length ? <p className="m-0 mt-1 text-xs text-soft-ink">{Object.entries(action.options).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`).join(" · ")}</p> : null}
        {action.why ? <p className="m-0 mt-1 text-xs text-soft-ink">{action.why}</p> : null}
        {!state.phase || state.phase === "error" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={primaryBtn} onClick={onRun}>{t("misc.chat.yesRun")}</button>
            <span className="text-[11px] text-soft-ink">{t("misc.chat.costRange")}</span>
            {state.error ? <span className="basis-full text-xs text-[var(--color-danger)]">{state.error}</span> : null}
          </div>
        ) : null}
        {state.phase === "running" ? <p className="m-0 mt-3 text-sm text-soft-ink"><span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-[var(--accent)]" />{t("misc.chat.running")}</p> : null}
        {state.phase === "done" ? <ResultRow state={state} onPreview={onPreview} onSave={onSave} onUpdate={onUpdate} onOpenPage={onOpenPage} /> : null}
      </div>
    );
  }
  if (action.type === "document") {
    return (
      <div className={`${cardBox} mt-3`}>
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink">{t("misc.chat.document")}</p>
        <p className="m-0 mt-1 text-base font-bold text-ink">{action.title}</p>
        <p className="m-0 text-xs text-soft-ink">{t("misc.chat.blocksLaid", { count: action.blocks.length })}</p>
        <ResultRow state={{ phase: "done", ...state }} onPreview={onPreview} onSave={onSave} onUpdate={onUpdate} onOpenPage={onOpenPage} />
      </div>
    );
  }
  if (action.type === "new_agent") {
    return (
      <div className={`${cardBox} mt-3`}>
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink">{t("misc.chat.newAgent")}</p>
        <p className="m-0 mt-1 text-base font-bold text-ink">{action.name}</p>
        <p className="m-0 text-xs text-soft-ink">{action.purpose}</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--accent-ink)]">{t("misc.chat.itsPrompt")}</summary>
          <pre className="m-0 mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-soft)] p-3 text-xs leading-relaxed text-ink">{action.instructions}</pre>
        </details>
        {action.inputs?.length ? <p className="m-0 mt-2 text-xs text-soft-ink">{t("misc.chat.whoeverChooses", { names: action.inputs.map((input) => input.name).join(" · ") })}</p> : null}
        <p className="m-0 mt-1 text-xs text-soft-ink">{t("misc.chat.canWrite", { names: action.outputBlocks.map((block) => block.replace(/_/g, " ")).join(" · ") })}</p>
        {state.phase === "done" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[#1f7a3a]">{t("misc.chat.savedTools")}</span>
            {state.savedAgentId ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.(`agent-edit:${state.savedAgentId}`)}>{t("misc.chat.editIt")}</button> : null}
            {state.savedAgentId ? <button type="button" className={primaryBtn} onClick={() => onOpenPage?.(`custom-agent:${state.savedAgentId}`)}>{t("misc.runIt")}</button> : null}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className={primaryBtn} disabled={state.phase === "running"} onClick={onSaveAgent}>{state.phase === "running" ? t("misc.acct.saving") : t("misc.chat.saveAgent")}</button>
            <span className="text-[11px] text-soft-ink">{t("misc.chat.editAnytime")}{subject ? "" : ` ${t("misc.chat.chooseSubject")}`}</span>
            {state.error ? <span className="text-xs text-[var(--color-danger)]">{state.error}</span> : null}
          </div>
        )}
      </div>
    );
  }
  return null;
}

function ResultRow({ state, onPreview, onSave, onUpdate, onOpenPage }) {
  const t = useT();
  return (
    <div className="mt-3 grid gap-2">
      {state.summary ? <p className="m-0 text-xs text-soft-ink">{t("misc.chat.ready", { summary: state.summary })}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ghostBtn} onClick={onPreview}>{t("misc.chat.preview")}</button>
        {onUpdate && state.resource && canUpdateResource(state.resource) ? <button type="button" className={ghostBtn} onClick={onUpdate}>{t("misc.chat.update")}</button> : null}
        {state.saved ? (
          <>
            <span className="text-xs font-semibold text-[#1f7a3a]">{t("misc.chat.savedName", { name: state.saved.name })}{state.saved.isActivity ? ` ${t("misc.chat.inPractice")}` : ""}{state.saved.addedTo ? ` ${t("misc.chat.addedTo", { name: state.saved.addedTo })}` : ""}</span>
            {state.saved.id ? <button type="button" className={primaryBtn} onClick={() => onOpenPage?.(`workspaces?doc=${state.saved.id}`)}>{t("common.open")}</button> : null}
          </>
        ) : <button type="button" className={primaryBtn} onClick={onSave}>{t("misc.chat.saveWs")}</button>}
      </div>
      {state.error ? <p className="m-0 text-xs text-[var(--color-danger)]">{state.error}</p> : null}
    </div>
  );
}
