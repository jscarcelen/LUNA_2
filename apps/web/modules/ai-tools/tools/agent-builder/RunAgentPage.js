"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentGenerationStream } from "./useAgentGenerationStream";
import { GenerationProgress } from "./GenerationProgress";
import { OutputDownloads, OutputPreviewPane, OutputStylePanel, renderOutputHtml } from "../../../template-studio/output/OutputDesigner";
import { blocksToActivityItems, buildAutoDocument, buildOutputDocument, itemsToBlocks, planOutput, stylesFromSelectedBlocks } from "../../../template-studio/output/outputDocument";
import { resolveOutputLanguage } from "../../../template-studio/output/labels";
import { renderPlainOutputText } from "./previewHtml";
import { runConfigFromSpec } from "../../../agent-studio/engine/migrate";
import { RunEstimateLine, useRunEstimate } from "../../../credits/RunEstimate";
import { chargeRun, readCredits } from "../../../credits/credits";
import { attachSources, buildActivity } from "../../../activities/engine/activity";
import { renderActivityHtml } from "../../../activities/engine/html";
import { ActivityPlayer } from "../../../activities/ActivityPlayer";
import { SaveResourceDialog } from "../../../resources/SaveResourceDialog";
import { buildResource, parseResource, trimSources } from "../../../resources/resource";
import { activityLook } from "../../../resources/look";
import { FolderPicker } from "../../../ui/FolderTree";
import { ReaderView } from "../../../reader/ReaderView";
import { InteractiveView } from "../../../reader/InteractiveView";
import { newItem, parsePlan } from "../../../plans/plan";
import { AgentBrief } from "./AgentBrief";
import { oneLiner } from "./briefParser";
import { folderNode, foldersOf, parseNode, subjectNode } from "../../../workspace/ui/folderModel";
import { composeRefinementPrompt, describeResult } from "../../pipeline/iterateContext";
import { LOOSE_FOLDER } from "../../../plans/folders";
import { WorkspaceDocumentPicker } from "./WorkspaceDocumentPicker";
import { MASTER_TAG } from "../../pipeline/masterDocument";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const TEMPLATE_BUILDER_STORAGE_KEY = "luna-template-builder-drafts";
const OUTPUT_STYLES_KEY = "luna.outputStyles.v1";

function toggleInList(value, setter) {
  setter((previous) => (
    previous.includes(value)
      ? previous.filter((item) => item !== value)
      : [...previous, value]
  ));
}

function defaultAnswerForQuestion(question) {
  if (question.defaultValue !== undefined && question.defaultValue !== null) return question.type === "number" ? String(question.defaultValue) : question.defaultValue;
  if (question.type === "multi-select") return [];
  return "";
}

function readTemplatesFromStorage() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATE_BUILDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTemplatesToStorage(templates = []) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEMPLATE_BUILDER_STORAGE_KEY, JSON.stringify(Array.isArray(templates) ? templates : []));
  } catch {
    // Ignore localStorage limits and keep in-memory state only.
  }
}

