"use client";

import { useEffect, useMemo, useState } from "react";
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


const cardClass = "rounded-bento border border-ink/8 bg-paper p-5 shadow-glow transition-colors";
const fieldClass = "w-full rounded-xl border border-ink/10 bg-bg/60 px-3 py-2 text-sm text-ink placeholder:text-soft-ink/60 outline-none transition focus:border-teal/60 focus:ring-2 focus:ring-teal/20";
const chipClass = "inline-flex items-center rounded-full bg-ink/5 px-2.5 py-0.5 text-[11px] font-semibold text-soft-ink ring-1 ring-ink/10";

function StepCard({ index, title, description, status, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const tone = status === "done" ? "border-accent/30" : status === "warn" ? "border-warn/40" : "border-ink/10";
  return (
    <article className={`${cardClass} ${tone} animate-rise`} style={{ animationDelay: `${index * 60}ms` }}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 bg-transparent p-0 text-left" aria-expanded={open}>
        <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ring-1 ${status === "done" ? "bg-teal/15 text-accent ring-accent/50" : "bg-ink/5 text-ink ring-ink/15"}`}>
          {status === "done" ? "✓" : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-ink">{title}</span>
          <span className="block text-xs text-soft-ink">{description}</span>
        </span>
        {badge ? <span className={chipClass}>{badge}</span> : null}
        <span className={`text-soft-ink transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {open ? <div className="mt-4 grid gap-3">{children}</div> : null}
    </article>
  );
}

function SegmentedControl({ value, options, onChange }) {
  return (
    <div className="grid gap-1 rounded-xl bg-ink/5 p-1 ring-1 ring-ink/10" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${value === option.value ? "bg-ink text-bg shadow" : "text-soft-ink hover:text-ink"}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function RunAgentPage({ toolContext, agentDocumentId }) {
  const workspaces = toolContext?.workspaces || [];
  const workspaceId = toolContext?.selectedWorkspaceId || workspaces[0]?.id || "";
  const subjectId = toolContext?.selectedSubjectId || "";
  const onSaveGeneratedQuizDocument = toolContext?.onSaveGeneratedQuizDocument;
  const onUpdateGeneratedDocument = toolContext?.onUpdateGeneratedDocument;
  const onListDocumentBlockTemplates = toolContext?.onListDocumentBlockTemplates;

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) || null;
  const selectedSubject = selectedWorkspace?.subjects?.find((subject) => subject.id === subjectId) || null;
  const agentDocument = (selectedSubject?.documents || []).find((document) => document.id === agentDocumentId) || null;
  const folders = selectedSubject?.folders || [];

  const [agentConfig, setAgentConfig] = useState(null);
  const [loadError, setLoadError] = useState("");

  const [knowledgeMode, setKnowledgeMode] = useState("workspace");
  const [documentSearchText, setDocumentSearchText] = useState("");
  const [referenceDocumentIds, setReferenceDocumentIds] = useState([]);
  const [contextPromptDraft, setContextPromptDraft] = useState("");

  const [answersByQuestionId, setAnswersByQuestionId] = useState({});

  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [fieldTypeByName, setFieldTypeByName] = useState({});
  const [fieldMappingByTemplateField, setFieldMappingByTemplateField] = useState({});
  const [customization, setCustomization] = useState({ brand: defaultBrand(), hiddenFields: [], fieldOrder: [] });
  const [rightTab, setRightTab] = useState("preview");

  const [output, setOutput] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [saveFolderId, setSaveFolderId] = useState("");

  const generation = useAgentGenerationStream();

  useEffect(() => {
    if (!agentDocument) return;
    try {
      const parsed = JSON.parse(String(agentDocument.content || "{}"));
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
      setContextPromptDraft(String(parsed.contextPrompt || ""));
      setKnowledgeMode(Array.isArray(parsed.scope?.documentIds) && parsed.scope.documentIds.length ? "workspace" : (parsed.contextPrompt ? "context" : "workspace"));
      const initialAnswers = {};
      for (const question of Array.isArray(parsed.questions) ? parsed.questions : []) {
        initialAnswers[question.id] = defaultAnswerForQuestion(question);
      }
      setAnswersByQuestionId(initialAnswers);
      if (Array.isArray(parsed.savedOutput?.items) && parsed.savedOutput.items.length) setOutput(parsed.savedOutput);
    } catch {
      setLoadError("This saved agent could not be read.");
    }
  }, [agentDocument]);

  useEffect(() => {
    let cancelled = false;
    async function loadTemplates() {
      let nextTemplates = readTemplatesFromStorage();
      if (typeof onListDocumentBlockTemplates !== "function") {
        if (!cancelled) setTemplates(nextTemplates);
        return;
      }
      try {
        const list = await onListDocumentBlockTemplates();
        if (Array.isArray(list)) {
          nextTemplates = list;
          writeTemplatesToStorage(list);
        }
        if (!cancelled) setTemplates(nextTemplates);
      } catch {
        if (!cancelled) setTemplates(nextTemplates);
      }
    }
    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [onListDocumentBlockTemplates]);

  const documents = useMemo(
    () => (selectedSubject?.documents || []).filter((document) => document.sourceType !== "generated"),
    [selectedSubject]
  );
  const approvedDocuments = useMemo(
    () => documents.filter((document) => String(document.reviewStatus || "approved") === "approved"),
    [documents]
  );
  const visibleDocuments = useMemo(() => {
    const search = documentSearchText.trim().toLowerCase();
    return approvedDocuments.filter((document) => !search || String(document.name || "").toLowerCase().includes(search));
  }, [approvedDocuments, documentSearchText]);

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
    () => fields.map((field) => ({
      ...field,
      frequency: normalizeFrequency(field.repeatScope || "per-output")
    })),
    [fields]
  );
  const requiredUnanswered = questions.filter((question) => {
    if (!question.required) return false;
    const answer = answersByQuestionId[question.id];
    return Array.isArray(answer) ? answer.length === 0 : !String(answer || "").trim();
  }).length;
  const answeredQuestionCount = questions.filter((question) => {
    const answer = answersByQuestionId[question.id];
    return Array.isArray(answer) ? answer.length > 0 : String(answer || "").trim().length > 0;
  }).length;
  const mappingIssues = useMemo(() => {
    if (!activeTemplate) return [];
    const issues = [];
    const agentFieldsByName = Object.fromEntries(agentFields.map((field) => [field.name, field]));
    for (const templateField of templateFields) {
      const mappedAgentFieldName = fieldMappingByTemplateField[templateField.name] || "";
      if (!mappedAgentFieldName) {
        issues.push(`Map template field "${templateField.name}".`);
        continue;
      }
      const mappedAgentField = agentFieldsByName[mappedAgentFieldName];
      if (!mappedAgentField) {
        issues.push(`Mapped variable "${mappedAgentFieldName}" for "${templateField.name}" does not exist in this agent.`);
        continue;
      }
      if (mappedAgentField.frequency !== templateField.frequency) {
        issues.push(`Frequency mismatch: "${templateField.name}" expects ${templateField.frequency}, mapped to "${mappedAgentField.name}" (${mappedAgentField.frequency}).`);
      }
    }
    return issues;
  }, [activeTemplate, agentFields, templateFields, fieldMappingByTemplateField]);
  const mappingReady = !activeTemplate || (templateFields.length > 0 && mappingIssues.length === 0);

  function setFieldType(name, type) {
    setFieldTypeByName((previous) => ({ ...previous, [name]: type }));
  }

  function setTemplateFieldMapping(templateFieldName, agentFieldName) {
    setFieldMappingByTemplateField((previous) => {
      const next = { ...previous };
      for (const [targetField, mappedAgentField] of Object.entries(next)) {
        if (targetField !== templateFieldName && mappedAgentField === agentFieldName) {
          delete next[targetField];
        }
      }
      if (!agentFieldName) delete next[templateFieldName];
      else next[templateFieldName] = agentFieldName;
      return next;
    });
  }

  function setAnswer(questionId, value) {
    setAnswersByQuestionId((previous) => ({ ...previous, [questionId]: value }));
  }

  function renderQuestionInput(question) {
    const answer = answersByQuestionId[question.id];
    const optionClass = (selected) => `flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${selected ? "border-accent/50 bg-teal/10 text-ink" : "border-ink/10 bg-ink/[0.03] text-soft-ink hover:border-ink/25 hover:text-ink"}`;
    if (question.type === "number") {
      return <input className={fieldClass} type="number" value={answer || ""} onChange={(event) => setAnswer(question.id, event.target.value)} placeholder="e.g., 20" />;
    }
    if (question.type === "yes-no") {
      return <SegmentedControl value={answer || ""} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} onChange={(value) => setAnswer(question.id, value)} />;
    }
    if (question.type === "single-select") {
      return (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {(question.options || []).map((option) => (
            <label className={optionClass(answer === option)} key={option}>
              <input className="sr-only" type="radio" name={question.id} checked={answer === option} onChange={() => setAnswer(question.id, option)} />
              <span className={`size-3.5 rounded-full ring-2 ring-inset ${answer === option ? "bg-accent ring-accent" : "ring-ink/30"}`} />
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
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      );
    }
    return <input className={fieldClass} value={answer || ""} onChange={(event) => setAnswer(question.id, event.target.value)} placeholder="Your answer" />;
  }

  async function handleGenerate() {
    if (!agentConfig || generation.isGenerating) return;
    setStatusMessage("");
    setRightTab("preview");
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
          documentIds: knowledgeMode === "workspace" ? referenceDocumentIds : []
        }
      });
      setOutput(data);
    } catch {
      // The hook already exposes the error state to the preview pane.
    }
  }

  async function handleSavePreset() {
    if (!agentDocument || typeof onUpdateGeneratedDocument !== "function") return;
    setIsSavingPreset(true);
    setStatusMessage("");
    try {
      const nextConfig = {
        ...agentConfig,
        scope: { ...(agentConfig.scope || {}), documentIds: referenceDocumentIds },
        outputMapping: { templateId, fieldTypeByName, fieldMappingByTemplateField, customization }
      };
      const textContent = JSON.stringify(nextConfig, null, 2);
      await onUpdateGeneratedDocument(agentDocument.id, {
        file: { name: agentDocument.name, content: textContent, sizeBytes: textContent.length }
      });
      setAgentConfig(nextConfig);
      setStatusMessage("Saved template, mapping and styling as the preset for future runs.");
    } catch (error) {
      setStatusMessage(String(error.message || error));
    } finally {
      setIsSavingPreset(false);
    }
  }

  async function handleSaveAsDocument() {
    if (!onSaveGeneratedQuizDocument || !Array.isArray(output?.items)) return;
    if (activeTemplate && mappingIssues.length) {
      setStatusMessage(`Complete template mapping first. ${mappingIssues[0]}`);
      return;
    }
    setIsSavingDocument(true);
    setStatusMessage("");
    try {
      const visible = applyOutputCustomization(output.items, fields, customization);
      const textContent = renderPlainOutputText(visible.items, visible.fields, fieldTypeByName);
      let fragment = renderPlainOutputHtml(visible.items, visible.fields, fieldTypeByName, customization.brand);
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
      const renderedContent = wrapPreviewDocument(fragment, customization.brand, { forPrint: true });
      const name = `${customization.brand?.title || agentConfig?.name || "Agent Output"}.html`;
      const saved = await onSaveGeneratedQuizDocument({
        folderIds: saveFolderId ? [saveFolderId] : [],
        tags: [],
        file: { name, content: renderedContent, preview: textContent, sizeBytes: renderedContent.length }
      });
      if (!saved) throw new Error("Output could not be saved to the workspace.");
      setStatusMessage(`Saved "${name}" to the workspace.`);
    } catch (error) {
      setStatusMessage(String(error.message || error));
    } finally {
      setIsSavingDocument(false);
    }
  }

  if (loadError) {
    return <p className="rounded-2xl border border-danger/40 bg-rose/10 p-4 text-sm text-danger">{loadError}</p>;
  }

  if (!agentConfig) {
    return (
      <div className="grid gap-3">
        {[0, 1, 2].map((index) => <div key={index} className="h-24 animate-shimmer rounded-bento bg-[linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.08),rgba(255,255,255,0.03))] bg-[length:200%_100%]" />)}
      </div>
    );
  }

  const outputItems = Array.isArray(output?.items) ? output.items : [];
  const knowledgeStatus = knowledgeMode === "workspace" ? (referenceDocumentIds.length ? "done" : "warn") : (contextPromptDraft.trim() ? "done" : "warn");
  const knowledgeBadge = knowledgeMode === "workspace" ? `${referenceDocumentIds.length} doc${referenceDocumentIds.length === 1 ? "" : "s"}` : (contextPromptDraft.trim() ? "Context" : "Empty");
  const questionsStatus = !questions.length || requiredUnanswered === 0 ? "done" : "warn";
  const templateStatus = activeTemplate ? (mappingReady ? "done" : "warn") : "done";
  const canGenerate = !generation.isGenerating && requiredUnanswered === 0;
  const modelLabel = String(agentConfig.model || "").includes("4.1") ? "Luna 3 Max" : String(agentConfig.model || "").includes("gpt-4o-mini") ? "Luna 3 Mini" : String(agentConfig.model || "") ? "Luna 3 Pro" : "Default model";

  return (
    <section className="tw-scope grid gap-4">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-bento border border-ink/8 bg-paper p-6 shadow-glow animate-rise">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-accent ring-1 ring-accent/40">Run agent</span>
              <span className={chipClass}>{modelLabel}</span>
              <span className={chipClass}>Creativity: {agentConfig.creativity || "medium"}</span>
              {output?.model ? <span className={chipClass}>Last run: {output.model}</span> : null}
            </div>
            <h3 className="m-0 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{agentConfig.name || "Untitled Agent"}</h3>
            <p className="m-0 mt-1.5 line-clamp-2 text-sm text-soft-ink">{agentConfig.instructions}</p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white shadow-[0_6px_16px_rgba(0,113,227,0.25)] transition hover:bg-[#0077ed] hover:shadow-[0_8px_20px_rgba(0,113,227,0.3)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
                            <span className="relative">{generation.isGenerating ? "Generating…" : outputItems.length ? "Regenerate" : "Generate output"}</span>
              {!generation.isGenerating ? <span className="relative">→</span> : null}
            </button>
            <p className="m-0 text-center text-[11px] text-soft-ink sm:text-right">
              {requiredUnanswered ? `${requiredUnanswered} required question${requiredUnanswered === 1 ? "" : "s"} left` : "Uses 1 credit per generation"}
            </p>
          </div>
        </div>
      </header>

      {/* Workspace: steps left, live preview right */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid gap-3">
          <StepCard index={0} title="Provide knowledge" description="What the agent should learn from." status={knowledgeStatus} badge={knowledgeBadge}>
            <SegmentedControl
              value={knowledgeMode}
              onChange={setKnowledgeMode}
              options={[{ value: "workspace", label: "My workspace" }, { value: "context", label: "Write context" }]}
            />
            {knowledgeMode === "workspace" ? (
              <>
                <input className={fieldClass} value={documentSearchText} onChange={(event) => setDocumentSearchText(event.target.value)} placeholder="Search documents by name" />
                <div className="grid max-h-56 gap-1 overflow-auto pr-1">
                  {visibleDocuments.map((document) => {
                    const selected = referenceDocumentIds.includes(document.id);
                    return (
                      <label key={document.id} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${selected ? "border-accent/50 bg-teal/10 text-ink" : "border-ink/10 bg-ink/[0.03] text-soft-ink hover:border-ink/25 hover:text-ink"}`}>
                        <input className="sr-only" type="checkbox" checked={selected} onChange={() => toggleInList(document.id, setReferenceDocumentIds)} />
                        <span className={`grid size-4 shrink-0 place-items-center rounded-md ring-1 ring-inset ${selected ? "bg-accent text-white ring-accent" : "ring-ink/30"}`}>{selected ? "✓" : ""}</span>
                        <span className="truncate">{document.name}</span>
                      </label>
                    );
                  })}
                  {!visibleDocuments.length ? <p className="m-0 py-4 text-center text-xs text-soft-ink">No approved documents in this subject yet.</p> : null}
                </div>
                {approvedDocuments.length ? (
                  <div className="flex gap-2 text-xs">
                    <button type="button" className="text-accent hover:underline" onClick={() => setReferenceDocumentIds(approvedDocuments.map((document) => document.id))}>Select all</button>
                    <button type="button" className="text-soft-ink hover:underline" onClick={() => setReferenceDocumentIds([])}>Clear</button>
                  </div>
                ) : null}
              </>
            ) : (
              <textarea className={`${fieldClass} min-h-32 resize-y`} value={contextPromptDraft} onChange={(event) => setContextPromptDraft(event.target.value)} placeholder="Describe the specific context or paste the content this run should use." />
            )}
          </StepCard>

          <StepCard index={1} title="Answer questions" description="The agent tailors its output to these." status={questionsStatus} badge={questions.length ? `${answeredQuestionCount}/${questions.length}` : "None"}>
            {questions.map((question) => (
              <div key={question.id}>
                <p className="m-0 mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
                  {question.text}
                  <span className={`${chipClass} ${question.required ? "text-warn ring-warn/40" : ""}`}>{question.required ? "Required" : "Optional"}</span>
                </p>
                {renderQuestionInput(question)}
              </div>
            ))}
            {!questions.length ? <p className="m-0 text-sm text-soft-ink">This agent has no questions — it runs straight from your knowledge.</p> : null}
          </StepCard>

          <StepCard index={2} title="Choose template" description="How the output should be laid out." status={templateStatus} badge={activeTemplate?.name || "Plain layout"} defaultOpen={Boolean(activeTemplate)}>
            <select className={fieldClass} value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              <option value="">Plain layout (styled cards)</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            {templateFields.length ? (
              <div className="grid gap-2 rounded-2xl border border-ink/8 bg-ink/[0.04] p-3">
                <p className="m-0 text-xs text-soft-ink">Map each template variable to an agent variable (matching frequency).</p>
                {templateFields.map((field) => (
                  <div className="grid gap-1 sm:grid-cols-[1fr_1fr] sm:items-center" key={field.id || field.name}>
                    <span className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                      {field.label || field.name}
                      <span className={chipClass}>{FIELD_FREQUENCY_LABELS[field.frequency] || field.frequency}</span>
                    </span>
                    <select className={fieldClass} value={fieldMappingByTemplateField[field.name] || ""} onChange={(event) => setTemplateFieldMapping(field.name, event.target.value)}>
                      <option value="">Select agent variable</option>
                      {agentFields
                        .filter((agentField) => agentField.frequency === field.frequency)
                        .filter((agentField) => {
                          const selectedForThisField = fieldMappingByTemplateField[field.name];
                          const alreadyUsedByOtherField = Object.entries(fieldMappingByTemplateField).some(
                            ([templateFieldName, mappedAgentName]) => templateFieldName !== field.name && mappedAgentName === agentField.name
                          );
                          return !alreadyUsedByOtherField || selectedForThisField === agentField.name;
                        })
                        .map((agentField) => <option key={agentField.name} value={agentField.name}>{agentField.label || agentField.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            ) : null}
            {activeTemplate && !templateFields.length ? <p className="m-0 text-xs text-danger">No AI-input variables found in this template. Add AI-linked blocks or data fields in Template Builder.</p> : null}
            {activeTemplate && mappingIssues.length ? <p className="m-0 text-xs text-warn">{mappingIssues[0]}</p> : null}
            <button type="button" onClick={handleSavePreset} disabled={isSavingPreset} className="justify-self-start rounded-full px-4 py-1.5 text-xs font-semibold text-ink ring-1 ring-ink/15 transition hover:bg-ink/10 disabled:opacity-50">
              {isSavingPreset ? "Saving…" : "Save as preset for next time"}
            </button>
          </StepCard>

          {outputItems.length ? (
            <article className={`${cardClass} animate-rise`}>
              <h5 className="m-0 mb-1 text-base font-bold text-ink">Save to workspace</h5>
              <p className="m-0 mb-3 text-xs text-soft-ink">Stores exactly what you see in the preview, including your styling.</p>
              <div className="flex flex-wrap gap-2">
                <select className={`${fieldClass} flex-1`} value={saveFolderId} onChange={(event) => setSaveFolderId(event.target.value)}>
                  <option value="">Unfiled</option>
                  {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                </select>
                <button type="button" onClick={handleSaveAsDocument} disabled={isSavingDocument || !mappingReady} className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-bg transition hover:bg-ink/85 disabled:opacity-50">
                  {isSavingDocument ? "Saving…" : "Save"}
                </button>
              </div>
              {statusMessage ? <p className="m-0 mt-2 text-xs text-accent">{statusMessage}</p> : null}
            </article>
          ) : statusMessage ? <p className="m-0 text-xs text-accent">{statusMessage}</p> : null}
        </div>

        <div className="lg:sticky lg:top-4">
          <div className="mb-2 flex items-center gap-1 rounded-full bg-ink/5 p-1 ring-1 ring-ink/10 lg:w-fit">
            {[{ id: "preview", label: "Live preview" }, { id: "customize", label: "Customize" }].map((item) => (
              <button key={item.id} type="button" onClick={() => setRightTab(item.id)} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${rightTab === item.id ? "bg-ink text-bg shadow" : "text-soft-ink hover:text-ink"}`}>{item.label}</button>
            ))}
          </div>
          {rightTab === "preview" ? (
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
              agentName={agentConfig.name}
            />
          ) : (
            <div className={cardClass}>
              <OutputCustomizerPanel
                fields={fields}
                fieldTypeByName={fieldTypeByName}
                onFieldTypeChange={setFieldType}
                customization={customization}
                onChange={setCustomization}
                hasTemplate={Boolean(activeTemplate)}
              />
            </div>
          )}
          {output?.fallbackReason ? <p className="m-0 mt-2 text-xs text-warn">Used the local fallback: {output.fallbackReason}</p> : null}
        </div>
      </div>
    </section>
  );
}
