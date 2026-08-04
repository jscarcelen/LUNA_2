"use client";

import { useEffect, useMemo, useState } from "react";
import { buildFolderPathMap } from "../../../core";

const QUESTION_TYPE_OPTIONS = [
  { value: "multiple-choice", label: "Multiple choice" },
  { value: "true-false", label: "True / False" },
  { value: "short-answer", label: "Short answer" }
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

export function QuizGeneratorToolPage({ toolContext }) {
  const workspaces = toolContext?.workspaces || [];
  const defaultWorkspaceId = toolContext?.selectedWorkspaceId || workspaces[0]?.id || "";

  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [subjectId, setSubjectId] = useState(toolContext?.selectedSubjectId || "");
  const [selectedFolderIds, setSelectedFolderIds] = useState([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [selectedTagNames, setSelectedTagNames] = useState([]);
  const [quizTitle, setQuizTitle] = useState("");
  const [topicPrompt, setTopicPrompt] = useState("");
  const [questionCount, setQuestionCount] = useState(6);
  const [difficulty, setDifficulty] = useState("medium");
  const [chunkWords, setChunkWords] = useState(500);
  const [overlapWords, setOverlapWords] = useState(150);
  const [questionTypes, setQuestionTypes] = useState(["multiple-choice"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) || null,
    [workspaces, workspaceId]
  );

  const subjects = selectedWorkspace?.subjects || [];
  const selectedSubject = subjects.find((subject) => subject.id === subjectId) || null;
  const folders = selectedSubject?.folders || [];
  const documents = selectedSubject?.documents || [];
  const topicTags = selectedSubject?.topicTags || [];
  const folderLabels = useMemo(() => buildFolderPathMap(folders), [folders]);

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
    setSelectedFolderIds([]);
    setSelectedDocumentIds([]);
    setSelectedTagNames([]);
  }, [workspaceId, subjectId]);

  function toggleSelection(value, setter) {
    setter((previous) => (
      previous.includes(value)
        ? previous.filter((item) => item !== value)
        : [...previous, value]
    ));
  }

  async function handleGenerateQuiz() {
    setIsGenerating(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/ai-tools/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            title: quizTitle,
            topicPrompt,
            difficulty,
            questionCount,
            questionTypes,
            chunking: {
              chunkWords,
              overlapWords
            },
            scope: {
              workspaceId,
              subjectId,
              folderIds: selectedFolderIds,
              documentIds: selectedDocumentIds,
              tagNames: selectedTagNames
            }
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Quiz generation failed");
      }

      setResult(data);
    } catch (error) {
      setErrorMessage(String(error.message || error));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="view-stack">
      <article className="panel">
        <h4>Quiz Configuration</h4>
        <p className="hint">Choose the exact study scope, question format, and topic prompt. The pipeline chunks the selected documents, ranks the best context, and generates a structured quiz JSON that also renders to HTML, DOCX, and PDF.</p>

        <div className="panel-grid two">
          <label className="form-stack">
            <span className="field-label">Workspace</span>
            <select className="input" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          </label>

          <label className="form-stack">
            <span className="field-label">Subject</span>
            <select className="input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="panel-grid two">
          <label className="form-stack">
            <span className="field-label">Quiz title</span>
            <input className="input" value={quizTitle} onChange={(event) => setQuizTitle(event.target.value)} placeholder="e.g. Calculus Midterm Review" />
          </label>

          <label className="form-stack">
            <span className="field-label">Topic focus / prompt</span>
            <input className="input" value={topicPrompt} onChange={(event) => setTopicPrompt(event.target.value)} placeholder="e.g. Integration by parts and common mistakes" />
          </label>
        </div>

        <div className="panel-grid three">
          <label className="form-stack">
            <span className="field-label">Questions</span>
            <input className="input" type="number" min="1" max="20" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value || 6))} />
          </label>
          <label className="form-stack">
            <span className="field-label">Difficulty</span>
            <select className="input" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <div className="form-stack">
            <span className="field-label">Question types</span>
            <div className="chip-wrap">
              {QUESTION_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={questionTypes.includes(option.value) ? "table-btn view-on" : "table-btn"}
                  type="button"
                  onClick={() => toggleSelection(option.value, setQuestionTypes)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="panel-grid two">
          <label className="form-stack">
            <span className="field-label">Chunk size (words)</span>
            <input className="input" type="number" min="150" max="900" value={chunkWords} onChange={(event) => setChunkWords(Number(event.target.value || 500))} />
          </label>
          <label className="form-stack">
            <span className="field-label">Chunk overlap (words)</span>
            <input className="input" type="number" min="50" max="300" value={overlapWords} onChange={(event) => setOverlapWords(Number(event.target.value || 150))} />
          </label>
        </div>

        <div className="panel-grid two" style={{ marginTop: "14px" }}>
          <div className="selection-box">
            <h5>Folders / Subfolders</h5>
            <div className="chip-stack">
              {folders.map((folder) => (
                <label className="scope-chip-row" key={folder.id}>
                  <input
                    type="checkbox"
                    checked={selectedFolderIds.includes(folder.id)}
                    onChange={() => toggleSelection(folder.id, setSelectedFolderIds)}
                  />
                  <span className="scope-chip">{folderLabels.get(folder.id) || folder.name}</span>
                </label>
              ))}
              {!folders.length ? <p className="hint">No folders in this subject.</p> : null}
            </div>
          </div>

          <div className="selection-box">
            <h5>Topic tags</h5>
            <div className="chip-wrap">
              {topicTags.map((tag) => (
                <button
                  key={tag.name}
                  className={selectedTagNames.includes(tag.name) ? "table-btn view-on" : "table-btn"}
                  type="button"
                  onClick={() => toggleSelection(tag.name, setSelectedTagNames)}
                >
                  #{tag.name}
                </button>
              ))}
              {!topicTags.length ? <p className="hint">No topic tags yet.</p> : null}
            </div>
          </div>
        </div>

        <div className="selection-box" style={{ marginTop: "14px" }}>
          <h5>Documents</h5>
          <div className="chip-stack">
            {documents.map((document) => (
              <label className="scope-chip-row" key={document.id}>
                <input
                  type="checkbox"
                  checked={selectedDocumentIds.includes(document.id)}
                  onChange={() => toggleSelection(document.id, setSelectedDocumentIds)}
                />
                <span className="scope-chip">{document.name}</span>
              </label>
            ))}
            {!documents.length ? <p className="hint">No uploaded documents in this subject.</p> : null}
          </div>
        </div>

        <div className="inline-actions" style={{ marginTop: "16px" }}>
          <button className="primary-btn" type="button" onClick={handleGenerateQuiz} disabled={isGenerating || !subjectId || !questionTypes.length}>
            {isGenerating ? "Generating Quiz..." : "Generate Quiz"}
          </button>
          <span className="hint">If no folders or documents are checked, the pipeline uses all documents in the selected subject.</span>
        </div>

        {errorMessage ? <p className="hint" style={{ color: "#ffd3f2" }}>{errorMessage}</p> : null}
      </article>

      {result ? (
        <>
          <article className="panel accent">
            <h4 style={{ marginTop: 0 }}>Pipeline Summary</h4>
            <p className="hint">Documents used: {result.retrieval.selectedDocumentCount} · Chunks ranked: {result.retrieval.selectedChunkCount}</p>
            <p className="hint">Top source documents: {result.retrieval.chunkDocuments.join(", ")}</p>
            <div className="inline-actions quiz-export-bar">
              <button className="table-btn" type="button" onClick={() => downloadBase64File(result.downloads.json, "quiz.json", "application/json")}>Download JSON</button>
              <button className="table-btn" type="button" onClick={() => downloadBase64File(result.downloads.html, "quiz.html", "text/html")}>Download HTML</button>
              <button className="table-btn" type="button" onClick={() => downloadBase64File(result.downloads.docx, "quiz.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}>Download Word</button>
              <button className="table-btn" type="button" onClick={() => downloadBase64File(result.downloads.pdf, "quiz.pdf", "application/pdf")}>Download PDF</button>
            </div>
          </article>

          <article className="panel">
            <h4>Website Preview</h4>
            <div className="quiz-preview-card" dangerouslySetInnerHTML={{ __html: result.htmlPreview }} />
          </article>
        </>
      ) : null}
    </section>
  );
}
