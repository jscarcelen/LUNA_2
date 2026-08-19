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

  const [agentConfig, setAgentConfig] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [complementPrompt, setComplementPrompt] = useState("");
  const [documentSearchText, setDocumentSearchText] = useState("");
  const [referenceDocumentIds, setReferenceDocumentIds] = useState([]);

  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [fieldTypeByName, setFieldTypeByName] = useState({});

  const [output, setOutput] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);

  useEffect(() => {
    if (!agentDocument) return;
    try {
      const parsed = JSON.parse(String(agentDocument.content || "{}"));
      setAgentConfig(parsed);
      const savedMapping = parsed.outputMapping?.fieldTypeByName || {};
      setFieldTypeByName(savedMapping);
      setTemplateId(String(parsed.outputMapping?.templateId || ""));
      setReferenceDocumentIds(Array.isArray(parsed.scope?.documentIds) ? parsed.scope.documentIds : []);
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
  const activeTemplate = templates.find((template) => template.id === templateId) || null;

  function setFieldType(name, type) {
    setFieldTypeByName((previous) => ({ ...previous, [name]: type }));
  }

  async function handleGenerate() {
    if (!agentConfig) return;
    setIsGenerating(true);
    setErrorMessage("");
    try {
      const mergedInstructions = complementPrompt.trim()
        ? `${agentConfig.instructions || ""}\n\n${complementPrompt.trim()}`
        : (agentConfig.instructions || "");

      const response = await fetch("/api/ai-tools/agent-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            name: agentConfig.name,
            instructions: mergedInstructions,
            outputExample: agentConfig.outputExample || "",
            model: agentConfig.model,
            creativity: agentConfig.creativity,
            template: agentConfig.template,
            scope: { workspaceId, subjectId, documentIds: referenceDocumentIds }
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
        outputMapping: { templateId, fieldTypeByName }
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
      const name = `${agentConfig?.name || "Agent Output"}.txt`;
      const saved = await onSaveGeneratedQuizDocument({
        folderIds: [],
        tags: [],
        file: { name, content: textContent, sizeBytes: textContent.length }
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

      <div className="selection-box">
        <h5 style={{ marginTop: 0 }}>Complement your request</h5>
        <p className="hint quiz-mini-copy">Add extra instructions and pick reference material for this run.</p>
        <textarea
          className="input"
          rows={3}
          value={complementPrompt}
          onChange={(event) => setComplementPrompt(event.target.value)}
          placeholder="Example: Focus on chapter 3 vocabulary only."
        />
        <label className="search full" style={{ marginTop: "10px", marginBottom: "8px" }}>
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
      </div>

      <div className="selection-box">
        <h5 style={{ marginTop: 0 }}>Output template</h5>
        <p className="hint quiz-mini-copy">Match each output field to a block type from one of your document templates.</p>
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
        {activeTemplate ? <p className="hint" style={{ marginTop: "8px" }}>Using "{activeTemplate.name}" as the reference layout for this mapping.</p> : null}
        <button className="table-btn" type="button" style={{ marginTop: "10px" }} onClick={handleSavePreset} disabled={isSavingPreset}>
          {isSavingPreset ? "Saving preset..." : "Save mapping as preset for next time"}
        </button>
      </div>

      <div className="selection-box">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <h5 style={{ margin: 0 }}>Generate</h5>
        </div>
        <button className="primary-btn" type="button" style={{ marginTop: "10px", width: "100%" }} onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? "Generating..." : "Generate Output"}
        </button>

        {output ? (
          <div style={{ marginTop: "12px" }}>
            <div className="agent-output-grid">
              {outputItems.map((item, index) => (
                <article className="agent-output-card" key={`output-${index}`}>
                  {fields.map((field) => (
                    <p key={field.name} style={{ margin: "0 0 4px" }}>
                      <strong>{field.label || field.name} ({fieldTypeByName[field.name] || "paragraph"}):</strong> {Array.isArray(item[field.name]) ? item[field.name].join(", ") : String(item[field.name] ?? "")}
                    </p>
                  ))}
                </article>
              ))}
              {!outputItems.length ? <p className="hint">No items returned.</p> : null}
            </div>
            <button className="table-btn" type="button" style={{ marginTop: "10px" }} onClick={handleSaveAsDocument} disabled={isSavingDocument || !outputItems.length}>
              {isSavingDocument ? "Saving..." : "Save Output As Document"}
            </button>
          </div>
        ) : null}
        {statusMessage ? <p className="hint" style={{ marginTop: "10px" }}>{statusMessage}</p> : null}
      </div>
    </section>
  );
}
