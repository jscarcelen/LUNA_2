"use client";

import { useMemo, useState } from "react";
import { useAgentGenerationStream } from "./useAgentGenerationStream";
import { LivePreviewPane } from "./LivePreviewPane";
import { defaultBrand } from "./previewHtml";

const AGENT_MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "Luna 3 Mini (Recommended, low cost)" },
  { value: "gpt-4o", label: "Luna 3 Pro (Upgrade, higher quality)" },
  { value: "gpt-4.1", label: "Luna 3 Max (Upgrade, most capable)" }
];

const CREATIVITY_OPTIONS = [
  { value: "low", label: "Low", description: "Consistent, literal outputs." },
  { value: "medium", label: "Medium", description: "Balanced creativity and accuracy." },
  { value: "high", label: "High", description: "More varied, exploratory outputs." }
];

const FIELD_TYPE_OPTIONS = ["string", "number", "boolean", "array"];
const FIELD_FREQUENCY_OPTIONS = [
  { value: "once", label: "Once per document" },
  { value: "per-output", label: "Loop (one per generated item)" }
];
const QUESTION_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "single-select", label: "Single choice" },
  { value: "multi-select", label: "Multi select" },
  { value: "yes-no", label: "Yes / No" }
];
const AGENT_MARKETPLACE_STORAGE_KEY = "luna.agentMarketplaceListings.v1";
const PRICING_TYPE_OPTIONS = [
  { value: "pay-as-you-go", label: "Pay as you go" },
  { value: "monthly", label: "Rent for a month" },
  { value: "one-time", label: "One-time purchase" }
];

function createFieldId() {
  return `field-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createQuestionId() {
  return `question-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultFields() {
  return [
    { id: createFieldId(), name: "front", label: "Front", type: "string", repeatScope: "per-output" },
    { id: createFieldId(), name: "back", label: "Back", type: "string", repeatScope: "per-output" }
  ];
}

function readMarketplaceListingsFromStorage() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AGENT_MARKETPLACE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMarketplaceListingsToStorage(listings = []) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AGENT_MARKETPLACE_STORAGE_KEY, JSON.stringify(listings));
  } catch {
    // Ignore localStorage quota issues; marketplace listing stays local-only regardless.
  }
}

function toggleInList(value, setter) {
  setter((previous) => (
    previous.includes(value)
      ? previous.filter((item) => item !== value)
      : [...previous, value]
  ));
}

