"use client";

import { useEffect, useMemo, useState } from "react";
import { buildFolderChildrenMap, buildFolderPathMap, getDocumentFolderIds } from "../../../core";

const QUESTION_TYPE_OPTIONS = [
  { value: "multiple-choice", label: "Multiple choice", description: "Best for fast checking and scoring." },
  { value: "true-false", label: "True / False", description: "Quick concept checks and confidence checks." },
  { value: "short-answer", label: "Short answer", description: "Prompts that test reasoning in one or two lines." }
];

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy", description: "Warm-up level, basics first." },
  { value: "medium", label: "Medium", description: "Balanced exam-like challenge." },
  { value: "hard", label: "Hard", description: "Advanced challenge and edge cases." }
];

function downloadBase64File(base64, filename, mimeType) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function decodeBase64Utf8(base64) {
  const raw = atob(base64);
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildGeneratedQuizFilename(quizJson) {
  const title = String(quizJson?.quiz?.title || "Generated Quiz").trim() || "Generated Quiz";
  const safeTitle = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${safeTitle}.txt`;
}

function toggleInList(value, setter) {
  setter((previous) => (
    previous.includes(value)
      ? previous.filter((item) => item !== value)
      : [...previous, value]
  ));
}

export function QuizGeneratorToolPage({ toolContext }) {
  const workspaces = toolContext?.workspaces || [];
  const defaultWorkspaceId = toolContext?.selectedWorkspaceId || workspaces[0]?.id || "";
  const onSaveGeneratedQuizDocument = toolContext?.onSaveGeneratedQuizDocument;

  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [subjectId, setSubjectId] = useState(toolContext?.selectedSubjectId || "");

  const [contentDocumentIds, setContentDocumentIds] = useState([]);
  const [referenceDocumentIds, setReferenceDocumentIds] = useState([]);

  const [quizTitle, setQuizTitle] = useState("");
  const [topicPrompt, setTopicPrompt] = useState("");
  const [questionCount, setQuestionCount] = useState(6);
  const [difficulty, setDifficulty] = useState("medium");
  const [questionTypes, setQuestionTypes] = useState(["multiple-choice"]);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [questionStep, setQuestionStep] = useState(1);
  const [showContentUploader, setShowContentUploader] = useState(false);
  const [showReferenceUploader, setShowReferenceUploader] = useState(false);
  const [documentSearchText, setDocumentSearchText] = useState("");

  const [contentPendingFiles, setContentPendingFiles] = useState([]);
  const [contentUploadFolderIds, setContentUploadFolderIds] = useState([]);
  const [contentUploadTags, setContentUploadTags] = useState([]);
  const [contentUploadTagDraft, setContentUploadTagDraft] = useState("");

  const [referencePendingFiles, setReferencePendingFiles] = useState([]);
  const [referenceUploadFolderIds, setReferenceUploadFolderIds] = useState([]);
  const [referenceUploadTags, setReferenceUploadTags] = useState([]);
  const [referenceUploadTagDraft, setReferenceUploadTagDraft] = useState("");

  const [result, setResult] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewDownloadOpen, setPreviewDownloadOpen] = useState(false);
  const [previewSaveOpen, setPreviewSaveOpen] = useState(false);
  const [previewAnswerMode, setPreviewAnswerMode] = useState("answers");
  const [saveFolderIds, setSaveFolderIds] = useState([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingContent, setIsUploadingContent] = useState(false);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [reviewingDocumentId, setReviewingDocumentId] = useState("");
  const [reviewDraftById, setReviewDraftById] = useState({});
  const [errorMessage, setErrorMessage] = useState("");

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) || null,
    [workspaces, workspaceId]
  );

  const subjects = selectedWorkspace?.subjects || [];
  const selectedSubject = subjects.find((subject) => subject.id === subjectId) || null;
  const folders = selectedSubject?.folders || [];
  const documents = useMemo(
    () => (selectedSubject?.documents || []).filter((document) => document.sourceType !== "generated"),
    [selectedSubject]
  );
  const approvedDocuments = useMemo(
    () => documents.filter((document) => String(document.reviewStatus || "approved") === "approved"),
    [documents]
  );
  const flaggedDocuments = useMemo(
    () => documents.filter((document) => String(document.reviewStatus || "approved") !== "approved"),
    [documents]
  );

  const folderLabels = useMemo(() => buildFolderPathMap(folders), [folders]);
  const childrenByParent = useMemo(() => buildFolderChildrenMap(folders), [folders]);

  const descendantsByFolderId = useMemo(() => {
    const out = new Map();

    function collectDescendants(folderId) {
      const nested = childrenByParent.get(folderId) || [];
      const ids = [folderId];
      for (const child of nested) {
        ids.push(...collectDescendants(child.id));
      }
      return ids;
    }

    for (const folder of folders) {
      out.set(folder.id, collectDescendants(folder.id));
    }

    return out;
  }, [childrenByParent, folders]);

  const contentDocCount = contentDocumentIds.length;
  const referenceDocCount = referenceDocumentIds.length;

  useEffect(() => {
    if (!selectedWorkspace && workspaces.length) {
      setWorkspaceId(workspaces[0].id);
    }
  }, [selectedWorkspace, workspaces]);

  useEffect(() => {
    if (!subjects.length) {
      setSubjectId("");
      return;
    }
    if (!subjects.some((subject) => subject.id === subjectId)) {
      setSubjectId(subjects[0].id);
    }
  }, [subjects, subjectId]);

  useEffect(() => {
    setContentDocumentIds([]);
    setReferenceDocumentIds([]);
    setResult(null);
    setWizardStep(1);
    setQuestionStep(1);
    setShowPreviewModal(false);
    setPreviewSaveOpen(false);
    setPreviewDownloadOpen(false);
    setPreviewAnswerMode("answers");
    setSaveFolderIds([]);
    setReviewingDocumentId("");
    setReviewDraftById({});
    setDocumentSearchText("");
  }, [workspaceId, subjectId]);

  useEffect(() => {
    const approvedIds = new Set(approvedDocuments.map((document) => document.id));
    setContentDocumentIds((previous) => previous.filter((id) => approvedIds.has(id)));
    setReferenceDocumentIds((previous) => previous.filter((id) => approvedIds.has(id)));
  }, [approvedDocuments]);

  useEffect(() => {
    function handleOutsideMenuClick(event) {
      if (event.target.closest(".quiz-preview-actions")) return;
      setPreviewDownloadOpen(false);
      setPreviewSaveOpen(false);
    }

    window.addEventListener("click", handleOutsideMenuClick);
    return () => window.removeEventListener("click", handleOutsideMenuClick);
  }, []);

  function getFolderDocumentIds(folderId) {
    const candidateFolderIds = descendantsByFolderId.get(folderId) || [folderId];
    const candidateSet = new Set(candidateFolderIds);
    return approvedDocuments
      .filter((document) => {
        const docFolderIds = getDocumentFolderIds(document);
        return docFolderIds.some((id) => candidateSet.has(id));
      })
      .map((document) => document.id);
  }

  function toggleFolderDocs(folderId, targetSetter, currentDocIds) {
    const folderDocIds = getFolderDocumentIds(folderId);
    if (!folderDocIds.length) return;

    const allSelected = folderDocIds.every((id) => currentDocIds.includes(id));
    targetSetter((previous) => {
      if (allSelected) {
        return previous.filter((id) => !folderDocIds.includes(id));
      }
      return Array.from(new Set([...previous, ...folderDocIds]));
    });
  }

  function isFolderFullySelected(folderId, selectedDocIds) {
    const folderDocIds = getFolderDocumentIds(folderId);
    if (!folderDocIds.length) return false;
    return folderDocIds.every((id) => selectedDocIds.includes(id));
  }

  function addUploadTag(mode) {
    if (mode === "content") {
      const nextTag = String(contentUploadTagDraft || "").trim();
      if (!nextTag) return;
      setContentUploadTags((previous) => (previous.includes(nextTag) ? previous : [...previous, nextTag]));
      setContentUploadTagDraft("");
      return;
    }

    const nextTag = String(referenceUploadTagDraft || "").trim();
    if (!nextTag) return;
    setReferenceUploadTags((previous) => (previous.includes(nextTag) ? previous : [...previous, nextTag]));
    setReferenceUploadTagDraft("");
  }

  async function handleUploadDocuments(mode) {
    if (!toolContext?.onUploadTxt || !subjectId) return;

    const pendingFiles = mode === "content" ? contentPendingFiles : referencePendingFiles;
    if (!pendingFiles.length) return;

    const folderIds = mode === "content" ? contentUploadFolderIds : referenceUploadFolderIds;
    const tags = mode === "content" ? contentUploadTags : referenceUploadTags;

    if (mode === "content") {
      setIsUploadingContent(true);
    } else {
      setIsUploadingReference(true);
    }

    setErrorMessage("");

    try {
      await toolContext.onUploadTxt(pendingFiles, {
        folderIds,
        tags,
        quality: {
          strict: true,
          minConfidence: 0.72
        }
      });

      if (mode === "content") {
        setContentPendingFiles([]);
        setContentUploadFolderIds([]);
        setContentUploadTags([]);
        setContentUploadTagDraft("");
        setShowContentUploader(false);
      } else {
        setReferencePendingFiles([]);
        setReferenceUploadFolderIds([]);
        setReferenceUploadTags([]);
        setReferenceUploadTagDraft("");
        setShowReferenceUploader(false);
      }
    } catch (error) {
      setErrorMessage(String(error.message || error));
    } finally {
      if (mode === "content") {
        setIsUploadingContent(false);
      } else {
        setIsUploadingReference(false);
      }
    }
  }

  async function handleReviewDecision(documentId, decision) {
    if (!toolContext?.onReviewDocumentExtraction || !documentId) return;
    const correctedContent = String(reviewDraftById[documentId] || "").trim();

    setReviewingDocumentId(documentId);
    setErrorMessage("");
    try {
      await toolContext.onReviewDocumentExtraction(documentId, {
        decision,
        correctedContent
      });
      if (decision === "approved") {
        setReviewDraftById((previous) => ({ ...previous, [documentId]: "" }));
      }
    } catch (error) {
      setErrorMessage(String(error.message || error));
    } finally {
      setReviewingDocumentId("");
    }
  }

  async function handleGenerateQuiz() {
    if (!subjectId || !questionTypes.length) return;

    setIsGenerating(true);
    setErrorMessage("");

    try {
      const referenceDocNames = documents
        .filter((document) => referenceDocumentIds.includes(document.id))
        .map((document) => document.name)
        .slice(0, 6)
        .join(", ");

      const enhancedPrompt = referenceDocNames
        ? `${topicPrompt}\n\nReference exam style documents: ${referenceDocNames}`
        : topicPrompt;

      const response = await fetch("/api/ai-tools/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            title: quizTitle,
            topicPrompt: enhancedPrompt,
            difficulty,
            questionCount,
            questionTypes,
            scope: {
              workspaceId,
              subjectId,
              folderIds: [],
              documentIds: contentDocumentIds,
              tagNames: []
            }
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Quiz generation failed");
      }

      setResult(data);
      setPreviewAnswerMode("answers");
      setWizardStep(4);
      setShowPreviewModal(true);
    } catch (error) {
      setErrorMessage(String(error.message || error));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSaveGeneratedQuiz() {
    if (!result || !onSaveGeneratedQuizDocument || !subjectId) return;
    setIsSaving(true);
    setErrorMessage("");

    try {
      const textContent = decodeBase64Utf8(result.downloads.txt);
      const savedDocument = await onSaveGeneratedQuizDocument({
        folderIds: saveFolderIds,
        tags: [],
        file: {
          name: buildGeneratedQuizFilename(result.quizJson),
          content: textContent,
          sizeBytes: textContent.length
        },
        downloads: result.downloads
      });

      if (!savedDocument) {
        throw new Error("Generated quiz could not be saved to the workspace.");
      }

      setResult((previous) => ({ ...previous, savedDocument }));
      setPreviewSaveOpen(false);
    } catch (error) {
      setErrorMessage(String(error.message || error));
    } finally {
      setIsSaving(false);
    }
  }

  function goNextWizardStep() {
    setWizardStep((previous) => Math.min(4, previous + 1));
  }

  function goBackWizardStep() {
    setWizardStep((previous) => Math.max(1, previous - 1));
  }

  function goNextQuestionStep() {
    if (questionStep < 5) {
      setQuestionStep((previous) => previous + 1);
      return;
    }
    setWizardStep(3);
  }

  function goBackQuestionStep() {
    if (questionStep > 1) {
      setQuestionStep((previous) => previous - 1);
      return;
    }
    setWizardStep(1);
  }

  function openWizard() {
    setWizardOpen(true);
    setWizardStep(1);
    setQuestionStep(1);
    setErrorMessage("");
  }

  function closeWizard() {
    setWizardOpen(false);
  }

  function renderDocumentPicker(selectedIds, setSelectedIds, modeLabel, description, tone = "content") {
    const search = documentSearchText.trim().toLowerCase();
    const visibleDocuments = approvedDocuments.filter((document) => !search || String(document.name || "").toLowerCase().includes(search));
    return (
      <div className={`selection-box quiz-doc-picker-box quiz-doc-picker-${tone}`}>
        <div className="quiz-picker-heading">
          <div>
            <span className="quiz-picker-kicker">{tone === "content" ? "Main material" : "Question style"}</span>
            <h5 style={{ margin: "3px 0 0" }}>{modeLabel}</h5>
            <p className="hint quiz-mini-copy">{description}</p>
          </div>
          <strong className="quiz-selection-count">{selectedIds.length} selected</strong>
        </div>
        <div className="quiz-section-grid">
          <div>
            <div className="quiz-folder-pick-list">
              {folders.map((folder) => {
                const selected = isFolderFullySelected(folder.id, selectedIds);
                return (
                  <label className="quiz-picker-row" key={`${modeLabel}-${folder.id}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleFolderDocs(folder.id, setSelectedIds, selectedIds)}
                    />
                    <span className="scope-chip">{folderLabels.get(folder.id) || folder.name}</span>
                  </label>
                );
              })}
              {!folders.length ? <p className="hint">No folders available.</p> : null}
            </div>

            <div className="quiz-doc-select-list">
              {visibleDocuments.map((document) => {
                const selected = selectedIds.includes(document.id);
                return (
                  <label className={selected ? "quiz-picker-row on" : "quiz-picker-row"} key={`${modeLabel}-${document.id}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleInList(document.id, setSelectedIds)}
                    />
                    <span>{document.name}</span>
                  </label>
                );
              })}
              {!visibleDocuments.length ? <p className="hint">{search ? "No matching approved documents." : "No approved documents yet."}</p> : null}
            </div>
            <button className="table-btn quiz-upload-link" type="button" onClick={() => tone === "content" ? setShowContentUploader((previous) => !previous) : setShowReferenceUploader((previous) => !previous)}>
              {tone === "content" ? "+ Add main documents" : "+ Add reference documents"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderReviewQueue() {
    return (
      <div className="selection-box quiz-doc-picker-box">
        <h5 style={{ marginTop: 0 }}>Review Queue (Required for exam reliability)</h5>
        <p className="hint quiz-mini-copy">
          Documents in needs review or rejected state are blocked from quiz generation until approved.
        </p>

        {!flaggedDocuments.length ? (
          <p className="hint">No documents pending review.</p>
        ) : (
          <div className="quiz-doc-select-list">
            {flaggedDocuments.map((document) => {
              const isBusy = reviewingDocumentId === document.id;
              const statusLabel = String(document.reviewStatus || "needs_review").replace("_", " ");
              const confidence = Number(document.extractionConfidence || 0);
              const issueText = Array.isArray(document.extractionIssues) && document.extractionIssues.length
                ? document.extractionIssues.join(", ")
                : "No issues listed";

              return (
                <div className="quiz-picker-row" key={`review-${document.id}`} style={{ alignItems: "flex-start", flexDirection: "column" }}>
                  <div style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                    <strong>{document.name}</strong>
                    <span className="scope-chip">{statusLabel}</span>
                  </div>
                  <p className="hint" style={{ margin: "4px 0" }}>
                    Method: {document.extractionMethod || "unknown"} · Confidence: {(confidence * 100).toFixed(1)}%
                  </p>
                  <p className="hint" style={{ margin: "0 0 8px" }}>Issues: {issueText}</p>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Optional: paste corrected extraction text before approving"
                    value={reviewDraftById[document.id] || ""}
                    onChange={(event) => setReviewDraftById((previous) => ({ ...previous, [document.id]: event.target.value }))}
                    disabled={isBusy}
                  />
                  <div className="inline-actions" style={{ marginTop: "8px" }}>
                    <button className="primary-btn" type="button" onClick={() => handleReviewDecision(document.id, "approved")} disabled={isBusy}>
                      {isBusy ? "Saving..." : "Approve For Quiz"}
                    </button>
                    <button className="table-btn" type="button" onClick={() => handleReviewDecision(document.id, "needs_review")} disabled={isBusy}>
                      Keep In Review
                    </button>
                    <button className="table-btn danger" type="button" onClick={() => handleReviewDecision(document.id, "rejected")} disabled={isBusy}>
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderUploadPanel(mode) {
    const isContent = mode === "content";
    const showPanel = isContent ? showContentUploader : showReferenceUploader;
    const pendingFiles = isContent ? contentPendingFiles : referencePendingFiles;
    const folderIds = isContent ? contentUploadFolderIds : referenceUploadFolderIds;
    const selectedTags = isContent ? contentUploadTags : referenceUploadTags;
    const tagDraft = isContent ? contentUploadTagDraft : referenceUploadTagDraft;
    const isUploading = isContent ? isUploadingContent : isUploadingReference;

    if (!showPanel) return null;

    return (
      <div className="selection-box quiz-upload-box-lite">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <h5 style={{ margin: 0 }}>Upload new files to workspace</h5>
          <button
            className="table-btn"
            type="button"
            onClick={() => (isContent ? setShowContentUploader((previous) => !previous) : setShowReferenceUploader((previous) => !previous))}
          >
            {showPanel ? "Hide" : "Open Upload"}
          </button>
        </div>

        {showPanel ? (
          <div className="quiz-upload-panel">
            <label className="upload-box">
              <span>Select files</span>
              <input
                type="file"
                accept="*/*"
                multiple
                onChange={(event) => {
                  const nextFiles = Array.from(event.target.files || []);
                  if (isContent) {
                    setContentPendingFiles(nextFiles);
                  } else {
                    setReferencePendingFiles(nextFiles);
                  }
                }}
              />
            </label>

            <div>
              <div className="quiz-filter-label">Save into folders</div>
              <div className="chip-stack finder-upload-folders">
                {folders.map((folder) => (
                  <label className="scope-chip-row" key={`${mode}-upload-folder-${folder.id}`}>
                    <input
                      type="checkbox"
                      checked={folderIds.includes(folder.id)}
                      onChange={() => {
                        if (isContent) {
                          toggleInList(folder.id, setContentUploadFolderIds);
                        } else {
                          toggleInList(folder.id, setReferenceUploadFolderIds);
                        }
                      }}
                    />
                    <span className="scope-chip">{folderLabels.get(folder.id) || folder.name}</span>
                  </label>
                ))}
                {!folders.length ? <p className="hint">No folders in this subject.</p> : null}
              </div>
            </div>

            <div>
              <div className="quiz-filter-label">Tags</div>
              <div className="inline-actions">
                <input
                  className="input"
                  value={tagDraft}
                  onChange={(event) => {
                    if (isContent) {
                      setContentUploadTagDraft(event.target.value);
                    } else {
                      setReferenceUploadTagDraft(event.target.value);
                    }
                  }}
                  placeholder="Add a tag"
                />
                <button className="table-btn" type="button" onClick={() => addUploadTag(mode)}>Add Tag</button>
              </div>
              <div className="chip-wrap" style={{ marginTop: "8px" }}>
                {selectedTags.map((tagName) => (
                  <span className="scope-chip tag-picked" key={`${mode}-tag-${tagName}`}>
                    {tagName}
                    <button
                      type="button"
                      className="tag-remove-btn"
                      onClick={() => {
                        if (isContent) {
                          setContentUploadTags((previous) => previous.filter((item) => item !== tagName));
                        } else {
                          setReferenceUploadTags((previous) => previous.filter((item) => item !== tagName));
                        }
                      }}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <button className="primary-btn" type="button" onClick={() => handleUploadDocuments(mode)} disabled={isUploading || !pendingFiles.length}>
              {isUploading ? "Uploading..." : "Upload to Workspace"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderQuestionStep() {
    if (questionStep === 1) {
      return (
        <div className="selection-box quiz-question-card">
          <h5 style={{ marginTop: 0 }}>1. Quiz title</h5>
          <p className="hint quiz-mini-copy">Name your quiz clearly so students recognize the exam immediately.</p>
          <input className="input" value={quizTitle} onChange={(event) => setQuizTitle(event.target.value)} placeholder="Example: Calculus Midterm Review" />
        </div>
      );
    }

    if (questionStep === 2) {
      return (
        <div className="selection-box quiz-question-card">
          <h5 style={{ marginTop: 0 }}>2. Topic focus / prompt</h5>
          <p className="hint quiz-mini-copy">Give extra context here if you want to target a specific part of the content instead of the full document.</p>
          <textarea
            className="input"
            rows={4}
            value={topicPrompt}
            onChange={(event) => setTopicPrompt(event.target.value)}
            placeholder="Example: Focus on integration by parts and common mistakes from chapter 4."
          />
        </div>
      );
    }

    if (questionStep === 3) {
      return (
        <div className="selection-box quiz-question-card">
          <h5 style={{ marginTop: 0 }}>3. Number of questions</h5>
          <p className="hint quiz-mini-copy">Type any number to control quiz length.</p>
          <input
            className="input"
            type="number"
            min="1"
            value={questionCount}
            onChange={(event) => {
              const next = Number(event.target.value || 1);
              setQuestionCount(Number.isFinite(next) && next > 0 ? next : 1);
            }}
            placeholder="Example: 15"
          />
        </div>
      );
    }

    if (questionStep === 4) {
      return (
        <div className="selection-box quiz-question-card">
          <h5 style={{ marginTop: 0 }}>4. Difficulty</h5>
          <p className="hint quiz-mini-copy">Choose the challenge level for your learners.</p>
          <div className="quiz-question-card-grid">
            {DIFFICULTY_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={difficulty === option.value ? "quiz-choice-card on" : "quiz-choice-card"}
                type="button"
                onClick={() => setDifficulty(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="selection-box quiz-question-card">
        <h5 style={{ marginTop: 0 }}>5. Question types</h5>
        <p className="hint quiz-mini-copy">Pick one or more formats. Mixed formats usually feel closer to real exams.</p>
        <div className="quiz-question-card-grid">
          {QUESTION_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={questionTypes.includes(option.value) ? "quiz-choice-card on" : "quiz-choice-card"}
              type="button"
              onClick={() => toggleInList(option.value, setQuestionTypes)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="view-stack quiz-tool-page">
      <article className="quiz-hero">
        <div className="quiz-hero-copy">
          <div className="quiz-hero-badges">
            <span className="quiz-hero-kicker">AI Quiz Generator</span>
          </div>
          <h3>Hi, Luna! Turn documents into a playful quiz experience.</h3>
          <p>
            Build a quiz in guided steps: choose document sources, define questions one decision at a time, then generate and export.
          </p>
        </div>
      </article>

      <article className="panel quiz-top-tracker">
        <div className="quiz-top-track-item">
          <span>1</span>
          <strong>Upload Documents</strong>
          <small>Content + reference files</small>
        </div>
        <div className="quiz-top-track-item">
          <span>2</span>
          <strong>Define Questions</strong>
          <small>Title, focus, count, difficulty, types</small>
        </div>
        <div className="quiz-top-track-item">
          <span>3</span>
          <strong>Export</strong>
          <small>TXT, JSON, HTML, DOCX, PDF</small>
        </div>
      </article>

      <div className="quiz-launch-cta">
        <button className="primary-btn" type="button" onClick={openWizard}>Lets Generate a Quiz</button>
      </div>

      {errorMessage ? <p className="hint" style={{ color: "#b84a77" }}>{errorMessage}</p> : null}

      {wizardOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card quiz-wizard-modal">
            <div className="modal-head">
              <h4>Quiz Builder</h4>
              <button className="table-btn" type="button" onClick={closeWizard}>Close</button>
            </div>

            <div className="quiz-wizard-tracker">
              <button className={wizardStep === 1 ? "quiz-step current" : "quiz-step done"} type="button" onClick={() => setWizardStep(1)}>
                <span className="quiz-step-index">1</span>
                <span className="quiz-step-copy"><strong>Documents</strong><small>{contentDocCount} content, {referenceDocCount} reference</small></span>
              </button>
              <button className={wizardStep === 2 ? "quiz-step current" : `quiz-step ${quizTitle || topicPrompt ? "done" : ""}`.trim()} type="button" onClick={() => setWizardStep(2)}>
                <span className="quiz-step-index">2</span>
                <span className="quiz-step-copy"><strong>Questions</strong><small>Guided setup</small></span>
              </button>
              <button className={wizardStep === 3 ? "quiz-step current" : `quiz-step ${result ? "done" : ""}`.trim()} type="button" onClick={() => setWizardStep(3)}>
                <span className="quiz-step-index">3</span>
                <span className="quiz-step-copy"><strong>Generate</strong><small>Review and run</small></span>
              </button>
              <button className={wizardStep === 4 ? "quiz-step current" : `quiz-step ${result ? "done" : ""}`.trim()} type="button" onClick={() => setWizardStep(4)}>
                <span className="quiz-step-index">4</span>
                <span className="quiz-step-copy"><strong>Export</strong><small>Preview and actions</small></span>
              </button>
            </div>

            <div className="quiz-wizard-pane">
              {wizardStep === 1 ? (
                <div className="view-stack">
                  {renderReviewQueue()}
                  <div className="quiz-materials-toolbar">
                    <div>
                      <span className="quiz-picker-kicker">Step 1</span>
                      <h5 style={{ margin: "3px 0 0" }}>Select content</h5>
                      <p className="hint quiz-mini-copy">Choose the material the AI should learn from, then add optional documents that show the question style and level you want.</p>
                    </div>
                    <label className="search quiz-document-search">
                      <span>Search documents</span>
                      <input className="input" value={documentSearchText} onChange={(event) => setDocumentSearchText(event.target.value)} placeholder="Search by filename" />
                    </label>
                  </div>
                  <div className="quiz-document-pair">
                    {renderDocumentPicker(
                      contentDocumentIds,
                      setContentDocumentIds,
                      "Documents for quiz content",
                      "Questions are generated from the files selected here.",
                      "content"
                    )}
                    {renderDocumentPicker(
                      referenceDocumentIds,
                      setReferenceDocumentIds,
                      "Reference documents",
                      "Use these to guide question format, tone, and difficulty. They are not the main source material.",
                      "reference"
                    )}
                  </div>
                  {renderUploadPanel("content")}
                  {renderUploadPanel("reference")}

                  <div className="inline-actions quiz-step-actions">
                    <span className="hint">Tip: select complete folders first, then uncheck single files if needed.</span>
                    <button className="primary-btn" type="button" onClick={goNextWizardStep}>Next: Questions</button>
                  </div>
                </div>
              ) : null}

              {wizardStep === 2 ? (
                <div className="view-stack">
                  {renderQuestionStep()}
                  <div className="inline-actions quiz-step-actions">
                    <button className="table-btn" type="button" onClick={goBackQuestionStep}>Back</button>
                    <button className="primary-btn" type="button" onClick={goNextQuestionStep} disabled={questionStep === 5 && !questionTypes.length}>
                      {questionStep < 5 ? "Next" : "Next: Generate"}
                    </button>
                  </div>
                </div>
              ) : null}

              {wizardStep === 3 ? (
                <div className="view-stack">
                  <div className="selection-box quiz-question-card">
                    <h5 style={{ marginTop: 0 }}>Ready to generate</h5>
                    <p className="hint quiz-mini-copy">Review the summary, then click generate.</p>
                    <div className="quiz-result-summary">
                      <div className="quiz-summary-card">
                        <span>Content docs</span>
                        <strong>{contentDocCount || "None selected"}</strong>
                      </div>
                      <div className="quiz-summary-card">
                        <span>Reference docs</span>
                        <strong>{referenceDocCount || "None selected"}</strong>
                      </div>
                      <div className="quiz-summary-card">
                        <span>Questions</span>
                        <strong>{questionCount} ({difficulty})</strong>
                      </div>
                    </div>
                    <div className="quiz-summary-card" style={{ marginTop: "10px" }}>
                      <span>Question types</span>
                      <strong>{questionTypes.join(", ") || "None"}</strong>
                    </div>
                  </div>
                  <div className="inline-actions quiz-step-actions">
                    <button className="table-btn" type="button" onClick={goBackWizardStep}>Back</button>
                    <button className="primary-btn" type="button" onClick={handleGenerateQuiz} disabled={isGenerating || !subjectId || !questionTypes.length || !contentDocumentIds.length}>
                      {isGenerating ? "Generating..." : "Generate Quiz"}
                    </button>
                  </div>
                </div>
              ) : null}

              {wizardStep === 4 ? (
                <div className="view-stack">
                  <div className="selection-box quiz-question-card">
                    <h5 style={{ marginTop: 0 }}>Export and save</h5>
                    <p className="hint quiz-mini-copy">Open preview, then use Download and Save To Workspace buttons.</p>
                    <div className="inline-actions">
                      <button className="primary-btn" type="button" onClick={() => setShowPreviewModal(true)} disabled={!result}>Open Preview Window</button>
                    </div>
                    {!result ? <p className="hint" style={{ marginTop: "8px" }}>Generate a quiz first.</p> : null}
                  </div>
                  <div className="inline-actions quiz-step-actions">
                    <button className="table-btn" type="button" onClick={goBackWizardStep}>Back</button>
                    <button className="table-btn" type="button" onClick={closeWizard}>Done</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showPreviewModal && result ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card quiz-preview-modal-card">
            <div className="quiz-preview-modal-head">
              <h4 style={{ margin: 0 }}>Quiz Preview</h4>
              <div className="quiz-preview-actions">
                <div className="quiz-preview-mode-toggle" role="group" aria-label="Preview mode">
                  <button className={previewAnswerMode === "answers" ? "primary-btn" : "table-btn"} type="button" onClick={() => setPreviewAnswerMode("answers")}>With answers</button>
                  <button className={previewAnswerMode === "interactive" ? "primary-btn" : "table-btn"} type="button" onClick={() => setPreviewAnswerMode("interactive")}>Quiz view</button>
                </div>
                <button
                  className="table-btn"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewDownloadOpen((previous) => !previous);
                    setPreviewSaveOpen(false);
                  }}
                >
                  Download
                </button>
                <button
                  className="table-btn"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewSaveOpen((previous) => !previous);
                    setPreviewDownloadOpen(false);
                  }}
                >
                  Save To Workspace
                </button>
                {previewDownloadOpen ? (
                  <div className="quiz-submenu-stack">
                    <strong className="quiz-download-heading">With answers</strong>
                    <button className="table-btn" type="button" onClick={() => downloadBase64File(result.downloads.txt, "quiz-with-answers.txt", "text/plain")}>TXT</button>
                    <button className="table-btn" type="button" onClick={() => downloadBase64File(result.downloads.json, "quiz-with-answers.json", "application/json")}>JSON</button>
                    <button className="table-btn" type="button" onClick={() => downloadBase64File(result.downloads.html, "quiz-with-answers.html", "text/html")}>HTML</button>
                    <button className="table-btn" type="button" onClick={() => downloadBase64File(result.downloads.docx, "quiz-with-answers.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}>DOCX</button>
                    <button className="table-btn" type="button" onClick={() => downloadBase64File(result.downloads.pdf, "quiz-with-answers.pdf", "application/pdf")}>PDF</button>
                    <strong className="quiz-download-heading">Without answers</strong>
                    <button className="table-btn" type="button" onClick={() => downloadBase64File(result.studentDownloads.txt, "quiz-without-answers.txt", "text/plain")}>TXT</button>
                    <button className="table-btn" type="button" onClick={() => downloadBase64File(result.studentDownloads.json, "quiz-without-answers.json", "application/json")}>JSON</button>
                    <button className="table-btn" type="button" onClick={() => downloadBase64File(result.studentDownloads.html, "quiz-quiz-view.html", "text/html")}>HTML</button>
                    <button className="table-btn" type="button" onClick={() => downloadBase64File(result.studentDownloads.docx, "quiz-without-answers.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}>DOCX</button>
                    <button className="table-btn" type="button" onClick={() => downloadBase64File(result.studentDownloads.pdf, "quiz-without-answers.pdf", "application/pdf")}>PDF</button>
                  </div>
                ) : null}
                {previewSaveOpen ? (
                  <div className="quiz-submenu-stack quiz-save-options">
                    <p className="hint" style={{ margin: 0 }}>Choose folders (or none for unfiled):</p>
                    <div className="chip-stack">
                      {folders.map((folder) => (
                        <label className="scope-chip-row" key={`preview-save-${folder.id}`}>
                          <input type="checkbox" checked={saveFolderIds.includes(folder.id)} onChange={() => toggleInList(folder.id, setSaveFolderIds)} />
                          <span className="scope-chip">{folderLabels.get(folder.id) || folder.name}</span>
                        </label>
                      ))}
                      {!folders.length ? <p className="hint">No folders available. It will be saved as unfiled.</p> : null}
                    </div>
                    <button className="primary-btn" type="button" onClick={handleSaveGeneratedQuiz} disabled={isSaving || Boolean(result.savedDocument)}>
                      {result.savedDocument ? "Saved" : (isSaving ? "Saving..." : "Save to Workspace")}
                    </button>
                  </div>
                ) : null}
              </div>
              <button className="table-btn" type="button" onClick={() => setShowPreviewModal(false)}>Close</button>
            </div>

            <div className="quiz-preview-card" dangerouslySetInnerHTML={{ __html: previewAnswerMode === "interactive" ? result.studentHtmlPreview : result.htmlPreview }} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