function readStoredStyles(key) {
  if (typeof window === "undefined" || !key) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${OUTPUT_STYLES_KEY}:${key}`) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Format and colour per component. Newest source wins: styles saved with the agent, then the ones
 * remembered on this device, then the ones an older version stored on the agent's selected blocks
 * (converted to Template Studio's formats and colours).
 */
function initialOutputStyles(agent, key) {
  const legacy = stylesFromSelectedBlocks(agent?.output?.selectedBlocks || agent?.spec?.output?.selectedBlocks);
  const saved = agent?.outputStyles && typeof agent.outputStyles === "object" ? agent.outputStyles : readStoredStyles(key);
  return { ...legacy, ...(saved || {}) };
}

/** Plain-text reading of typed blocks, for the Raw tab and the saved document's preview. */
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


const cardClass = "rounded-[18px] border border-ink/8 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const fieldClass = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-soft-ink/70 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";
const chipClass = "inline-flex items-center rounded-full bg-[var(--surface-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0077ed] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";

const FLOW_STEPS = [
  { id: 1, title: "Configure questions", text: "Material and a few choices" },
  { id: 2, title: "Configure output", text: "Components, formats and colors" },
  { id: 3, title: "Export", text: "Download, save or share" }
];

function Stepper({ current, onSelect, unlocked }) {
  return (
    <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-3">
      {FLOW_STEPS.map((step) => {
        const state = step.id === current ? "current" : step.id < current || unlocked >= step.id ? "done" : "locked";
        return (
          <li key={step.id}>
            <button
              type="button"
              disabled={state === "locked"}
              onClick={() => onSelect(step.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${state === "current" ? "border-[var(--accent)] bg-[var(--accent-soft)]" : state === "done" ? "border-ink/10 bg-white hover:bg-[var(--surface-soft)]" : "border-ink/8 bg-white opacity-50"}`}
            >
              <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${state === "current" ? "bg-[var(--accent)] text-white" : state === "done" ? "bg-teal/20 text-accent" : "bg-[var(--surface-soft)] text-soft-ink"}`}>{state === "done" && step.id < current ? "✓" : step.id}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">{step.title}</span>
                <span className="block text-xs text-soft-ink">{step.text}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function SegmentedControl({ value, options, onChange }) {
  return (
    <div className="grid gap-1 rounded-xl bg-[var(--surface-soft)] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${value === option.value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink hover:text-ink"}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function HowItWorks({ agent, open, onToggle }) {
  const steps = Array.isArray(agent.howItWorks) && agent.howItWorks.length ? agent.howItWorks : [
    { title: "Choose your material", text: "Pick the documents the agent should learn from." },
    { title: "Answer a few questions", text: "The agent asks only what it needs to tailor the result." },
    { title: "Pick formats and colors", text: "Style each component with Template Studio's formats and colors, or apply a saved template." },
    { title: "Export or save", text: "PDF, Word, HTML — or straight into your workspace." }
  ];
  return (
    <section className={cardClass}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <span className="text-sm font-bold text-ink">How it works</span>
        <span className={`text-soft-ink transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {open ? (
        <ol className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-2xl bg-[var(--surface-soft)] p-4">
              <span className="grid size-8 place-items-center rounded-full bg-white text-sm font-bold text-[var(--accent-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">{index + 1}</span>
              <p className="m-0 mt-3 text-sm font-bold text-ink">{step.title}</p>
              <p className="m-0 mt-1 text-xs leading-relaxed text-soft-ink">{step.text}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function DocumentPicker({ documents, selectedIds, onChange, emptyText }) {
  const [search, setSearch] = useState("");
  const visible = documents.filter((document) => !search.trim() || String(document.name || "").toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="grid gap-2">
      {documents.length > 4 ? <input className={fieldClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" /> : null}
      <div className="grid max-h-60 gap-1 overflow-auto pr-1">
        {visible.map((document) => {
          const selected = selectedIds.includes(document.id);
          return (
            <label key={document.id} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${selected ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-ink" : "border-ink/10 bg-white text-ink hover:bg-[var(--surface-soft)]"}`}>
              <input className="sr-only" type="checkbox" checked={selected} onChange={() => toggleInList(document.id, onChange)} />
              <span className={`grid size-4 shrink-0 place-items-center rounded-md text-[10px] ring-1 ring-inset ${selected ? "bg-[var(--accent)] text-white ring-[var(--accent)]" : "ring-ink/30"}`}>{selected ? "✓" : ""}</span>
              <span className="truncate">{document.name}</span>
            </label>
          );
        })}
        {!visible.length ? <p className="m-0 py-3 text-center text-xs text-soft-ink">{emptyText}</p> : null}
      </div>
      {documents.length ? (
        <div className="flex gap-3 text-xs">
          <button type="button" className="font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => onChange(() => documents.map((document) => document.id))}>Select all</button>
          <button type="button" className="font-semibold text-soft-ink hover:underline" onClick={() => onChange(() => [])}>Clear</button>
        </div>
      ) : null}
    </div>
  );
}

/** Legacy run-config fields → the FieldDef tree the activity engine expects (items[] + once fields). */
function legacyToFieldDefs(fields = []) {
  const perItem = fields.filter((field) => field.repeatScope !== "once").map((field) => ({ id: `lf_${field.name}`, name: field.name, type: field.type === "array" ? "array" : field.type === "number" ? "number" : "text", children: field.type === "array" ? [{ id: `lf_${field.name}_item`, name: field.name, type: "text" }] : undefined }));
  const once = fields.filter((field) => field.repeatScope === "once").map((field) => ({ id: `lf_${field.name}`, name: field.name, type: field.type === "number" ? "number" : "text" }));
  return [...once, { id: "lf_items", name: "items", type: "array", children: [{ id: "lf_items_item", name: "item", type: "object", children: perItem }] }];
}

/**
 * Shared 3-step agent flow (Configure questions → Configure output → Export).
 * Renders a saved agent (`agentDocumentId`) or a built-in one (`builtinAgent`, e.g. the Quiz
 * Generator). Every agent in LUNA goes through this component so the experience is identical.
 */
export function RunAgentPage({ toolContext, agentDocumentId = "", builtinAgent = null }) {
  const workspaces = toolContext?.workspaces || [];
  const workspaceId = toolContext?.selectedWorkspaceId || workspaces[0]?.id || "";
  const subjectId = toolContext?.selectedSubjectId || "";
  const onSaveGeneratedQuizDocument = toolContext?.onSaveGeneratedQuizDocument;
  const onUpdateGeneratedDocument = toolContext?.onUpdateGeneratedDocument;
  const onListDocumentBlockTemplates = toolContext?.onListDocumentBlockTemplates;
  const onOpenTool = toolContext?.onOpenTool;

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) || null;
  const selectedSubject = selectedWorkspace?.subjects?.find((subject) => subject.id === subjectId) || null;
  const agentDocument = (selectedSubject?.documents || []).find((document) => document.id === agentDocumentId) || null;
  const folders = selectedSubject?.folders || [];
  // Where a result can be filed: the whole workspace tree (subjects are its top-level folders), not just the open subject.
  const filingFolders = useMemo(() => foldersOf(selectedWorkspace), [selectedWorkspace]);
  /** Study plans anywhere in the workspace: a saved result can be added to one of them. */
  const planChoices = useMemo(() => (selectedWorkspace?.subjects || []).flatMap((subject) => (subject.documents || []).map((document) => ({ document, plan: parsePlan(document), subjectId: subject.id })).filter((row) => row.plan).map((row) => ({ id: row.document.id, name: row.plan.name, subjectId: row.subjectId, document: row.document, plan: row.plan }))), [selectedWorkspace]);

  const [agentConfig, setAgentConfig] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [flowStep, setFlowStep] = useState(1);
  const [howOpen, setHowOpen] = useState(true);

  const [knowledgeMode, setKnowledgeMode] = useState("workspace");
  const [referenceDocumentIds, setReferenceDocumentIds] = useState([]);
  const [styleDocumentIds, setStyleDocumentIds] = useState([]);
  const [showStyleDocs, setShowStyleDocs] = useState(false);
  const [contextPromptDraft, setContextPromptDraft] = useState("");

  const [answersByQuestionId, setAnswersByQuestionId] = useState({});

  const [templates, setTemplates] = useState([]);
  /** Format + colour per Template Studio component: { [componentKey]: { blockId, accentId, toggles } }. */
  const [outputStyles, setOutputStyles] = useState({});
  const [autoAccentId, setAutoAccentId] = useState("blue");
  const [selection, setSelection] = useState({ layoutIndex: 0, viewIndex: 0 });

  const [output, setOutput] = useState(null);
  /** "Iterate": the twist the user is typing, and the earlier versions of this result (newest last). */
  const [iterateText, setIterateText] = useState("");
  const [versions, setVersions] = useState([]);
  const [improving, setImproving] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [understood, setUnderstood] = useState("");
  const [playing, setPlaying] = useState(null); // { activity, documentId }
  const [saveOpen, setSaveOpen] = useState(false);
  const [replanSuggestion, setReplanSuggestion] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  /** A node of the workspace tree ("s:<subject>" or "f:<subject>:<folder>"); empty means the open subject. */
  const [saveFolderId, setSaveFolderId] = useState("");
  const filingTarget = (node) => {
    const target = parseNode(node || subjectNode(subjectId));
    return { subjectId: target.subjectId || subjectId, folderIds: target.folderId ? [target.folderId] : [] };
  };

  const generation = useAgentGenerationStream();

  // Regenerate: a saved resource carries the request that produced it (answers, material, template, mapping).
  const resumeDocument = toolContext?.resumeResourceDocumentId ? (toolContext?.workspaces || []).flatMap((w) => w.subjects || []).flatMap((s) => s.documents || []).find((d) => d.id === toolContext.resumeResourceDocumentId) : null;
  const resume = resumeDocument ? parseResource(resumeDocument) : null;
  const resumedRef = useRef("");

  const stylesStorageKey = String(builtinAgent?.id || agentDocumentId || "");
  const updateOutputStyles = useCallback((next) => {
    setOutputStyles(next);
    try {
      if (stylesStorageKey) window.localStorage.setItem(`${OUTPUT_STYLES_KEY}:${stylesStorageKey}`, JSON.stringify(next));
    } catch {
      // Remembering the look on this device is a convenience only.
    }
  }, [stylesStorageKey]);

  useEffect(() => {
    let parsed = null;
    if (builtinAgent) parsed = builtinAgent;
    else if (agentDocument) {
      try {
        parsed = JSON.parse(String(agentDocument.content || "{}"));
      } catch {
        setLoadError("This saved agent could not be read.");
        return;
      }
    }
    if (!parsed) return;
    // Agents installed from the marketplace follow the creator's latest published version.
    if (parsed.installedFrom?.listingId) {
      try {
        const listing = (JSON.parse(window.localStorage.getItem("luna.agentMarketplaceListings.v1") || "[]")).find((item) => item.id === parsed.installedFrom.listingId);
        if (listing?.agent) parsed = { ...listing.agent, name: parsed.name || listing.agent.name, installedFrom: parsed.installedFrom, outputStyles: parsed.outputStyles || listing.agent.outputStyles };
      } catch {
        // keep the installed snapshot
      }
    }
    // Recipe-based agents are recompiled from their spec so runtime improvements apply to agents saved earlier.
    if (parsed.spec && typeof parsed.spec === "object" && Array.isArray(parsed.spec.outputSchema)) {
      try {
        const { spec, ...rest } = parsed;
        const fresh = runConfigFromSpec(spec);
        parsed = { ...rest, ...fresh, scope: { ...fresh.scope, ...(rest.scope || {}) }, installedFrom: rest.installedFrom, outputStyles: rest.outputStyles, savedOutput: rest.savedOutput };
      } catch {
        // keep the stored compiled config
      }
    }
    setAgentConfig(parsed);
    setOutputStyles(initialOutputStyles(parsed, stylesStorageKey));
    setReferenceDocumentIds(Array.isArray(parsed.scope?.documentIds) ? parsed.scope.documentIds : []);
    setStyleDocumentIds(Array.isArray(parsed.scope?.styleDocumentIds) ? parsed.scope.styleDocumentIds : []);
    setContextPromptDraft(String(parsed.contextPrompt || ""));
    setKnowledgeMode(Array.isArray(parsed.scope?.documentIds) && parsed.scope.documentIds.length ? "workspace" : (parsed.contextPrompt ? "context" : "workspace"));
    const initialAnswers = {};
    for (const question of Array.isArray(parsed.questions) ? parsed.questions : []) {
      initialAnswers[question.id] = defaultAnswerForQuestion(question);
    }
    setAnswersByQuestionId(initialAnswers);
    if (Array.isArray(parsed.savedOutput?.items) && parsed.savedOutput.items.length) setOutput(parsed.savedOutput);
    try {
      if (window.localStorage.getItem("luna-agent-how-it-works") === "collapsed") setHowOpen(false);
    } catch {
      // ignore
    }
  }, [agentDocument, builtinAgent, stylesStorageKey]);

  // Template loading is decoupled from the handler's identity (AppShell recreates it on every
  // render) so an in-flight request is never cancelled; it re-runs when the output step opens.
  const listTemplatesRef = useRef(onListDocumentBlockTemplates);
  listTemplatesRef.current = onListDocumentBlockTemplates;
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const loadTemplates = useCallback(async () => {
    const cached = readTemplatesFromStorage();
    if (cached.length) setTemplates((current) => (current.length ? current : cached));
    const list = listTemplatesRef.current;
    if (typeof list !== "function") return;
    setTemplatesLoading(true);
    try {
      const result = await list();
      if (Array.isArray(result)) {
        setTemplates(result);
        writeTemplatesToStorage(result);
      }
    } catch {
      // keep cached list
    } finally {
      setTemplatesLoading(false);
    }
  }, []);
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);
  useEffect(() => {
    if (flowStep === 2) loadTemplates();
  }, [flowStep, loadTemplates]);

  const documents = useMemo(
    () => (selectedSubject?.documents || []).filter((document) => document.sourceType !== "generated"),
    [selectedSubject]
  );
  const approvedDocuments = useMemo(
    () => documents.filter((document) => String(document.reviewStatus || "approved") === "approved"),
    [documents]
  );

  /** The Summary Notes Consolidator reads documents from anywhere in the workspace, not only the open subject. */
  const consolidating = agentConfig?.spec?.pipeline === "consolidate";
  const workspaceDocuments = useMemo(() => (selectedWorkspace?.subjects || []).flatMap((subject) => subject.documents || []), [selectedWorkspace]);

  const fields = useMemo(() => (Array.isArray(agentConfig?.template?.fields) ? agentConfig.template.fields : []), [agentConfig]);
  const questions = Array.isArray(agentConfig?.questions) ? agentConfig.questions : [];
  const requiredUnanswered = questions.filter((question) => {
    if (!question.required) return false;
    const answer = answersByQuestionId[question.id];
    return Array.isArray(answer) ? answer.length === 0 : !String(answer || "").trim();
  }).length;

  /** Writes the agent document so its output look (and the choices made here) survive the session. */
  const persistAgent = useCallback(async (extra = {}) => {
    if (!agentDocument || typeof onUpdateGeneratedDocument !== "function") return;
    const nextConfig = { ...agentConfig, ...extra, outputStyles };
    const textContent = JSON.stringify(nextConfig, null, 2);
    try {
      await onUpdateGeneratedDocument(agentDocument.id, { file: { name: agentDocument.name, content: textContent, sizeBytes: textContent.length } });
      setAgentConfig(nextConfig);
    } catch {
      // Saving the look is a convenience; a failure must not interrupt the run.
    }
  }, [agentDocument, onUpdateGeneratedDocument, agentConfig, outputStyles]);

  function setAnswer(questionId, value) {
    setAnswersByQuestionId((previous) => ({ ...previous, [questionId]: value }));
  }

  function toggleHow() {
    setHowOpen((value) => {
      try {
        window.localStorage.setItem("luna-agent-how-it-works", value ? "collapsed" : "open");
      } catch {
        // ignore
      }
      return !value;
    });
  }

  function renderQuestionInput(question) {
    const answer = answersByQuestionId[question.id];
    const optionClass = (selected) => `flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${selected ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-ink" : "border-ink/10 bg-white text-ink hover:bg-[var(--surface-soft)]"}`;
    if (question.type === "number") {
      return (
        <div className="flex items-center gap-2">
          <button type="button" className={ghostBtn} onClick={() => setAnswer(question.id, String(Math.max(1, Number(answer || 0) - 1)))}>−</button>
          <input className={`${fieldClass} w-24 text-center`} type="number" min="1" value={answer || ""} onChange={(event) => setAnswer(question.id, event.target.value)} placeholder="10" />
          <button type="button" className={ghostBtn} onClick={() => setAnswer(question.id, String(Number(answer || 0) + 1))}>+</button>
        </div>
      );
    }
    if (question.type === "yes-no") {
      return <SegmentedControl value={answer || ""} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} onChange={(value) => setAnswer(question.id, value)} />;
    }
    if (question.type === "single-select" && !(question.options || []).length) {
      const languages = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Catalan", "Dutch", "Chinese", "Japanese", "Arabic"];
      return <select className={fieldClass} value={answer || ""} onChange={(event) => setAnswer(question.id, event.target.value)}>{languages.map((l) => <option key={l} value={l}>{l}</option>)}</select>;
    }
    if (question.type === "single-select") {
      return (
        <div className="flex flex-wrap gap-1.5">
          {(question.options || []).map((option) => (
            <label className={`${optionClass(answer === option)} rounded-full py-1.5`} key={option}>
              <input className="sr-only" type="radio" name={question.id} checked={answer === option} onChange={() => setAnswer(question.id, option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    }
    if (question.type === "multi-select") {
      const selected = Array.isArray(answer) ? answer : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {(question.options || []).map((option) => {
            const on = selected.includes(option);
            return (
              <label className={`${optionClass(on)} rounded-full py-1.5`} key={option}>
                <input className="sr-only" type="checkbox" checked={on} onChange={() => setAnswer(question.id, on ? selected.filter((item) => item !== option) : [...selected, option])} />
                <span className={`grid size-3.5 place-items-center rounded-[4px] text-[9px] ring-1 ring-inset ${on ? "bg-[var(--accent)] text-white ring-[var(--accent)]" : "ring-ink/30"}`}>{on ? "✓" : ""}</span>
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      );
    }
    return <input className={fieldClass} value={answer || ""} onChange={(event) => setAnswer(question.id, event.target.value)} placeholder="Type your answer" />;
  }

  const runConfig = useMemo(() => {
    if (!agentConfig) return null;
    return {
      name: agentConfig.name,
        instructions: agentConfig.instructions || "",
        knowledgeText: agentConfig.knowledgeText || "",
        contextPrompt: knowledgeMode === "context" ? contextPromptDraft : "",
        questionAnswers: questions.map((question) => ({ question: question.text, answer: answersByQuestionId[question.id] })),
        outputExample: agentConfig.outputExample || "",
        model: agentConfig.model,
        creativity: agentConfig.creativity,
        template: { fields },
        outputJsonSchema: agentConfig.outputJsonSchema || null,
        validationRules: agentConfig.validationRules || [],
        spec: agentConfig.spec || null,
        inputValues: answersByQuestionId,
        scope: {
          workspaceId,
          // Picked documents may belong to any subject, so the consolidator is not limited to the open one.
          subjectId: consolidating ? "" : subjectId,
          documentIds: [...(knowledgeMode === "workspace" ? referenceDocumentIds : []), ...((agentConfig.scope && agentConfig.scope.documentIds) || [])],
          styleDocumentIds
        }
    };
  }, [agentConfig, questions, answersByQuestionId, knowledgeMode, contextPromptDraft, fields, workspaceId, subjectId, referenceDocumentIds, styleDocumentIds, consolidating]);
  const { estimate: runEstimate, loading: estimating } = useRunEstimate(runConfig, Boolean(runConfig) && !generation.isGenerating);

  // Apply the saved request once the agent config is in place.
  useEffect(() => {
    if (!resume || !agentConfig || resumedRef.current === resumeDocument.id) return;
    resumedRef.current = resumeDocument.id;
    const request = resume.request || {};
    if (request.answersByQuestionId) setAnswersByQuestionId(request.answersByQuestionId);
    if (request.knowledgeMode) setKnowledgeMode(request.knowledgeMode);
    if (typeof request.contextPromptDraft === "string") setContextPromptDraft(request.contextPromptDraft);
    if (Array.isArray(request.referenceDocumentIds)) setReferenceDocumentIds(request.referenceDocumentIds);
    if (Array.isArray(request.styleDocumentIds)) setStyleDocumentIds(request.styleDocumentIds);
    if (request.outputStyles && typeof request.outputStyles === "object") setOutputStyles(request.outputStyles);
    // Re-styling only: the previous output is kept so the user can just pick another look and export.
    if (resume.data) setOutput({ ...resume.data, items: resume.data.items || [], data: resume.data });
    setFlowStep(2);
  }, [resume, agentConfig, resumeDocument]);

  async function handleGenerate() {
    if (!runConfig || generation.isGenerating) return;
    setStatusMessage("");
    setFlowStep(2);
    setSelection({ layoutIndex: 0, viewIndex: 0 });
    try {
      const data = await generation.generate(runConfig);
      chargeRun({ agentName: agentConfig.name, usage: data.usage, fallbackTokens: runEstimate?.totalTokens || 0, model: data.model });
      setOutput(data);
    } catch {
      // The hook exposes the error state to the preview pane.
    }
  }

  /** Rewrites the current result with an extra instruction ("focus more on cash flow"), keeping the old version to go back to. */
  async function handleIterate() {
    const prompt = iterateText.trim();
    if (!runConfig || !prompt || !output || generation.isGenerating) return;
    setStatusMessage("");
    const strip = (list) => (list || []).map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => !key.startsWith("_"))));
    const { items: _items, ...rootOnly } = output.data || {};
    const previousOutput = outputBlocks ? outputBlocks : { ...rootOnly, items: strip(output.items) };
    const described = describeResult({ blocks: outputBlocks, items: outputBlocks ? null : strip(output.items) });
    try {
      // The prompt improver first: a few words become a precise brief and a checklist, and the
      // original limits the request overrides ("one page") are named.
      setImproving(true);
      let refinementPrompt = prompt;
      setUnderstood("");
      try {
        const improved = await fetch("/api/ai-tools/agent-builder/iterate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: prompt,
            agentName: agentConfig.name,
            instructions: agentConfig.instructions,
            choices: runConfig.questionAnswers,
            outline: described.outline,
            fields: described.fieldNames,
            earlier: versions.map((version) => version.prompt)
          })
        }).then((response) => response.json());
        if (improved?.improved && improved.brief) {
          refinementPrompt = composeRefinementPrompt(prompt, improved);
          setUnderstood(improved.understood || "");
        }
      } catch {
        // Without the improver the user's own words are sent.
      } finally {
        setImproving(false);
      }
      const data = await generation.generate({ ...runConfig, creativity: runConfig.creativity === "low" ? "medium" : runConfig.creativity, refinementPrompt, previousOutput });
      chargeRun({ agentName: agentConfig.name, usage: data.usage, fallbackTokens: runEstimate?.totalTokens || 0, model: data.model });
      setVersions((list) => [...list, { output, prompt }]);
      setOutput(data);
      setIterateText("");
    } catch {
      // The hook exposes the error state to the preview pane; the current result stays.
    }
  }
  function handleUndoIterate() {
    const last = versions[versions.length - 1];
    if (!last) return;
    setOutput(last.output);
    setVersions((list) => list.slice(0, -1));
  }

  async function handleSavePreset() {
    if (!agentDocument || typeof onUpdateGeneratedDocument !== "function") return;
    setIsSavingPreset(true);
    setStatusMessage("");
    try {
      await persistAgent({ scope: { ...(agentConfig.scope || {}), documentIds: referenceDocumentIds, styleDocumentIds } });
      setStatusMessage("Saved as the default for next time.");
    } catch (error) {
      setStatusMessage(String(error.message || error));
    } finally {
      setIsSavingPreset(false);
    }
  }

  // Once-per-document values: runtime results carry them in `data`; outputs saved with an agent are flat.
  const rootData = useMemo(() => {
    if (!output || typeof output !== "object") return {};
    if (output.data && typeof output.data === "object") return output.data;
    const meta = new Set(["items", "model", "usage", "fallbackReason", "checks", "referenceDocumentCount", "referenceChunkCount"]);
    return Object.fromEntries(Object.entries(output).filter(([key]) => !meta.has(key)));
  }, [output]);

  /* ── The output, as Template Studio components ───────────────────────────────────────────
   * Block agents return typed blocks; quiz and flashcard agents return items that read as the same
   * blocks. Both are planned into runs of components and assembled by Template Studio, so the
   * preview, the page-size × view matrix and every export come from one place. Everything here
   * must stay above the early returns below (hook order).
   */
  const outputIsBlocks = Boolean(output?.isBlockOutput);
  const outputBlocks = outputIsBlocks && Array.isArray(output?.blocks) ? output.blocks : null;
  const rawText = useMemo(() => (outputBlocks ? blocksToText(outputBlocks) : renderPlainOutputText(Array.isArray(output?.items) ? output.items : [], fields, {})), [outputBlocks, output, fields]);
  /** Words the components print by themselves (Answer, True / False, Name…) follow the output's language. */
  const outputLanguage = useMemo(() => resolveOutputLanguage(agentConfig?.questions || [], answersByQuestionId, rawText), [agentConfig?.questions, answersByQuestionId, rawText]);
  const plan = useMemo(() => {
    if (!output) return null;
    const blocks = outputBlocks || (outputIsBlocks ? null : itemsToBlocks(output.items));
    if (!blocks) return null;
    return planOutput({
      blocks,
      // The header prints the title the AI wrote for this work; the agent's name only if it wrote none.
      title: String(rootData?.title || "").trim() || agentConfig?.name || "",
      subtitle: String(rootData?.subtitle || ""),
      framed: !outputBlocks,
      subject: selectedSubject?.name || "",
      agentName: agentConfig?.name || "",
      // Each answer cites the passage of the material it came from, and links to it.
      passages: Array.isArray(output.sources) ? output.sources : [],
      linkBase: typeof window !== "undefined" ? window.location.origin : "",
      language: outputLanguage
    });
  }, [output, outputBlocks, outputIsBlocks, agentConfig?.name, selectedSubject?.name, rootData, outputLanguage]);
  const doc = useMemo(() => {
    if (!output) return null;
    try {
      if (plan) return buildOutputDocument(plan, outputStyles, { language: outputLanguage });
      const items = outputIsBlocks ? [] : (Array.isArray(output.items) ? output.items : []);
      if (items.length) return buildAutoDocument({ fields, items, rootData, title: agentConfig?.name || "", accentId: autoAccentId });
    } catch (error) {
      console.error("[RunAgentPage] could not build the output document", error);
    }
    return null;
  }, [output, outputIsBlocks, plan, outputStyles, outputLanguage, autoAccentId, fields, rootData, agentConfig?.name]);
  useEffect(() => {
    if (doc && (selection.layoutIndex >= doc.layouts.length || selection.viewIndex >= doc.views.length)) setSelection({ layoutIndex: 0, viewIndex: 0 });
  }, [doc, selection.layoutIndex, selection.viewIndex]);

  /** Interactive activity derived from the output: questions the student can answer on Luna. */
  const activity = useMemo(() => {
    if (!output || typeof output !== "object") return null;
    const items = outputBlocks ? blocksToActivityItems(outputBlocks) : (Array.isArray(output.items) ? output.items : []);
    const schemaFields = outputBlocks
      ? legacyToFieldDefs(Object.keys(Object.assign({}, ...items)).map((name) => ({ name, type: items.some((item) => Array.isArray(item[name])) ? "array" : "text", repeatScope: "per-output" })))
      : (Array.isArray(agentConfig?.spec?.outputSchema) && agentConfig.spec.outputSchema.length ? agentConfig.spec.outputSchema : legacyToFieldDefs(fields));
    const data = { ...(output.data || {}), items };
    try {
      const built = buildActivity(schemaFields, data, { title: agentConfig?.name, agentId: agentDocument?.id || "", agentName: agentConfig?.name });
      // Link each question to the passage its answer came from.
      return attachSources(built, Array.isArray(output.sources) ? output.sources : []);
    } catch { return null; }
  }, [output, outputBlocks, agentConfig, fields, agentDocument?.id]);

  /** The current output as a resource, so the HTML view can show, restyle and play it before it is saved. */
  const readerResource = useMemo(() => {
    if (!output) return null;
    return buildResource({
      name: agentConfig?.name || "Generated document",
      activity: activity && activity.questions.length ? { ...activity, title: agentConfig?.name || activity.title } : null,
      data: { ...(output.data || {}), items: output.items || [], sources: trimSources(output.sources), ...(outputBlocks ? { isBlockOutput: true, blocks: outputBlocks } : {}) },
      request: { outputStyles },
      meta: { agentName: agentConfig?.name || "", subjectName: selectedSubject?.name || "" }
    });
  }, [output, activity, outputBlocks, outputStyles, agentConfig?.name, selectedSubject?.name]);

  async function renderFinalHtml(forPrint) {
    if (!doc) throw new Error("There is nothing to export yet.");
    return { html: await renderOutputHtml(doc, selection, forPrint), textContent: rawText };
  }

  function handleDownloadInteractive() {
    if (!activity) return;
    const html = renderActivityHtml(activity);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activity.title}.interactive.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function handleAttempt(attempt) {
    // 1. Persist to relational DB (non-blocking — runs in parallel with blob save)
    const learnerId = (typeof window !== "undefined" && window.localStorage.getItem("luna.learnerId")) ||
      toolContext?.profileName || "anonymous";
    const ownerUserId = toolContext?.ownerUserId || process?.env?.LUNA_DEMO_USER_ID || "";
    const activityDocumentId = playing?.documentId || "";

    if (learnerId && activityDocumentId) {
      fetch("/api/attempts/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attempt,
          learnerId,
          ownerUserId,
          activityDocumentId,
          subjectId: subjectId || null,
        }),
      }).catch(() => { /* attempt stays local on network error */ });
    }

    // 2. Check if study plan needs adjustment
    if (learnerId && workspaceId && toolContext?.planDocumentId) {
      fetch("/api/plans/replan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planDocumentId: toolContext.planDocumentId, learnerId, ownerUserId, workspaceId }),
      })
        .then((r) => r.json())
        .then((result) => {
          if (result?.shouldReplan && Array.isArray(result.suggestedItems) && result.suggestedItems.length > 0) {
            setReplanSuggestion(result);
          }
        })
        .catch(() => {});
    }

    // 3. Legacy JSON blob save (kept for backward compat)
    if (!onSaveGeneratedQuizDocument) return;
    try {
      const content = JSON.stringify({ kind: "activity-attempt", attempt, activityDocumentId, activityId: attempt.activityId, learner: toolContext?.profileName || "" }, null, 2);
      await onSaveGeneratedQuizDocument({ folderIds: [], tags: ["activity-attempt"], file: { name: `${attempt.activityTitle} · attempt.json`, content, preview: `${attempt.score}/${attempt.total}`, sizeBytes: content.length } });
    } catch { /* attempt stays local */ }
  }

  function currentRequest() {
    return {
      answersByQuestionId,
      knowledgeMode,
      contextPromptDraft,
      referenceDocumentIds,
      styleDocumentIds,
      outputStyles
    };
  }
  async function saveResource({ name, folderId, tags, difficulty, favourite, openAfter, addActivity, planId, dueDate }) {
    if (!onSaveGeneratedQuizDocument) return;
    setIsSavingDocument(true);
    try {
      const sourceNames = referenceDocumentIds.map((id) => (consolidating ? workspaceDocuments : documents).find((document) => document.id === id)?.name).filter(Boolean);
      const payload = buildResource({
        name,
        activity: activity && activity.questions.length ? { ...activity, title: name } : null,
        data: { ...(output?.data || {}), items: output?.items || [], sources: trimSources(output?.sources), ...(outputBlocks ? { isBlockOutput: true, blocks: outputBlocks } : {}) },
        request: currentRequest(),
        meta: {
          agentId: agentDocument?.id || "",
          agentName: agentConfig?.name || "",
          subjectName: selectedSubject?.name || "",
          templateId: "",
          templateName: "",
          sourceDocumentIds: referenceDocumentIds,
          sourceNames,
          difficulty,
          questionCount: activity?.questions.length || 0
        }
      });
      const content = JSON.stringify(payload, null, 2);
      const isActivity = Boolean(activity && activity.questions.length && addActivity);
      // A consolidation is a master document: tagged so later agents can read it instead of the originals.
      const allTags = ["resource", ...(output?.consolidation ? [MASTER_TAG] : []), ...(isActivity ? ["activity"] : []), ...(isActivity && dueDate ? [`due:${dueDate}`] : []), ...(favourite ? ["favourite"] : []), ...(difficulty ? [`difficulty:${difficulty}`] : []), ...tags];
      const where = filingTarget(folderId);
      const saved = await onSaveGeneratedQuizDocument({ folderIds: where.folderIds, tags: allTags, file: { name: `${name}.resource.json`, content, preview: `${payload.meta.questionCount || 0} questions`, sizeBytes: content.length } }, where.subjectId);
      // Into a study plan: one more step, pointing at the resource just saved.
      let addedTo = "";
      const chosenPlan = planId ? planChoices.find((choice) => choice.id === planId) : null;
      if (chosenPlan && saved?.id && typeof onUpdateGeneratedDocument === "function") {
        const step = { ...newItem({ resourceId: saved.id, title: name, kind: activity && activity.questions.length ? "activity" : "read", dueDate: dueDate || "", minutes: 30 }), note: "Added from a generated result." };
        const next = { ...chosenPlan.plan, items: [...(chosenPlan.plan.items || []), step], updatedAt: new Date().toISOString() };
        const planContent = JSON.stringify(next, null, 2);
        await onUpdateGeneratedDocument(chosenPlan.document.id, { file: { name: chosenPlan.document.name, content: planContent, preview: chosenPlan.document.preview, sizeBytes: planContent.length } }, chosenPlan.subjectId);
        addedTo = chosenPlan.name;
      }
      setSaveOpen(false);
      setStatusMessage(`Saved “${name}” to your workspace${isActivity ? " and to Activities" : ""}${addedTo ? ` and added to “${addedTo}”` : ""}.`);
      if (openAfter) {
        if (activity && activity.questions.length) setPlaying({ activity: payload.activity, documentId: saved?.id || "" });
        else setReaderOpen(true);
      }
    } catch (error) {
      setStatusMessage(String(error.message || error));
    } finally {
      setIsSavingDocument(false);
    }
  }

  async function handleDownloadHtml() {
    try {
      const { html } = await renderFinalHtml(true);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${agentConfig?.name || "output"}.html`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setStatusMessage(String(error.message || error));
    }
  }

  if (loadError) {
    return <p className="rounded-2xl border border-[var(--color-danger)]/30 bg-rose/10 p-4 text-sm text-[var(--color-danger)]">{loadError}</p>;
  }
  if (!agentConfig) {
    return (
      <div className="grid gap-3">
        {[0, 1, 2].map((index) => <div key={index} className="h-24 animate-shimmer rounded-[18px] bg-[linear-gradient(90deg,rgba(0,0,0,0.03),rgba(0,0,0,0.07),rgba(0,0,0,0.03))] bg-[length:200%_100%]" />)}
      </div>
    );
  }
  const outputItems = Array.isArray(output?.items) && !outputIsBlocks ? output.items : [];
  const hasOutput = outputIsBlocks ? (outputBlocks?.length > 0) : (outputItems.length > 0);
  const materialOptional = Array.isArray(agentConfig.materialSlots) && (!agentConfig.materialSlots.length || agentConfig.materialSlots.every((slot) => !slot.required));
  const knowledgeReady = materialOptional || (knowledgeMode === "workspace" ? referenceDocumentIds.length > 0 : contextPromptDraft.trim().length > 0);
  const canGenerate = !generation.isGenerating && requiredUnanswered === 0 && knowledgeReady;
  const unlockedStep = hasOutput ? 3 : 1;
  const modelLabel = String(agentConfig.model || "").includes("4.1") ? "Luna 3 Max" : "Luna 3 Pro";


  const iterateCard = hasOutput ? (
    <section className={cardClass}>
      <p className={kicker}>Iterate</p>
      <p className="m-0 mt-1 text-xs text-soft-ink">Not quite right? Say what to change and Luna rewrites the result from the same material — then you can still choose its format and colour.</p>
      <textarea
        className={`${fieldClass} mt-3`}
        rows={3}
        value={iterateText}
        disabled={generation.isGenerating || improving}
        onChange={(event) => setIterateText(event.target.value)}
        placeholder="e.g. Focus more on cash flow · make it shorter · explain it for a first-year student"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["Focus more on…", "Make it shorter", "Add more detail", "Simpler language", "Add examples", "Cover the formulas"].map((chip) => (
          <button key={chip} type="button" className="rounded-full border border-ink/15 px-2.5 py-1 text-[11px] font-semibold text-soft-ink transition hover:bg-[var(--surface-soft)]" onClick={() => setIterateText((current) => (current.trim() ? `${current.trim()}. ${chip}` : chip))}>{chip}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={primaryBtn} disabled={!iterateText.trim() || generation.isGenerating || improving} onClick={handleIterate}>{improving ? "Understanding your request…" : generation.isGenerating ? "Rewriting…" : "Apply to the result"}</button>
        {versions.length ? <button type="button" className={ghostBtn} disabled={generation.isGenerating} onClick={handleUndoIterate}>↶ Previous version ({versions.length})</button> : null}
      </div>
      {understood ? <p className="m-0 mt-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs text-ink"><strong>Luna understood:</strong> {understood}</p> : null}
      {versions.length ? <p className="m-0 mt-2 text-[11px] text-soft-ink">Applied: {versions.map((version) => `“${version.prompt}”`).join(" → ")}</p> : null}
    </section>
  ) : null;

  const previewPane = (
    <OutputPreviewPane
      doc={doc}
      selection={selection}
      onSelection={setSelection}
      filename={agentConfig.name || "output"}
      onError={setStatusMessage}
      interactive={readerResource ? <InteractiveView resource={readerResource} /> : null}
      emptyHint="Generate in step 1 and your result appears here, laid out with Template Studio's components."
      overlay={generation.isGenerating || generation.error ? (
        <GenerationProgress
          steps={generation.steps}
          tokenChars={generation.tokenChars}
          tokenTail={generation.tokenTail}
          elapsedMs={generation.elapsedMs}
          isGenerating={generation.isGenerating}
          error={generation.error}
          onCancel={generation.cancel}
        />
      ) : null}
    />
  );

  return (
    <section className="tw-scope grid gap-4">
      {/* Intro */}
      <header className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]">AI agent</span>
              <span className={chipClass}>{modelLabel}</span>
              {output?.model ? <span className={chipClass}>Last run: {output.model}</span> : null}
            </div>
            <h3 className="m-0 text-[26px] font-bold tracking-tight text-ink">{agentConfig.name || "Untitled Agent"}</h3>
            <p className="m-0 mt-1.5 text-sm leading-relaxed text-soft-ink">{oneLiner(agentConfig)}</p>
            <details className="mt-2 group">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--accent-ink)] hover:underline">Read more about this agent</summary>
              <div className="mt-3 max-w-3xl rounded-2xl border border-ink/8 bg-[var(--surface-soft)] p-4">
                {agentConfig.description && clean(agentConfig.description) !== oneLiner(agentConfig) ? <p className="m-0 mb-3 text-sm leading-relaxed text-ink">{agentConfig.description}</p> : null}
                <AgentBrief prompt={agentConfig.instructions} />
              </div>
            </details>
          </div>
          {resume ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/50 px-4 py-2.5">
          <p className="m-0 text-sm text-ink"><strong>Editing “{resume.name}”.</strong> Its material, choices, template and mapping are loaded. Change anything and <em>Generate again</em> — or just pick another template and save.</p>
          <button type="button" className={ghostBtn} onClick={() => toolContext?.onOpenPage?.("resources")}>Back to resources</button>
        </div>
      ) : null}
      {flowStep === 1 ? (
            <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
              <button type="button" onClick={handleGenerate} disabled={!canGenerate} className={primaryBtn}>{generation.isGenerating ? "Generating…" : hasOutput ? "Generate again" : "Generate"} <span aria-hidden>→</span></button>
              {!knowledgeReady || requiredUnanswered ? (
                <p className="m-0 text-center text-[11px] text-soft-ink sm:text-right">{!knowledgeReady ? "Choose material first" : `${requiredUnanswered} question${requiredUnanswered === 1 ? "" : "s"} left`}</p>
              ) : (
                <div className="text-center sm:text-right"><RunEstimateLine estimate={runEstimate} loading={estimating} balance={readCredits().balance} /></div>
              )}
            </div>
          ) : null}
        </div>
      </header>

      <HowItWorks agent={agentConfig} open={howOpen} onToggle={toggleHow} />

      <Stepper current={flowStep} onSelect={setFlowStep} unlocked={unlockedStep} />

      {/* Step 1: configure questions */}
      {flowStep === 1 ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid gap-3">
            <section className={cardClass}>
              <p className={kicker}>1 · Material</p>
              <h4 className="m-0 mt-1 text-base font-bold text-ink">{agentConfig.materialSlots?.[0]?.name || "What should the agent read?"}{agentConfig.materialSlots?.length && !agentConfig.materialSlots[0].required ? <span className={`${chipClass} ml-2`}>Optional</span> : null}</h4>
              {agentConfig.materialSlots?.[0]?.description ? <p className="m-0 mt-1 text-xs text-soft-ink">{agentConfig.materialSlots[0].description}</p> : null}
              <div className="mt-3 grid gap-3">
                {consolidating ? (
                  <WorkspaceDocumentPicker workspace={selectedWorkspace} selectedIds={referenceDocumentIds} onChange={setReferenceDocumentIds} />
                ) : null}
                {!consolidating ? <SegmentedControl value={knowledgeMode} onChange={setKnowledgeMode} options={[{ value: "workspace", label: "Documents from my workspace" }, { value: "context", label: "Paste text" }]} /> : null}
                {!consolidating && knowledgeMode === "workspace" ? (
                  <>
                    <DocumentPicker documents={approvedDocuments} selectedIds={referenceDocumentIds} onChange={setReferenceDocumentIds} emptyText="No approved documents in this subject yet. Upload some in Workspaces." />
                    {!showStyleDocs ? (
                      <button type="button" className="justify-self-start text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => setShowStyleDocs(true)}>+ Add an example of the style you want (optional)</button>
                    ) : (
                      <div className="rounded-2xl bg-[var(--surface-soft)] p-3">
                        <p className="m-0 mb-2 text-xs text-soft-ink"><strong className="text-ink">Style examples.</strong> A past paper or worksheet: the agent copies its format and level, not its content.</p>
                        <DocumentPicker documents={approvedDocuments.filter((document) => !referenceDocumentIds.includes(document.id))} selectedIds={styleDocumentIds} onChange={setStyleDocumentIds} emptyText="No other documents available." />
                      </div>
                    )}
                  </>
                ) : (
                  <textarea className={`${fieldClass} min-h-32 resize-y`} value={contextPromptDraft} onChange={(event) => setContextPromptDraft(event.target.value)} placeholder="Paste the text the agent should work from." />
                )}
              </div>
            </section>

            <section className={cardClass}>
              <p className={kicker}>2 · A few choices</p>
              <h4 className="m-0 mt-1 text-base font-bold text-ink">Tell the agent what you need</h4>
              <div className="mt-3 grid gap-4">
                {questions.map((question) => (
                  <div key={question.id}>
                    <p className="m-0 mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink">{question.text}{question.required ? null : <span className={chipClass}>Optional</span>}</p>
                    {renderQuestionInput(question)}
                  </div>
                ))}
                {!questions.length ? <p className="m-0 text-sm text-soft-ink">Nothing to choose — this agent runs straight from your material.</p> : null}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 pt-4">
                <p className="m-0 text-xs text-soft-ink">{!knowledgeReady ? "Choose material above to continue." : requiredUnanswered ? `${requiredUnanswered} required choice${requiredUnanswered === 1 ? "" : "s"} left.` : "Ready when you are."}</p>
                <button type="button" onClick={handleGenerate} disabled={!canGenerate} className={primaryBtn}>{generation.isGenerating ? "Generating…" : "Generate"} <span aria-hidden>→</span></button>
              </div>
            </section>
          </div>
          <div className="lg:sticky lg:top-4">
            <section className={cardClass}>
              <p className={kicker}>What happens next</p>
              <ul className="m-0 mt-2 grid list-none gap-2 p-0 text-sm text-ink">
                <li className="flex gap-2"><span className="text-[var(--accent-ink)]">1.</span> The agent reads {knowledgeMode === "workspace" ? `${referenceDocumentIds.length} document${referenceDocumentIds.length === 1 ? "" : "s"}` : "your text"}{styleDocumentIds.length ? ` and ${styleDocumentIds.length} style example${styleDocumentIds.length === 1 ? "" : "s"}` : ""}.</li>
                {consolidating ? (
                  <li className="flex gap-2"><span className="text-[var(--accent-ink)]">2.</span> It merges them into one set of notes organised by topic: nothing is left out, overlapping information is written once, and every statement ends with the document and page or section it came from. A long input takes a few minutes.</li>
                ) : (
                  <li className="flex gap-2"><span className="text-[var(--accent-ink)]">2.</span> It writes {fields.filter((field) => field.repeatScope !== "once").length} field{fields.filter((field) => field.repeatScope !== "once").length === 1 ? "" : "s"} per item: {fields.filter((field) => field.repeatScope !== "once").slice(0, 4).map((field) => field.label || field.name).join(", ")}{fields.filter((field) => field.repeatScope !== "once").length > 4 ? "…" : ""}.</li>
                )}
                <li className="flex gap-2"><span className="text-[var(--accent-ink)]">3.</span> You pick a layout and export — or save it to your workspace.</li>
              </ul>
              {hasOutput ? <button type="button" className={`${ghostBtn} mt-4`} onClick={() => setFlowStep(2)}>See last result →</button> : null}
            </section>
          </div>
        </div>
      ) : null}

      {/* Step 2: configure output — components, format and colour (Template Studio's) */}
      {flowStep === 2 ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid gap-3">
            {iterateCard}
            <OutputStylePanel
              plan={plan}
              styles={outputStyles}
              onStylesChange={updateOutputStyles}
              autoAccentId={autoAccentId}
              onAutoAccentChange={setAutoAccentId}
              savedTemplates={templates}
              templatesLoading={templatesLoading}
              onRefreshTemplates={loadTemplates}
              onOpenTemplateStudio={typeof onOpenTool === "function" ? () => onOpenTool("template-builder") : undefined}
              fileName={agentConfig?.name || ""}
            />
            <section className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {agentDocument ? <button type="button" onClick={handleSavePreset} disabled={isSavingPreset} className={ghostBtn}>{isSavingPreset ? "Saving…" : "Save as my default"}</button> : <span />}
                <button type="button" onClick={() => { persistAgent(); setFlowStep(3); }} disabled={!hasOutput || !doc} className={primaryBtn}>Next: Export <span aria-hidden>→</span></button>
              </div>
              {statusMessage ? <p className="m-0 mt-2 text-xs text-accent">{statusMessage}</p> : null}
            </section>
          </div>
          <div className="lg:sticky lg:top-4">{previewPane}</div>
        </div>
      ) : null}

      {/* Step 3: export */}
      {flowStep === 3 ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid gap-3">
            {iterateCard}
            <section className={`${cardClass} border-2 border-[var(--accent)]/30`}>
              <p className={kicker}>Save to your workspace</p>
              <p className="m-0 mt-2 text-sm text-soft-ink">Pick where it is filed, and — if you want — add it straight to Activities or to a study plan, with an optional due date. From there you can open it, restyle it or download it any time.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={primaryBtn} disabled={!hasOutput} onClick={() => setSaveOpen(true)}>Save resource…</button>
                <button type="button" className={ghostBtn} disabled={!hasOutput || !readerResource} onClick={() => setReaderOpen(true)}>Open the HTML view</button>
              </div>
              {statusMessage ? <p className="m-0 mt-2 text-xs text-accent">{statusMessage}</p> : null}
            </section>
            <section className={cardClass}>
              <p className={kicker}>Download</p>
              <div className="mt-3">
                <OutputDownloads doc={doc} filename={agentConfig.name || "output"} onError={setStatusMessage} interactiveKind={activity && activity.questions.length ? "activity" : "document"} onInteractiveHtml={activity && activity.questions.length ? handleDownloadInteractive : handleDownloadHtml} />
              </div>
            </section>
            <button type="button" className={ghostBtn} onClick={() => setFlowStep(2)}>← Back to output</button>
          </div>
          <div className="lg:sticky lg:top-4">{previewPane}</div>
        </div>
      ) : null}
      {readerOpen && readerResource ? (
        <ReaderView
          resource={readerResource}
          notice="Not saved yet — save it as a resource and your highlights are kept with it."
          onSubmit={handleAttempt}
          onClose={() => setReaderOpen(false)}
        />
      ) : null}
      {saveOpen ? (
        <SaveResourceDialog
          defaultName={agentConfig?.name || "Generated resource"}
          folders={filingFolders}
          hideUnfiled
          plans={planChoices.map((choice) => ({ id: choice.id, name: choice.name }))}
          canActivity={Boolean(activity && activity.questions.length)}
          defaultFolderId={saveFolderId || filingFolders.find((folder) => folder.subjectId === subjectId && folder.name === LOOSE_FOLDER)?.id || subjectNode(subjectId)}
          onCreateFolder={toolContext?.onCreateFolder ? async (name, parentNode) => {
            const parent = parseNode(parentNode || subjectNode(subjectId));
            const target = parent.subjectId || subjectId;
            const created = await toolContext.onCreateFolder(name, parent.folderId, target);
            return created?.id ? { id: folderNode(target, created.id) } : null;
          } : undefined}
          busy={isSavingDocument}
          summary={`${activity?.questions.length ? `${activity.questions.length} questions · ` : ""}${agentConfig?.name || "Agent output"}`}
          onCancel={() => setSaveOpen(false)}
          onSave={saveResource}
        />
      ) : null}
      {replanSuggestion && (
        <div className="rounded-2xl border-l-4 border-[var(--accent)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="m-0 text-sm font-semibold text-ink">Study plan adjusted</p>
            <p className="m-0 mt-0.5 text-xs text-soft-ink">{replanSuggestion.reasons?.[0]?.message || "Your study plan has been updated based on this attempt."}</p>
            {(replanSuggestion.suggestedItems || []).map((item, i) => (
              <p key={i} className="m-0 mt-1.5 text-xs text-ink">
                <span className="font-semibold">+ {item.title}</span>
                <span className="text-soft-ink"> · {item.kind.replace(/_/g, " ")} · {item.minutes} min · due {item.dueDate}</span>
              </p>
            ))}
            {replanSuggestion.suggestedItems?.[0]?.reason && (
              <p className="m-0 mt-1 text-xs text-soft-ink italic">{replanSuggestion.suggestedItems[0].reason}</p>
            )}
          </div>
          <button type="button" className="shrink-0 text-soft-ink hover:text-ink text-xs" onClick={() => setReplanSuggestion(null)}>✕</button>
        </div>
      )}
      {playing ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]/95 p-4 sm:p-8">
          <ActivityPlayer activity={playing.activity} look={activityLook({ data: { ...(output?.data || {}), items: output?.items || [], ...(outputBlocks ? { isBlockOutput: true, blocks: outputBlocks } : {}) }, request: { outputStyles } })} onSubmit={handleAttempt} onClose={() => setPlaying(null)} />
        </div>
      ) : null}
      {output?.fallbackReason ? <p className="m-0 text-xs text-[var(--color-warn)]">Used the local fallback: {output.fallbackReason}</p> : null}
      {Array.isArray(output?.checks) && output.checks.some((check) => !check.ok) ? (
        <div className="rounded-xl border border-[rgba(215,0,21,0.25)] bg-[rgba(215,0,21,0.06)] px-3 py-2">
          <p className="m-0 text-xs font-semibold text-[var(--color-danger)]">Some checks did not pass — generate again or adjust your choices.</p>
          <ul className="m-0 mt-1 grid list-none gap-1 p-0 sm:grid-cols-2">
            {output.checks.filter((check) => !check.ok).map((check) => <li key={check.rule} className="text-xs text-[var(--color-danger)]">✗ {check.message}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