export function AgentBuilderPage({ toolContext }) {
  const workspaces = toolContext?.workspaces || [];
  const defaultWorkspaceId = toolContext?.selectedWorkspaceId || workspaces[0]?.id || "";
  const onSaveGeneratedQuizDocument = toolContext?.onSaveGeneratedQuizDocument;
  const onUpdateGeneratedDocument = toolContext?.onUpdateGeneratedDocument;

  const [workspaceId] = useState(defaultWorkspaceId);
  const [subjectId] = useState(toolContext?.selectedSubjectId || "");

  const [agentName, setAgentName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [outputExample, setOutputExample] = useState("");
  const [referenceDocumentIds, setReferenceDocumentIds] = useState([]);
  const [documentSearchText, setDocumentSearchText] = useState("");
  const [contextPrompt, setContextPrompt] = useState("");

  const [questions, setQuestions] = useState([]);
  const [questionTextDraft, setQuestionTextDraft] = useState("");
  const [questionTypeDraft, setQuestionTypeDraft] = useState("text");
  const [questionOptionsDraft, setQuestionOptionsDraft] = useState("");
  const [questionRequiredDraft, setQuestionRequiredDraft] = useState(true);

  const [fields, setFields] = useState(defaultFields());
  const [fieldNameDraft, setFieldNameDraft] = useState("");
  const [fieldTypeDraft, setFieldTypeDraft] = useState("string");
  const [fieldRepeatScopeDraft, setFieldRepeatScopeDraft] = useState("per-output");

  const [model, setModel] = useState(AGENT_MODEL_OPTIONS[0].value);
  const [creativity, setCreativity] = useState("medium");
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [output, setOutput] = useState(null);
  const [iteration, setIteration] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const generation = useAgentGenerationStream();
  const isGenerating = generation.isGenerating;

  const [publishMode, setPublishMode] = useState("self");
  const [listingName, setListingName] = useState("");
  const [listingDescription, setListingDescription] = useState("");
  const [listingPictureUrl, setListingPictureUrl] = useState("");
  const [listingPrice, setListingPrice] = useState("9.99");
  const [pricingType, setPricingType] = useState(PRICING_TYPE_OPTIONS[0].value);
  const [publishStatusMessage, setPublishStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState("");

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) || null;
  const subjects = selectedWorkspace?.subjects || [];
  const selectedSubject = subjects.find((subject) => subject.id === subjectId) || null;
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

  const myAgentDocuments = useMemo(
    () => (selectedSubject?.documents || []).filter((document) => document.sourceType === "generated" && (document.tags || []).includes("ai-agent")),
    [selectedSubject]
  );

  function addField() {
    const name = String(fieldNameDraft || "").trim();
    if (!name) return;
    const normalized = name.toLowerCase().replace(/\s+/g, "_");
    if (fields.some((field) => field.name === normalized)) {
      setErrorMessage("A field with that name already exists.");
      return;
    }
    setFields((previous) => [...previous, { id: createFieldId(), name: normalized, label: name, type: fieldTypeDraft, repeatScope: fieldRepeatScopeDraft }]);
    setFieldNameDraft("");
    setFieldTypeDraft("string");
    setFieldRepeatScopeDraft("per-output");
    setErrorMessage("");
  }

  function removeField(fieldId) {
    setFields((previous) => (previous.length > 1 ? previous.filter((field) => field.id !== fieldId) : previous));
  }

  function addQuestion() {
    const text = String(questionTextDraft || "").trim();
    if (!text) return;
    const needsOptions = questionTypeDraft === "single-select" || questionTypeDraft === "multi-select";
    const options = needsOptions
      ? questionOptionsDraft.split(",").map((option) => option.trim()).filter(Boolean)
      : [];
    if (needsOptions && !options.length) {
      setErrorMessage("Add at least one option for this question type.");
      return;
    }
    setQuestions((previous) => [...previous, {
      id: createQuestionId(),
      text,
      type: questionTypeDraft,
      options,
      required: questionRequiredDraft
    }]);
    setQuestionTextDraft("");
    setQuestionOptionsDraft("");
    setQuestionRequiredDraft(true);
    setErrorMessage("");
  }

  function removeQuestion(questionId) {
    setQuestions((previous) => previous.filter((question) => question.id !== questionId));
  }

  function buildAgentConfig() {
    return {
      name: agentName,
      instructions,
      contextPrompt,
      questions,
      outputExample,
      template: { fields: fields.map(({ id: _id, ...field }) => ({ ...field, repeatScope: field.repeatScope || "per-output" })) },
      model,
      creativity,
      scope: {
        workspaceId,
        subjectId,
        documentIds: referenceDocumentIds
      }
    };
  }

  async function handleGenerate(isRefinement = false) {
    if (!fields.length) {
      setErrorMessage("Add at least one output field first.");
      return;
    }
    if (isGenerating) return;
    setErrorMessage("");
    try {
      const data = await generation.generate({
        ...buildAgentConfig(),
        refinementPrompt: isRefinement ? refinementPrompt : "",
        previousOutput: isRefinement ? output : null
      });
      setOutput(data);
      setIteration((previous) => previous + 1);
      if (isRefinement) setRefinementPrompt("");
    } catch (error) {
      setErrorMessage(String(error.message || error));
    }
  }

  async function handleSaveForMyself() {
    if (!onSaveGeneratedQuizDocument || !subjectId) {
      setPublishStatusMessage("Select a workspace and subject before saving.");
      return;
    }
    const name = String(agentName || "").trim() || "Untitled Agent";
    setIsSaving(true);
    setPublishStatusMessage("");
    try {
      const configPayload = { ...buildAgentConfig(), name, savedOutput: output };
      const textContent = JSON.stringify(configPayload, null, 2);
      const file = {
        name: `${name}.agent.json`,
        content: textContent,
        sizeBytes: textContent.length
      };
      const saved = editingDocumentId && typeof onUpdateGeneratedDocument === "function"
        ? await onUpdateGeneratedDocument(editingDocumentId, { file })
        : await onSaveGeneratedQuizDocument({ folderIds: [], tags: ["ai-agent"], file });
      if (!saved) throw new Error("Agent could not be saved to the workspace.");
      setEditingDocumentId(saved.id || editingDocumentId);
      setPublishStatusMessage(`Saved "${name}" to AI Tools workspace. It now appears as its own tool.`);
    } catch (error) {
      setPublishStatusMessage(String(error.message || error));
    } finally {
      setIsSaving(false);
    }
  }

  function handleLoadAgentForEdit(document) {
    try {
      const parsed = JSON.parse(String(document.content || "{}"));
      setEditingDocumentId(document.id);
      setAgentName(String(parsed.name || document.name || ""));
      setInstructions(String(parsed.instructions || ""));
      setContextPrompt(String(parsed.contextPrompt || ""));
      setQuestions(Array.isArray(parsed.questions) ? parsed.questions : []);
      setOutputExample(String(parsed.outputExample || ""));
      setModel(String(parsed.model || AGENT_MODEL_OPTIONS[0].value));
      setCreativity(String(parsed.creativity || "medium"));
      setReferenceDocumentIds(Array.isArray(parsed.scope?.documentIds) ? parsed.scope.documentIds : []);
      const loadedFields = Array.isArray(parsed.template?.fields) && parsed.template.fields.length
        ? parsed.template.fields.map((field) => ({ id: createFieldId(), ...field, repeatScope: field.repeatScope || "per-output" }))
        : defaultFields();
      setFields(loadedFields);
      setOutput(parsed.savedOutput || null);
      setPublishStatusMessage(`Loaded "${parsed.name || document.name}" for editing.`);
    } catch {
      setPublishStatusMessage("Could not read this saved agent.");
    }
  }

  function handlePublishToMarketplace() {
    const name = String(listingName || agentName || "").trim() || "Untitled Agent";
    const listing = {
      id: `agent-listing-${Date.now().toString(36)}`,
      name,
      description: String(listingDescription || instructions || "").trim(),
      pictureUrl: String(listingPictureUrl || "").trim(),
      price: Number(listingPrice || 0),
      pricingType,
      author: "You",
      category: "Community",
      // Bundle the full config so the marketplace can install this agent into other subjects.
      agent: { ...buildAgentConfig(), name, scope: { workspaceId: "", subjectId: "", documentIds: [] } },
      createdAt: new Date().toISOString()
    };
    const existing = readMarketplaceListingsFromStorage();
    writeMarketplaceListingsToStorage([listing, ...existing]);
    setPublishStatusMessage(`Listed "${name}" on the Agent Marketplace (preview only, no real payments yet).`);
  }

  const outputItems = Array.isArray(output?.items) ? output.items : [];

  return (
    <section className="view-stack quiz-tool-page agent-tool-page">
      <article className="quiz-hero">
        <div className="quiz-hero-copy">
          <div className="quiz-hero-badges">
            <span className="quiz-hero-kicker">Create AI Agent</span>
          </div>
          <h3>Configure, test, and publish your own AI agent.</h3>
          <p>Describe what the agent should do, give it reference material and an output template, then test and refine before adding it to your workspace or listing it on the marketplace.</p>
        </div>
      </article>

      {errorMessage ? <p className="hint" style={{ color: "#b84a77" }}>{errorMessage}</p> : null}

      <div className="agent-builder-grid">
        <div className="view-stack">
          <div className="selection-box">
            <span className="quiz-picker-kicker">Step 1 · Configure</span>
            <h5 style={{ marginTop: "4px" }}>Agent instructions (meta prompt)</h5>
            <label className="search full" style={{ marginBottom: "8px" }}>
              <span>Agent name</span>
              <input className="input" value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder="Example: Spanish Vocabulary Coach" />
            </label>
            <label className="search full">
              <span>Instructions (prompt)</span>
              <textarea
                className="input"
                rows={6}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value.slice(0, 4000))}
                placeholder="Describe what this agent should do, its tone, rules, and constraints."
              />
            </label>
            <p className="hint" style={{ marginTop: "6px" }}>{instructions.length} / 4000</p>
          </div>

          <div className="selection-box">
            <div className="inline-actions" style={{ justifyContent: "space-between" }}>
              <h5 style={{ margin: 0 }}>Reference material (preferred)</h5>
              <strong className="quiz-selection-count">{referenceDocumentIds.length} selected</strong>
            </div>
            <p className="hint quiz-mini-copy">Documents the agent can learn from and apply to all runs.</p>
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
          </div>

          <div className="selection-box">
            <h5 style={{ marginTop: 0 }}>Context / secondary prompt (alternative)</h5>
            <p className="hint quiz-mini-copy">Instead of uploading files, describe the specific context or content the agent should use.</p>
            <textarea
              className="input"
              rows={4}
              value={contextPrompt}
              onChange={(event) => setContextPrompt(event.target.value.slice(0, 1000))}
              placeholder="Example: Spanish animal vocabulary to English for flashcards"
            />
            <p className="hint" style={{ marginTop: "6px" }}>{contextPrompt.length} / 1000</p>
          </div>

          <div className="selection-box">
            <h5 style={{ marginTop: 0 }}>Output example (optional)</h5>
            <p className="hint quiz-mini-copy">Provide an example of what the agent should generate so it learns the format.</p>
            <textarea
              className="input"
              rows={5}
              value={outputExample}
              onChange={(event) => setOutputExample(event.target.value)}
              placeholder="Paste an example output here."
            />
          </div>
        </div>

        <div className="view-stack">
          <div className="selection-box">
            <span className="quiz-picker-kicker">Step 2 · User options</span>
            <h5 style={{ marginTop: "4px" }}>Questions the agent will ask</h5>
            <p className="hint quiz-mini-copy">Define the questions your agent will ask each time it's used.</p>
            <div className="agent-field-list">
              {questions.map((question) => (
                <div className="agent-field-row" key={question.id}>
                  <span className="agent-field-name">{question.text}</span>
                  <span className="scope-chip">{QUESTION_TYPE_OPTIONS.find((option) => option.value === question.type)?.label || question.type}</span>
                  <span className="scope-chip">{question.required ? "Required" : "Optional"}</span>
                  <button className="table-btn danger icon-btn" type="button" onClick={() => removeQuestion(question.id)}>×</button>
                </div>
              ))}
              {!questions.length ? <p className="hint">No questions yet. Add one below.</p> : null}
            </div>
            <div className="form-stack" style={{ marginTop: "10px" }}>
              <input className="input" value={questionTextDraft} onChange={(event) => setQuestionTextDraft(event.target.value)} placeholder="Question text (e.g. How many flashcards do you want?)" />
              <div className="inline-actions" style={{ gap: "8px", flexWrap: "wrap" }}>
                <select className="input" value={questionTypeDraft} onChange={(event) => setQuestionTypeDraft(event.target.value)}>
                  {QUESTION_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <label className="scope-chip-row" style={{ margin: 0 }}>
                  <input type="checkbox" checked={questionRequiredDraft} onChange={(event) => setQuestionRequiredDraft(event.target.checked)} />
                  <span className="scope-chip">Required</span>
                </label>
              </div>
              {questionTypeDraft === "single-select" || questionTypeDraft === "multi-select" ? (
                <input className="input" value={questionOptionsDraft} onChange={(event) => setQuestionOptionsDraft(event.target.value)} placeholder="Options, comma separated (e.g. Easy, Medium, Hard)" />
              ) : null}
              <button className="table-btn" type="button" onClick={addQuestion}>Add question</button>
            </div>
          </div>

          <div className="selection-box">
            <span className="quiz-picker-kicker">Step 3 · Output variables</span>
            <h5 style={{ marginTop: "4px" }}>Agent output variables (template-independent)</h5>
            <p className="hint quiz-mini-copy">Define variable names and frequency now. Template mapping happens later when running the agent.</p>
            <div className="agent-field-list">
              {fields.map((field) => (
                <div className="agent-field-row" key={field.id}>
                  <span className="agent-field-name">{field.label || field.name}</span>
                  <span className="scope-chip">{field.type}</span>
                  <span className="scope-chip">{field.repeatScope === "once" ? "Once" : "Loop"}</span>
                  <button className="table-btn danger icon-btn" type="button" onClick={() => removeField(field.id)} disabled={fields.length <= 1}>×</button>
                </div>
              ))}
            </div>
            <div className="inline-actions" style={{ marginTop: "10px", gap: "8px", flexWrap: "wrap" }}>
              <input className="input" style={{ flex: 1, minWidth: "140px" }} value={fieldNameDraft} onChange={(event) => setFieldNameDraft(event.target.value)} placeholder="Field name (e.g. Front)" />
              <select className="input" value={fieldTypeDraft} onChange={(event) => setFieldTypeDraft(event.target.value)}>
                {FIELD_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <select className="input" value={fieldRepeatScopeDraft} onChange={(event) => setFieldRepeatScopeDraft(event.target.value)}>
                {FIELD_FREQUENCY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button className="table-btn" type="button" onClick={addField}>Add field</button>
            </div>
          </div>

          {myAgentDocuments.length ? (
            <div className="selection-box">
              <h5 style={{ marginTop: 0 }}>Your saved agents</h5>
              <p className="hint quiz-mini-copy">Reopen a saved agent to edit and republish it.</p>
              <div className="quiz-doc-select-list">
                {myAgentDocuments.map((document) => (
                  <div className="quiz-picker-row" key={document.id} style={{ justifyContent: "space-between" }}>
                    <span>{document.name}</span>
                    <button className="table-btn" type="button" onClick={() => handleLoadAgentForEdit(document)}>Edit</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="view-stack">
          <div className="selection-box">
            <span className="quiz-picker-kicker">Step 4 · Test &amp; refine</span>
            <h5 style={{ marginTop: "4px" }}>See it in action</h5>
            <p className="hint quiz-mini-copy">Generate output, review it, and improve it with follow-up instructions.</p>
            <div className="inline-actions" style={{ gap: "8px", flexWrap: "wrap" }}>
              <label className="search" style={{ minWidth: "220px" }}>
                <span>Model</span>
                <select className="input" value={model} onChange={(event) => setModel(event.target.value)}>
                  {AGENT_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <div className="quiz-question-card-grid" style={{ marginTop: "10px" }}>
              {CREATIVITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={creativity === option.value ? "quiz-choice-card on" : "quiz-choice-card"}
                  type="button"
                  onClick={() => setCreativity(option.value)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
            <button className="primary-btn" type="button" style={{ marginTop: "12px", width: "100%" }} onClick={() => handleGenerate(false)} disabled={isGenerating}>
              {isGenerating ? "Generating..." : "Generate Output"}
            </button>
            <p className="hint" style={{ marginTop: "6px" }}>Uses 1 credit per generation.</p>

            <div className="tw-scope" style={{ marginTop: "12px" }}>
              {output ? (
                <div className="inline-actions" style={{ justifyContent: "space-between", marginBottom: "8px" }}>
                  <strong>Output preview</strong>
                  <span className="scope-chip">Iteration {iteration} · {output.model}</span>
                </div>
              ) : null}
              <LivePreviewPane
                items={outputItems}
                fields={fields}
                fieldTypeByName={{}}
                customization={{ brand: defaultBrand(agentName), hiddenFields: [], fieldOrder: [] }}
                template={null}
                templateFields={[]}
                fieldMappingByTemplateField={{}}
                mappingReady
                generation={generation}
                onCancelGeneration={generation.cancel}
                agentName={agentName}
                emptyHint="Press Generate to test your agent. You'll see each build step live, then the rendered output here."
              />
            </div>
            {output ? (
              <div className="selection-box" style={{ marginTop: "10px" }}>
                <p className="hint" style={{ marginTop: 0 }}>What do you want to change?</p>
                <div className="inline-actions" style={{ gap: "8px" }}>
                  <input className="input" style={{ flex: 1 }} value={refinementPrompt} onChange={(event) => setRefinementPrompt(event.target.value)} placeholder="Example: Include more intermediate words" />
                  <button className="table-btn" type="button" onClick={() => handleGenerate(true)} disabled={isGenerating || !refinementPrompt.trim()}>Improve with prompt</button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="selection-box">
            <span className="quiz-picker-kicker">Step 5 · Publish</span>
            <h5 style={{ marginTop: "4px" }}>Use or share your agent</h5>
            <div className="agent-publish-toggle">
              <button className={publishMode === "self" ? "quiz-choice-card on" : "quiz-choice-card"} type="button" onClick={() => setPublishMode("self")}>
                <strong>Use for myself</strong>
                <span>Save to my AI Tools workspace and use it in my subject.</span>
              </button>
              <button className={publishMode === "marketplace" ? "quiz-choice-card on" : "quiz-choice-card"} type="button" onClick={() => setPublishMode("marketplace")}>
                <strong>List on Marketplace</strong>
                <span>Share with others and earn credits.</span>
              </button>
            </div>

            {publishMode === "self" ? (
              <button className="primary-btn" type="button" style={{ marginTop: "12px", width: "100%" }} onClick={handleSaveForMyself} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Agent To Workspace"}
              </button>
            ) : (
              <div className="form-stack" style={{ marginTop: "12px" }}>
                <input className="input" value={listingName} onChange={(event) => setListingName(event.target.value)} placeholder="Listing name" />
                <textarea className="input" rows={3} value={listingDescription} onChange={(event) => setListingDescription(event.target.value)} placeholder="Listing description" />
                <input className="input" value={listingPictureUrl} onChange={(event) => setListingPictureUrl(event.target.value)} placeholder="Picture URL" />
                <div className="inline-actions" style={{ gap: "8px" }}>
                  <input className="input" type="number" min="0" step="0.01" value={listingPrice} onChange={(event) => setListingPrice(event.target.value)} placeholder="Price" style={{ maxWidth: "140px" }} />
                  <select className="input" value={pricingType} onChange={(event) => setPricingType(event.target.value)}>
                    {PRICING_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <button className="primary-btn" type="button" onClick={handlePublishToMarketplace}>List On Marketplace</button>
              </div>
            )}
            {publishStatusMessage ? <p className="hint" style={{ marginTop: "10px" }}>{publishStatusMessage}</p> : null}
          </div>
        </div>
      </div>

      <div className="selection-box">
        <h5 style={{ marginTop: 0 }}>Your agent pipeline (how it will work for future users)</h5>
        <p className="hint quiz-mini-copy">This is the flow your agent will follow every time it's used.</p>
        <div className="agent-pipeline-grid">
          <div className="agent-pipeline-step">
            <span className="agent-pipeline-index">1</span>
            <strong>Provide reference</strong>
            <span>User uploads or selects reference material.</span>
          </div>
          <div className="agent-pipeline-step">
            <span className="agent-pipeline-index">2</span>
            <strong>Answer questions</strong>
            <span>User answers the questions you defined.</span>
          </div>
          <div className="agent-pipeline-step">
            <span className="agent-pipeline-index">3</span>
            <strong>Choose template</strong>
            <span>User selects or customizes the output template.</span>
          </div>
          <div className="agent-pipeline-step">
            <span className="agent-pipeline-index">4</span>
            <strong>Generate output</strong>
            <span>Agent generates content based on everything above.</span>
          </div>
          <div className="agent-pipeline-step">
            <span className="agent-pipeline-index">5</span>
            <strong>Save to workspace</strong>
            <span>User reviews and saves the output.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
