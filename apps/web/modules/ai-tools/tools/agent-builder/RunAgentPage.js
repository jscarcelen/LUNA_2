"use client";

import { useEffect, useMemo, useState } from "react";

const BLOCK_TYPE_OPTIONS = [
  { value: "heading1", label: "Heading" },
  { value: "heading2", label: "Heading 2" },
  { value: "heading3", label: "Heading 3" },
  { value: "paragraph", label: "Paragraph" },
  { value: "standalone_text", label: "Standalone Text" },
  { value: "bullet_list", label: "Bullet List" },
  { value: "code", label: "Code" }
];

function toggleInList(value, setter) {
  setter((previous) => (
    previous.includes(value)
      ? previous.filter((item) => item !== value)
      : [...previous, value]
  ));
}

function renderFieldAsMarkdown(type, value) {
  const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  if (type === "heading1") return `# ${text}`;
  if (type === "heading2") return `## ${text}`;
  if (type === "heading3") return `### ${text}`;
  if (type === "code") return `\`\`\`\n${text}\n\`\`\``;
  if (type === "bullet_list") {
    const items = Array.isArray(value) ? value : String(value || "").split(/\n+/).filter(Boolean);
    return items.map((item) => `- ${item}`).join("\n");
  }
  return text;
}

function defaultAnswerForQuestion(question) {
  if (question.type === "multi-select") return [];
  return "";
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

  const [output, setOutput] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [saveFolderId, setSaveFolderId] = useState("");

  useEffect(() => {
    if (!agentDocument) return;
    try {
      const parsed = JSON.parse(String(agentDocument.content || "{}"));
      setAgentConfig(parsed);
      const savedMapping = parsed.outputMapping?.fieldTypeByName || {};
      setFieldTypeByName(savedMapping);
      setFieldMappingByTemplateField(parsed.outputMapping?.fieldMappingByTemplateField || {});
      setTemplateId(String(parsed.outputMapping?.templateId || ""));
      setReferenceDocumentIds(Array.isArray(parsed.scope?.documentIds) ? parsed.scope.documentIds : []);
      setContextPromptDraft(String(parsed.contextPrompt || ""));
      setKnowledgeMode(Array.isArray(parsed.scope?.documentIds) && parsed.scope.documentIds.length ? "workspace" : (parsed.contextPrompt ? "context" : "workspace"));
      const initialAnswers = {};
      for (const question of Array.isArray(parsed.questions) ? parsed.questions : []) {
        initialAnswers[question.id] = defaultAnswerForQuestion(question);
      }
      setAnswersByQuestionId(initialAnswers);
    } catch {
      setLoadError("This saved agent could not be read.");
    }
  }, [agentDocument]);

  useEffect(() => {
    let cancelled = false;
    async function loadTemplates() {
      if (typeof onListDocumentBlockTemplates !== "function") return;
      try {
        const list = await onListDocumentBlockTemplates();
        if (!cancelled) setTemplates(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setTemplates([]);
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

  const fields = Array.isArray(agentConfig?.template?.fields) ? agentConfig.template.fields : [];
  const questions = Array.isArray(agentConfig?.questions) ? agentConfig.questions : [];
  const activeTemplate = templates.find((template) => template.id === templateId) || null;
  const templateFields = Array.isArray(activeTemplate?.dataFields) ? activeTemplate.dataFields : [];
  const answeredQuestionCount = questions.filter((question) => {
    const answer = answersByQuestionId[question.id];
    return Array.isArray(answer) ? answer.length > 0 : String(answer || "").trim().length > 0;
  }).length;

  function setFieldType(name, type) {
    setFieldTypeByName((previous) => ({ ...previous, [name]: type }));
  }

  function setAnswer(questionId, value) {
    setAnswersByQuestionId((previous) => ({ ...previous, [questionId]: value }));
  }

  function renderQuestionInput(question) {
    const answer = answersByQuestionId[question.id];
    if (question.type === "number") {
      return <input className="input" type="number" value={answer || ""} onChange={(event) => setAnswer(question.id, event.target.value)} placeholder="e.g., 20" />;
    }
    if (question.type === "yes-no") {
      return (
        <div className="inline-actions" style={{ gap: "10px" }}>
          <label className="scope-chip-row"><input type="radio" name={question.id} checked={answer === "yes"} onChange={() => setAnswer(question.id, "yes")} /><span>Yes</span></label>
          <label className="scope-chip-row"><input type="radio" name={question.id} checked={answer === "no"} onChange={() => setAnswer(question.id, "no")} /><span>No</span></label>
        </div>
      );
    }
    if (question.type === "single-select") {
      return (
        <div className="view-stack" style={{ gap: "6px" }}>
          {(question.options || []).map((option) => (
            <label className="scope-chip-row" key={option}>
              <input type="radio" name={question.id} checked={answer === option} onChange={() => setAnswer(question.id, option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    }
    if (question.type === "multi-select") {
      const selected = Array.isArray(answer) ? answer : [];
      return (
        <div className="chip-wrap">
          {(question.options || []).map((option) => (
            <label className="scope-chip-row" key={option}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => setAnswer(question.id, selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option])}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    }
    return <input className="input" value={answer || ""} onChange={(event) => setAnswer(question.id, event.target.value)} placeholder="Your answer" />;
  }

  async function handleGenerate() {
    if (!agentConfig) return;
    setIsGenerating(true);
    setErrorMessage("");
    try {
      const questionAnswers = questions.map((question) => ({ question: question.text, answer: answersByQuestionId[question.id] }));
      const response = await fetch("/api/ai-tools/agent-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            name: agentConfig.name,
            instructions: agentConfig.instructions || "",
            contextPrompt: knowledgeMode === "context" ? contextPromptDraft : "",
            questionAnswers,
            outputExample: agentConfig.outputExample || "",
            model: agentConfig.model,
            creativity: agentConfig.creativity,
            template: agentConfig.template,
            scope: {
              workspaceId,
              subjectId,
              documentIds: knowledgeMode === "workspace" ? referenceDocumentIds : []
            }
          }
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Agent generation failed");
      }
      setOutput(data);
    } catch (error) {
      setErrorMessage(String(error.message || error));
    } finally {
      setIsGenerating(false);
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
        outputMapping: { templateId, fieldTypeByName, fieldMappingByTemplateField }
      };
      const textContent = JSON.stringify(nextConfig, null, 2);
      await onUpdateGeneratedDocument(agentDocument.id, {
        file: { name: agentDocument.name, content: textContent, sizeBytes: textContent.length }
      });
      setAgentConfig(nextConfig);
      setStatusMessage("Saved this template mapping as the preset for future runs.");
    } catch (error) {
      setStatusMessage(String(error.message || error));
    } finally {
      setIsSavingPreset(false);
    }
  }

  async function handleSaveAsDocument() {
    if (!onSaveGeneratedQuizDocument || !Array.isArray(output?.items)) return;
    setIsSavingDocument(true);
    setStatusMessage("");
    try {
      const textContent = output.items
        .map((item) => fields.map((field) => renderFieldAsMarkdown(fieldTypeByName[field.name] || "paragraph", item[field.name])).join("\n\n"))
        .join("\n\n---\n\n");
      let renderedContent = textContent;
      let name = `${agentConfig?.name || "Agent Output"}.txt`;
      if (activeTemplate) {
        const mappedItems = output.items.map((item) => templateFields.reduce((mapped, field) => {
            const sourceName = fieldMappingByTemplateField[field.name] || field.name;
            mapped[field.name] = item[sourceName];
            return mapped;
          }, {}));
        const templateData = activeTemplate.repeatCollectionField
          ? { [activeTemplate.repeatCollectionField]: mappedItems }
          : (mappedItems[0] || {});
        const response = await fetch("/api/templates/render-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: activeTemplate, sampleData: templateData, format: "html" })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || "Template rendering failed");
        renderedContent = result.html || "";
        name = `${agentConfig?.name || "Agent Output"}.html`;
      }
      const saved = await onSaveGeneratedQuizDocument({
        folderIds: saveFolderId ? [saveFolderId] : [],
        tags: [],
        file: { name, content: renderedContent, preview: textContent, sizeBytes: renderedContent.length }
      });
      if (!saved) throw new Error("Output could not be saved to the workspace.");
      setStatusMessage(`Saved output as "${name}" in the workspace.`);
    } catch (error) {
      setStatusMessage(String(error.message || error));
    } finally {
      setIsSavingDocument(false);
    }
  }

  if (loadError) {
    return <p className="hint" style={{ color: "#b84a77" }}>{loadError}</p>;
  }

  if (!agentConfig) {
    return <p className="hint">Loading agent...</p>;
  }

  const outputItems = Array.isArray(output?.items) ? output.items : [];
  const knowledgeSourceLabel = knowledgeMode === "workspace"
    ? `${referenceDocumentIds.length} document(s)`
    : (contextPromptDraft.trim() ? "Context prompt" : "Not provided");

  return (
    <section className="view-stack quiz-tool-page agent-tool-page">
      <article className="quiz-hero">
        <div className="quiz-hero-copy">
          <div className="quiz-hero-badges">
            <span className="quiz-hero-kicker">Run Agent</span>
          </div>
          <h3>{agentConfig.name || "Untitled Agent"}</h3>
          <p>{agentConfig.instructions}</p>
        </div>
      </article>

      {errorMessage ? <p className="hint" style={{ color: "#b84a77" }}>{errorMessage}</p> : null}

      <div className="agent-builder-grid">
        <div className="selection-box">
          <span className="quiz-picker-kicker">Step 1</span>
          <h5 style={{ marginTop: "4px" }}>Provide knowledge</h5>
          <p className="hint quiz-mini-copy">Add the content your agent should learn from.</p>
          <div className="inline-actions" style={{ gap: "8px", marginBottom: "10px" }}>
            <button className={knowledgeMode === "workspace" ? "primary-btn" : "table-btn"} type="button" onClick={() => setKnowledgeMode("workspace")}>My Workspace</button>
            <button className={knowledgeMode === "context" ? "primary-btn" : "table-btn"} type="button" onClick={() => setKnowledgeMode("context")}>Use context instead</button>
          </div>

          {knowledgeMode === "workspace" ? (
            <>
              <label className="search full" style={{ marginBottom: "8px" }}>
                <span>Search documents</span>
                <input className="input" value={documentSearchText} onChange={(event) => setDocumentSearchText(event.target.value)} placeholder="Search by filename" />
              </label>
              <div className="quiz-doc-select-list">
                {visibleDocuments.map((document) => {
                  const selected = referenceDocumentIds.includes(document.id);
                  return (
                    <label className={selected ? "quiz-picker-row on" : "quiz-picker-row"} key={document.id}>
                      <input type="checkbox" checked={selected} onChange={() => toggleInList(document.id, setReferenceDocumentIds)} />
                      <span>{document.name}</span>
                    </label>
                  );
                })}
                {!visibleDocuments.length ? <p className="hint">No approved documents yet.</p> : null}
              </div>
            </>
          ) : (
            <textarea
              className="input"
              rows={6}
              value={contextPromptDraft}
              onChange={(event) => setContextPromptDraft(event.target.value)}
              placeholder="Describe the specific context or content this run should use."
            />
          )}
        </div>

        <div className="selection-box">
          <span className="quiz-picker-kicker">Step 2</span>
          <h5 style={{ marginTop: "4px" }}>Answer questions</h5>
          <p className="hint quiz-mini-copy">Your agent will use these to customize the output.</p>
          <div className="view-stack">
            {questions.map((question) => (
              <div key={question.id}>
                <p className="hint" style={{ margin: "0 0 6px", fontWeight: 600, color: "inherit" }}>
                  {question.text} {question.required ? <span className="scope-chip">Required</span> : <span className="scope-chip">Optional</span>}
                </p>
                {renderQuestionInput(question)}
              </div>
            ))}
            {!questions.length ? <p className="hint">This agent has no questions configured.</p> : null}
          </div>
        </div>

        <div className="selection-box">
          <span className="quiz-picker-kicker">Step 3</span>
          <h5 style={{ marginTop: "4px" }}>Choose template</h5>
          <p className="hint quiz-mini-copy">Select how the agent should format the output.</p>
          <label className="search full" style={{ marginBottom: "10px" }}>
            <span>Template</span>
            <select className="input" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              <option value="">No template (plain text)</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
          <div className="agent-field-list">
            {fields.map((field) => (
              <div className="agent-field-row" key={field.name}>
                <span className="agent-field-name">{field.label || field.name}</span>
                <select className="input" style={{ maxWidth: "220px" }} value={fieldTypeByName[field.name] || "paragraph"} onChange={(event) => setFieldType(field.name, event.target.value)}>
                  {BLOCK_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          {templateFields.length ? (
            <div className="selection-box" style={{ marginTop: 10 }}>
              <p className="hint" style={{ marginTop: 0 }}>Template data fields</p>
              {templateFields.map((field) => (
                <div className="agent-field-row" key={field.id || field.name}>
                  <span className="agent-field-name">{field.label || field.name} <small>({field.dataType})</small></span>
                  <select className="input" value={fieldMappingByTemplateField[field.name] || field.name} onChange={(event) => setFieldMappingByTemplateField((previous) => ({ ...previous, [field.name]: event.target.value }))}>
                    <option value={field.name}>{field.name}</option>
                    {fields.map((agentField) => <option key={agentField.name} value={agentField.name}>{agentField.label || agentField.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ) : null}
          {activeTemplate ? <p className="hint" style={{ marginTop: "8px" }}>Using "{activeTemplate.name}" as the reference layout for this mapping.</p> : null}
          <button className="table-btn" type="button" style={{ marginTop: "10px" }} onClick={handleSavePreset} disabled={isSavingPreset}>
            {isSavingPreset ? "Saving preset..." : "Save mapping as preset for next time"}
          </button>
        </div>

        <div className="selection-box">
          <span className="quiz-picker-kicker">Step 4</span>
          <h5 style={{ marginTop: "4px" }}>Generate</h5>
          <p className="hint quiz-mini-copy">Review your selections and generate output.</p>
          <div className="agent-field-list" style={{ marginBottom: "10px" }}>
            <div className="agent-field-row"><span className="agent-field-name">Knowledge source</span><span className="scope-chip">{knowledgeSourceLabel}</span></div>
            <div className="agent-field-row"><span className="agent-field-name">Questions answered</span><span className="scope-chip">{answeredQuestionCount} / {questions.length}</span></div>
            <div className="agent-field-row"><span className="agent-field-name">Template</span><span className="scope-chip">{activeTemplate?.name || "Plain text"}</span></div>
          </div>
          <button className="primary-btn" type="button" style={{ width: "100%" }} onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? "Generating..." : "Generate Output"}
          </button>
          <p className="hint" style={{ marginTop: "6px" }}>Uses 1 credit per generation.</p>

          {output ? (
            <div style={{ marginTop: "12px" }}>
              <div className="agent-output-grid">
                {outputItems.map((item, index) => (
                  <article className="agent-output-card" key={`output-${index}`}>
                    {fields.map((field) => (
                      <p key={field.name} style={{ margin: "0 0 4px" }}>
                        <strong>{field.label || field.name}:</strong> {Array.isArray(item[field.name]) ? item[field.name].join(", ") : String(item[field.name] ?? "")}
                      </p>
                    ))}
                  </article>
                ))}
                {!outputItems.length ? <p className="hint">No items returned.</p> : null}
              </div>

              <div className="selection-box" style={{ marginTop: "10px" }}>
                <p className="hint" style={{ marginTop: 0 }}>Save to workspace</p>
                <div className="inline-actions" style={{ gap: "8px" }}>
                  <select className="input" value={saveFolderId} onChange={(event) => setSaveFolderId(event.target.value)}>
                    <option value="">Unfiled</option>
                    {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </select>
                  <button className="primary-btn" type="button" onClick={handleSaveAsDocument} disabled={isSavingDocument || !outputItems.length}>
                    {isSavingDocument ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {statusMessage ? <p className="hint" style={{ marginTop: "10px" }}>{statusMessage}</p> : null}
        </div>
      </div>

      <div className="selection-box">
        <h5 style={{ marginTop: 0 }}>How this agent works (for you)</h5>
        <p className="hint quiz-mini-copy">Every time you run this agent, you&apos;ll follow this simple flow.</p>
        <div className="agent-pipeline-grid">
          <div className="agent-pipeline-step">
            <span className="agent-pipeline-index">1</span>
            <strong>Provide knowledge</strong>
            <span>Select reference materials or write context.</span>
          </div>
          <div className="agent-pipeline-step">
            <span className="agent-pipeline-index">2</span>
            <strong>Answer questions</strong>
            <span>Fill in the questions to set your preferences.</span>
          </div>
          <div className="agent-pipeline-step">
            <span className="agent-pipeline-index">3</span>
            <strong>Choose template</strong>
            <span>Pick how the output should be formatted.</span>
          </div>
          <div className="agent-pipeline-step">
            <span className="agent-pipeline-index">4</span>
            <strong>Generate output</strong>
            <span>Get AI-generated content based on your choices.</span>
          </div>
          <div className="agent-pipeline-step">
            <span className="agent-pipeline-index">5</span>
            <strong>Save to workspace</strong>
            <span>Review and save the result for future use.</span>
          </div>
        </div>
        <p className="hint" style={{ marginTop: "10px" }}>Tip: you can rerun the agent anytime with different materials, answers, or templates to get new results.</p>
      </div>
    </section>
  );
}
