"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentGenerationStream } from "./useAgentGenerationStream";
import { LivePreviewPane, buildTemplateData } from "./LivePreviewPane";
import { OutputCustomizerPanel } from "./OutputCustomizerPanel";
import { applyOutputCustomization, defaultBrand, renderPlainOutputHtml, renderPlainOutputText, wrapPreviewDocument } from "./previewHtml";

const TEMPLATE_BUILDER_STORAGE_KEY = "luna-template-builder-drafts";
const FIELD_FREQUENCY_LABELS = {
  once: "Once per document",
  loop: "Looped per AI item"
};

function toggleInList(value, setter) {
  setter((previous) => (
    previous.includes(value)
      ? previous.filter((item) => item !== value)
      : [...previous, value]
  ));
}

function defaultAnswerForQuestion(question) {
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

function normalizeFrequency(scope = "") {
  return scope === "once" ? "once" : "loop";
}

function inferTemplateFieldFrequencies(template = {}) {
  const inferred = {};
  const markFrequency = (fieldName, scope) => {
    const name = String(fieldName || "").trim();
    if (!name) return;
    const normalized = normalizeFrequency(scope);
    if (inferred[name] === "loop" || normalized === "loop") inferred[name] = "loop";
    else inferred[name] = inferred[name] || "once";
  };
  const normalizeScope = (scope = "") => (scope === "once" ? "once" : "per-output");
  const collectFromBlock = (block, fallbackScope = "once") => {
    if (!block) return;
    const scope = normalizeScope(block.repeatScope || fallbackScope);
    if (block.bindField) markFrequency(block.bindField, scope);
    if (block.repeatField) markFrequency(block.repeatField, "per-output");
  };
  const componentsById = Object.fromEntries((Array.isArray(template.components) ? template.components : []).map((component) => [component.id, component]));
  const pageBlocks = Array.isArray(template.pageLayouts)
    ? template.pageLayouts.flatMap((page) => page.blocks || [])
    : [];
  const canvasBlocks = pageBlocks.length ? pageBlocks : (Array.isArray(template.canvasBlocks) ? template.canvasBlocks : []);
  for (const block of canvasBlocks) {
    if (block?.componentRefId) {
      const component = componentsById[block.componentRefId];
      for (const child of component?.blocks || []) {
        collectFromBlock(child, block.repeatScope || "once");
      }
      continue;
    }
    collectFromBlock(block, block?.repeatScope || "once");
  }
  for (const field of Array.isArray(template.dataFields) ? template.dataFields : []) {
    const name = String(field?.name || "").trim();
    if (!name) continue;
    const scope = field?.repeatScope || inferred[name] || "once";
    markFrequency(name, scope);
  }
  return inferred;
}


const cardClass = "rounded-[18px] border border-ink/8 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const fieldClass = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-soft-ink/70 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";
const chipClass = "inline-flex items-center rounded-full bg-[var(--surface-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0077ed] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";

const FLOW_STEPS = [
  { id: 1, title: "Configure questions", text: "Material and a few choices" },
  { id: 2, title: "Configure output", text: "Layout and styling" },
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
    { title: "Pick a layout", text: "Any template works with any agent." },
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
  const [templateId, setTemplateId] = useState("");
  const [fieldTypeByName, setFieldTypeByName] = useState({});
  const [fieldMappingByTemplateField, setFieldMappingByTemplateField] = useState({});
  const [customization, setCustomization] = useState({ brand: defaultBrand(), hiddenFields: [], fieldOrder: [] });
  const [outputTab, setOutputTab] = useState("layout");

  const [output, setOutput] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [saveFolderId, setSaveFolderId] = useState("");

  const generation = useAgentGenerationStream();

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
    setAgentConfig(parsed);
    setFieldTypeByName(parsed.outputMapping?.fieldTypeByName || {});
    setFieldMappingByTemplateField(parsed.outputMapping?.fieldMappingByTemplateField || {});
    setTemplateId(String(parsed.outputMapping?.templateId || ""));
    setCustomization({
      brand: { ...defaultBrand(parsed.name), ...(parsed.outputMapping?.customization?.brand || {}) },
      hiddenFields: parsed.outputMapping?.customization?.hiddenFields || [],
      fieldOrder: parsed.outputMapping?.customization?.fieldOrder || []
    });
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
  }, [agentDocument, builtinAgent]);

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

  const fields = useMemo(() => (Array.isArray(agentConfig?.template?.fields) ? agentConfig.template.fields : []), [agentConfig]);
  const questions = Array.isArray(agentConfig?.questions) ? agentConfig.questions : [];
  const activeTemplate = templates.find((template) => template.id === templateId) || null;
  const templateFieldFrequencyByName = useMemo(
    () => (activeTemplate ? inferTemplateFieldFrequencies(activeTemplate) : {}),
    [activeTemplate]
  );
  const templateFields = useMemo(() => {
    if (!activeTemplate) return [];
    const explicit = Array.isArray(activeTemplate.dataFields) ? activeTemplate.dataFields : [];
    const inferredNames = Object.keys(templateFieldFrequencyByName);
    if (explicit.length) {
      return explicit.map((field) => ({
        id: field.id || field.name,
        name: field.name,
        label: field.label || field.name,
        dataType: field.dataType || "string",
        frequency: templateFieldFrequencyByName[field.name] || normalizeFrequency(field.repeatScope || "once")
      }));
    }
    return inferredNames.map((name) => ({
      id: `inferred-${name}`,
      name,
      label: name,
      dataType: "string",
      frequency: templateFieldFrequencyByName[name] || "once"
    }));
  }, [activeTemplate, templateFieldFrequencyByName]);
  const agentFields = useMemo(
    () => fields.map((field) => ({ ...field, frequency: normalizeFrequency(field.repeatScope || "per-output") })),
    [fields]
  );
  const requiredUnanswered = questions.filter((question) => {
    if (!question.required) return false;
    const answer = answersByQuestionId[question.id];
    return Array.isArray(answer) ? answer.length === 0 : !String(answer || "").trim();
  }).length;
  const mappingIssues = useMemo(() => {
    if (!activeTemplate) return [];
    const issues = [];
    const agentFieldsByName = Object.fromEntries(agentFields.map((field) => [field.name, field]));
    for (const templateField of templateFields) {
      const mappedAgentFieldName = fieldMappingByTemplateField[templateField.name] || "";
      if (!mappedAgentFieldName) {
        issues.push(`Map template field "${templateField.label || templateField.name}".`);
        continue;
      }
      const mappedAgentField = agentFieldsByName[mappedAgentFieldName];
      if (!mappedAgentField) {
        issues.push(`"${mappedAgentFieldName}" does not exist in this agent.`);
        continue;
      }
      if (mappedAgentField.frequency !== templateField.frequency) {
        issues.push(`"${templateField.label || templateField.name}" repeats ${templateField.frequency === "loop" ? "per item" : "once"}, but "${mappedAgentField.label || mappedAgentField.name}" ${mappedAgentField.frequency === "loop" ? "repeats per item" : "appears once"}.`);
      }
    }
    return issues;
  }, [activeTemplate, agentFields, templateFields, fieldMappingByTemplateField]);
  const mappingReady = !activeTemplate || (templateFields.length > 0 && mappingIssues.length === 0);

  // Auto-map template fields whose name/label matches an agent field.
  useEffect(() => {
    if (!activeTemplate || !templateFields.length) return;
    setFieldMappingByTemplateField((previous) => {
      const next = { ...previous };
      const used = new Set(Object.values(next));
      for (const templateField of templateFields) {
        if (next[templateField.name]) continue;
        const match = agentFields.find((agentField) => !used.has(agentField.name) && agentField.frequency === templateField.frequency && [agentField.name, agentField.label].map((value) => String(value || "").toLowerCase()).includes(String(templateField.name).toLowerCase()));
        if (match) {
          next[templateField.name] = match.name;
          used.add(match.name);
        }
      }
      return next;
    });
  }, [activeTemplate, templateFields, agentFields]);

  function setFieldType(name, type) {
    setFieldTypeByName((previous) => ({ ...previous, [name]: type }));
  }

  function setTemplateFieldMapping(templateFieldName, agentFieldName) {
    setFieldMappingByTemplateField((previous) => {
      const next = { ...previous };
      for (const [targetField, mappedAgentField] of Object.entries(next)) {
        if (targetField !== templateFieldName && mappedAgentField === agentFieldName) delete next[targetField];
      }
      if (!agentFieldName) delete next[templateFieldName];
      else next[templateFieldName] = agentFieldName;
      return next;
    });
  }

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

  async function handleGenerate() {
    if (!agentConfig || generation.isGenerating) return;
    setStatusMessage("");
    setFlowStep(2);
    setOutputTab("layout");
    try {
      const questionAnswers = questions.map((question) => ({ question: question.text, answer: answersByQuestionId[question.id] }));
      const data = await generation.generate({
        name: agentConfig.name,
        instructions: agentConfig.instructions || "",
        contextPrompt: knowledgeMode === "context" ? contextPromptDraft : "",
        questionAnswers,
        outputExample: agentConfig.outputExample || "",
        model: agentConfig.model,
        creativity: agentConfig.creativity,
        template: { fields },
        scope: {
          workspaceId,
          subjectId,
          documentIds: knowledgeMode === "workspace" ? referenceDocumentIds : [],
          styleDocumentIds
        }
      });
      setOutput(data);
    } catch {
      // The hook exposes the error state to the preview pane.
    }
  }

  async function handleSavePreset() {
    if (!agentDocument || typeof onUpdateGeneratedDocument !== "function") return;
    setIsSavingPreset(true);
    setStatusMessage("");
    try {
      const nextConfig = {
        ...agentConfig,
        scope: { ...(agentConfig.scope || {}), documentIds: referenceDocumentIds, styleDocumentIds },
        outputMapping: { templateId, fieldTypeByName, fieldMappingByTemplateField, customization }
      };
      const textContent = JSON.stringify(nextConfig, null, 2);
      await onUpdateGeneratedDocument(agentDocument.id, { file: { name: agentDocument.name, content: textContent, sizeBytes: textContent.length } });
      setAgentConfig(nextConfig);
      setStatusMessage("Saved as the default for next time.");
    } catch (error) {
      setStatusMessage(String(error.message || error));
    } finally {
      setIsSavingPreset(false);
    }
  }

  function buildDocumentHtml(forPrint = false) {
    const visible = applyOutputCustomization(output?.items || [], fields, customization);
    return {
      visible,
      textContent: renderPlainOutputText(visible.items, visible.fields, fieldTypeByName),
      plainFragment: renderPlainOutputHtml(visible.items, visible.fields, fieldTypeByName, customization.brand),
      wrap: (fragment, { header = true } = {}) => wrapPreviewDocument(fragment, customization.brand, { forPrint, header })
    };
  }

  async function renderFinalHtml(forPrint) {
    const { visible, textContent, plainFragment, wrap } = buildDocumentHtml(forPrint);
    let fragment = plainFragment;
    if (activeTemplate) {
      const templateData = buildTemplateData(visible.items, templateFields, fieldMappingByTemplateField, activeTemplate);
      const response = await fetch("/api/templates/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: activeTemplate, sampleData: templateData, format: "html" })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Template rendering failed");
      fragment = result.html || "";
    }
    return { html: wrap(fragment, { header: !activeTemplate }), textContent };
  }

  async function handleSaveAsDocument() {
    if (!onSaveGeneratedQuizDocument || !Array.isArray(output?.items)) return;
    if (!mappingReady) {
      setStatusMessage(`Finish the template mapping first. ${mappingIssues[0] || ""}`);
      return;
    }
    setIsSavingDocument(true);
    setStatusMessage("");
    try {
      const { html, textContent } = await renderFinalHtml(true);
      const name = `${customization.brand?.title || agentConfig?.name || "Agent Output"}.html`;
      const saved = await onSaveGeneratedQuizDocument({ folderIds: saveFolderId ? [saveFolderId] : [], tags: [], file: { name, content: html, preview: textContent, sizeBytes: html.length } });
      if (!saved) throw new Error("Output could not be saved to the workspace.");
      setStatusMessage(`Saved "${name}" to your workspace.`);
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
      anchor.download = `${customization.brand?.title || agentConfig?.name || "output"}.html`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setStatusMessage(String(error.message || error));
    }
  }

  async function handlePrint() {
    try {
      const { html } = await renderFinalHtml(true);
      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      document.body.appendChild(frame);
      frame.srcdoc = html;
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => frame.remove(), 1000);
      };
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

  const outputItems = Array.isArray(output?.items) ? output.items : [];
  const hasOutput = outputItems.length > 0;
  const knowledgeReady = knowledgeMode === "workspace" ? referenceDocumentIds.length > 0 : contextPromptDraft.trim().length > 0;
  const canGenerate = !generation.isGenerating && requiredUnanswered === 0 && knowledgeReady;
  const unlockedStep = hasOutput ? 3 : 1;
  const modelLabel = String(agentConfig.model || "").includes("4.1") ? "Luna 3 Max" : String(agentConfig.model || "").includes("gpt-4o-mini") ? "Luna 3 Mini" : String(agentConfig.model || "") ? "Luna 3 Pro" : "Default model";

  const previewPane = (
    <LivePreviewPane
      items={outputItems}
      fields={fields}
      fieldTypeByName={fieldTypeByName}
      customization={customization}
      template={activeTemplate}
      templateFields={templateFields}
      fieldMappingByTemplateField={fieldMappingByTemplateField}
      mappingReady={mappingReady}
      generation={generation}
      onCancelGeneration={generation.cancel}
      agentName={customization.brand?.title || agentConfig.name}
      emptyHint="Generate in step 1 and your result appears here. Then choose a layout and styling."
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
            <p className="m-0 mt-1.5 text-sm leading-relaxed text-soft-ink">{agentConfig.description || agentConfig.tagline || agentConfig.instructions}</p>
          </div>
          {flowStep === 1 ? (
            <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
              <button type="button" onClick={handleGenerate} disabled={!canGenerate} className={primaryBtn}>{generation.isGenerating ? "Generating…" : hasOutput ? "Generate again" : "Generate"} <span aria-hidden>→</span></button>
              <p className="m-0 text-center text-[11px] text-soft-ink sm:text-right">
                {!knowledgeReady ? "Choose material first" : requiredUnanswered ? `${requiredUnanswered} question${requiredUnanswered === 1 ? "" : "s"} left` : "Uses 1 credit"}
              </p>
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
              <h4 className="m-0 mt-1 text-base font-bold text-ink">What should the agent read?</h4>
              <div className="mt-3 grid gap-3">
                <SegmentedControl value={knowledgeMode} onChange={setKnowledgeMode} options={[{ value: "workspace", label: "Documents from my workspace" }, { value: "context", label: "Paste text" }]} />
                {knowledgeMode === "workspace" ? (
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
                <li className="flex gap-2"><span className="text-[var(--accent-ink)]">2.</span> It writes {fields.length} field{fields.length === 1 ? "" : "s"} per item: {fields.slice(0, 4).map((field) => field.label || field.name).join(", ")}{fields.length > 4 ? "…" : ""}.</li>
                <li className="flex gap-2"><span className="text-[var(--accent-ink)]">3.</span> You pick a layout and export — or save it to your workspace.</li>
              </ul>
              {hasOutput ? <button type="button" className={`${ghostBtn} mt-4`} onClick={() => setFlowStep(2)}>See last result →</button> : null}
            </section>
          </div>
        </div>
      ) : null}

      {/* Step 2: configure output */}
      {flowStep === 2 ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid gap-3">
            <section className={cardClass}>
              <div className="flex items-center gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                {[{ id: "layout", label: "Layout" }, { id: "style", label: "Styling" }].map((tab) => (
                  <button key={tab.id} type="button" onClick={() => setOutputTab(tab.id)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${outputTab === tab.id ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink hover:text-ink"}`}>{tab.label}</button>
                ))}
              </div>
              {outputTab === "layout" ? (
                <div className="mt-4 grid gap-3">
                  <div>
                    <p className={kicker}>Template</p>
                    <div className="mt-2 grid gap-1.5">
                      <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${!templateId ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10 hover:bg-[var(--surface-soft)]"}`}>
                        <input className="sr-only" type="radio" name="template" checked={!templateId} onChange={() => setTemplateId("")} />
                        <span className="grid size-9 place-items-center rounded-lg bg-white text-base shadow-[0_1px_2px_rgba(0,0,0,0.08)]">▤</span>
                        <span className="min-w-0"><span className="block text-sm font-semibold text-ink">Clean default</span><span className="block text-xs text-soft-ink">One card per item, your colours and fonts.</span></span>
                      </label>
                      {templates.map((template) => (
                        <label key={template.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${templateId === template.id ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10 hover:bg-[var(--surface-soft)]"}`}>
                          <input className="sr-only" type="radio" name="template" checked={templateId === template.id} onChange={() => setTemplateId(template.id)} />
                          <span className="grid size-9 place-items-center rounded-lg bg-white text-base shadow-[0_1px_2px_rgba(0,0,0,0.08)]">▦</span>
                          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{template.name}</span><span className="block text-xs text-soft-ink">{(template.dataFields || []).length || Object.keys(inferTemplateFieldFrequencies(template)).length} fields · {template.pageFormat || "A4"}</span></span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      {typeof onOpenTool === "function" ? <button type="button" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => onOpenTool("template-builder")}>Design a new template →</button> : null}
                      <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={loadTemplates} disabled={templatesLoading}>{templatesLoading ? "Refreshing…" : "Refresh list"}</button>
                    </div>
                  </div>
                  {activeTemplate ? (
                    <div>
                      <p className={kicker}>Match fields</p>
                      <p className="m-0 mt-1 text-xs text-soft-ink">Tell the template which agent field fills each slot. Matching names are filled in for you.</p>
                      <div className="mt-2 grid gap-2">
                        {templateFields.map((field) => (
                          <div className="grid gap-1 sm:grid-cols-[1fr_1fr] sm:items-center" key={field.id || field.name}>
                            <span className="flex flex-wrap items-center gap-1.5 text-sm text-ink">{field.label || field.name}<span className={chipClass}>{field.frequency === "loop" ? "per item" : "once"}</span></span>
                            <select className={fieldClass} value={fieldMappingByTemplateField[field.name] || ""} onChange={(event) => setTemplateFieldMapping(field.name, event.target.value)}>
                              <option value="">Choose…</option>
                              {agentFields.filter((agentField) => agentField.frequency === field.frequency).map((agentField) => <option key={agentField.name} value={agentField.name}>{agentField.label || agentField.name}</option>)}
                            </select>
                          </div>
                        ))}
                        {!templateFields.length ? <p className="m-0 text-xs text-[var(--color-danger)]">This template has no field tags yet. Open it in the Template Builder and tag its blocks.</p> : null}
                        {mappingIssues.length ? <p className="m-0 text-xs text-[var(--color-warn)]">{mappingIssues[0]}</p> : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4">
                  <OutputCustomizerPanel fields={fields} fieldTypeByName={fieldTypeByName} onFieldTypeChange={setFieldType} customization={customization} onChange={setCustomization} hasTemplate={Boolean(activeTemplate)} />
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-ink/8 pt-4">
                {agentDocument ? <button type="button" onClick={handleSavePreset} disabled={isSavingPreset} className={ghostBtn}>{isSavingPreset ? "Saving…" : "Save as my default"}</button> : <span />}
                <button type="button" onClick={() => setFlowStep(3)} disabled={!hasOutput || !mappingReady} className={primaryBtn}>Next: Export <span aria-hidden>→</span></button>
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
            <section className={cardClass}>
              <p className={kicker}>Download</p>
              <div className="mt-3 grid gap-2">
                <button type="button" className={`${ghostBtn} !justify-between`} onClick={handlePrint}><span>PDF</span><span className="text-xs font-normal text-soft-ink">via print dialog</span></button>
                <button type="button" className={`${ghostBtn} !justify-between`} onClick={handleDownloadHtml}><span>HTML</span><span className="text-xs font-normal text-soft-ink">opens in any browser</span></button>
                {activeTemplate ? <p className="m-0 text-xs text-soft-ink">PDF, Word{activeTemplate.docModel ? " and PowerPoint" : ""} downloads are in the preview toolbar on the right.</p> : <p className="m-0 text-xs text-soft-ink">Choose a template in step 2 for Word / PowerPoint exports.</p>}
              </div>
            </section>
            <section className={cardClass}>
              <p className={kicker}>Save to workspace</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <select className={`${fieldClass} flex-1`} value={saveFolderId} onChange={(event) => setSaveFolderId(event.target.value)}>
                  <option value="">Unfiled</option>
                  {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                </select>
                <button type="button" onClick={handleSaveAsDocument} disabled={isSavingDocument || !mappingReady} className={primaryBtn}>{isSavingDocument ? "Saving…" : "Save"}</button>
              </div>
              {statusMessage ? <p className="m-0 mt-2 text-xs text-accent">{statusMessage}</p> : null}
            </section>
            <section className={cardClass}>
              <p className={kicker}>Share with students</p>
              <p className="m-0 mt-2 text-sm text-soft-ink">Assigning to a class and answering online arrives with student accounts. For now, download or save and share the file.</p>
            </section>
            <button type="button" className={ghostBtn} onClick={() => setFlowStep(2)}>← Back to output</button>
          </div>
          <div className="lg:sticky lg:top-4">{previewPane}</div>
        </div>
      ) : null}

      {output?.fallbackReason ? <p className="m-0 text-xs text-[var(--color-warn)]">Used the local fallback: {output.fallbackReason}</p> : null}
    </section>
  );
}
