import { useState } from "react";
import { kpiCards } from "./data";
import {
  buildFolderChildrenMap,
  buildFolderPathMap,
  DEFAULT_SUBJECT_COLOR,
  DEFAULT_TOPIC_TAG_COLOR,
  DEFAULT_WORKSPACE_COLOR,
  filterDocuments,
  flattenFolders,
  getDocumentFolderIds,
  normalizeSubjectColor,
  normalizeTagName,
  normalizeTopicTagColor,
  splitDocumentsByFolder,
  normalizeWorkspaceColor
} from "../modules/core";

function getUploadedDocuments(documents = []) {
  return documents.filter((doc) => doc.sourceType !== "generated");
}

function getGeneratedDocuments(documents = []) {
  return documents.filter((doc) => doc.sourceType === "generated");
}

const WORKSPACES_API = "/api/workspaces-supabase";

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

function ScopeBar({ label = "Scope" }) {
  return (
    <div className="scope-bar">
      <b>{label}</b>
      <span>Workspace: High School 2024</span>
      <span>Subject: Mathematics</span>
      <span>Folder: Calculus</span>
      <span>Tags: Exam 1, Hard</span>
    </div>
  );
}

export function DashboardView() {
  return (
    <section className="view-stack">
      <div className="kpi-grid">
        {kpiCards.map((card) => (
          <article className={"kpi-card " + card.tone} key={card.label}>
            <p>{card.label}</p>
            <h3>{card.value}</h3>
            <small>{card.trend}</small>
          </article>
        ))}
      </div>

      <div className="panel-grid three">
        <article className="panel">
          <h4>Weak Skill</h4>
          <p>Integration by Parts</p>
          <div className="meter"><span style={{ width: "41%" }} /></div>
          <button className="ghost-btn">Practice</button>
        </article>
        <article className="panel">
          <h4>Needs Review</h4>
          <p>Cellular Respiration</p>
          <div className="meter"><span style={{ width: "63%" }} /></div>
          <button className="ghost-btn">Review</button>
        </article>
        <article className="panel">
          <h4>Strong</h4>
          <p>Linear Equations</p>
          <div className="meter"><span style={{ width: "94%" }} /></div>
          <button className="ghost-btn">Challenge</button>
        </article>
      </div>

      <div className="panel-grid two">
        <article className="panel">
          <h4>Recent Activity</h4>
          <ul className="line-list">
            <li>Quiz completed: Calculus Ch.4 (18/20)</li>
            <li>Summary generated: Biology Notes</li>
            <li>Uploaded: Exam_2023.pdf indexed</li>
            <li>Agent purchased: GMAT Coach</li>
          </ul>
        </article>
        <article className="panel">
          <h4>Quick Actions</h4>
          <div className="chip-grid">
            <button className="chip">Generate Quiz</button>
            <button className="chip">Make Summary</button>
            <button className="chip">Flashcards</button>
            <button className="chip">Ask Tutor</button>
            <button className="chip">Upload Doc</button>
            <button className="chip">Browse Agents</button>
          </div>
        </article>
      </div>

      <div className="panel-grid three">
        <article className="panel">
          <h4>Mastery</h4>
          <h3>78%</h3>
          <p className="hint">Up 12% this month</p>
        </article>
        <article className="panel">
          <h4>Strong</h4>
          <ul className="line-list">
            <li>Derivatives: 91%</li>
            <li>Limits: 86%</li>
          </ul>
        </article>
        <article className="panel">
          <h4>Needs Work</h4>
          <ul className="line-list">
            <li>Integration: 63%</li>
            <li>Integration by Parts: 41%</li>
          </ul>
        </article>
      </div>
      <article className="panel accent">
        AI Insight placeholder: 3 short sessions on Integration by Parts can improve projected score.
      </article>
    </section>
  );
}

export function AIToolsHubView({ onOpenTool }) {
  const tools = [
    {
      key: "ai-tool-quiz",
      name: "Quiz Generator",
      description: "Build chapter quizzes and exams from selected workspace documents.",
      action: "Open Quiz Generator"
    },
    {
      key: "ai-tool-tutor",
      name: "AI Tutor",
      description: "Step-by-step tutoring and practice hints constrained by your study scope.",
      action: "Open AI Tutor"
    },
    {
      key: "ai-tool-chatbot",
      name: "Chatbot",
      description: "General purpose learning assistant for quick questions and summaries.",
      action: "Open Chatbot"
    }
  ];

  return (
    <section className="view-stack">
      <article className="panel accent">
        <h4 style={{ marginTop: 0 }}>AI Tools Library</h4>
        <p className="hint">This catalog will keep growing. Click any tool to open its full page.</p>
      </article>

      <div className="panel-grid three">
        {tools.map((tool) => (
          <article key={tool.key} className="panel ai-tool-card">
            <h4>{tool.name}</h4>
            <p>{tool.description}</p>
            <button className="primary-btn" type="button" onClick={() => onOpenTool(tool.key)}>{tool.action}</button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AIToolPageView({ title, description, onBack, children }) {
  return (
    <section className="view-stack">
      <article className="panel">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h4 style={{ margin: 0 }}>{title}</h4>
            <p className="hint" style={{ margin: "6px 0 0" }}>{description}</p>
          </div>
          <button className="table-btn" type="button" onClick={onBack}>Back To AI Tools</button>
        </div>
      </article>
      {children}
    </section>
  );
}

export function WorkspacesView() {
  return <section className="view-stack" />;
}

export function WorkspacesManagerView({
  workspaces,
  selectedWorkspaceId,
  selectedSubjectId,
  statusMessage,
  isWorking,
  onSelectWorkspace,
  onSelectSubject,
  onCreateWorkspace,
  onRenameWorkspace,
  onSetWorkspaceColor,
  onRemoveWorkspace,
  onCreateSubject,
  onRenameSubject,
  onSetSubjectColor,
  onRemoveSubject,
  onCreateFolder,
  onAddTopicTag,
  onRenameFolder,
  onRemoveFolder,
  onRenameTopicTag,
  onRemoveTopicTag,
  onSetTopicTagColor,
  onUploadTxt,
  onRenameDocument,
  onRemoveDocument,
  onUpdateDocumentMeta
}) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [folderName, setFolderName] = useState("");
  const [parentFolderId, setParentFolderId] = useState("");
  const [topicTagName, setTopicTagName] = useState("");
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFolderIds, setUploadFolderIds] = useState([]);
  const [uploadSelectedTags, setUploadSelectedTags] = useState([]);
  const [uploadTagDraft, setUploadTagDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState("");
  const [docViewMode, setDocViewMode] = useState("cards");
  const [filterFolderId, setFilterFolderId] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterText, setFilterText] = useState("");
  const [renameDocId, setRenameDocId] = useState("");
  const [renameDocName, setRenameDocName] = useState("");
  const [renameSubjectId, setRenameSubjectId] = useState("");
  const [renameSubjectName, setRenameSubjectName] = useState("");
  const [renameWorkspaceId, setRenameWorkspaceId] = useState("");
  const [renameWorkspaceName, setRenameWorkspaceName] = useState("");
  const [workspaceColorDraftById, setWorkspaceColorDraftById] = useState({});
  const [subjectColorDraftById, setSubjectColorDraftById] = useState({});
  const [renameFolderId, setRenameFolderId] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");
  const [renameTopicTagFrom, setRenameTopicTagFrom] = useState("");
  const [renameTopicTagTo, setRenameTopicTagTo] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState({});
  const [collapsedFolderDocs, setCollapsedFolderDocs] = useState({});
  const [unfiledCollapsed, setUnfiledCollapsed] = useState(false);
  const [editDocMeta, setEditDocMeta] = useState(null);
  const [editDocFolderIds, setEditDocFolderIds] = useState([]);
  const [editDocSelectedTags, setEditDocSelectedTags] = useState([]);
  const [editDocTagDraft, setEditDocTagDraft] = useState("");
  const [previewDoc, setPreviewDoc] = useState(null);
  const [downloadFormatByDocId, setDownloadFormatByDocId] = useState({});

  const [tagColorDraftByName, setTagColorDraftByName] = useState({});

  const selectedWorkspace = workspaces.find((item) => item.id === selectedWorkspaceId) || null;
  const subjects = selectedWorkspace ? selectedWorkspace.subjects : [];
  const selectedSubject = subjects.find((item) => item.id === selectedSubjectId) || null;
  const folders = selectedSubject?.folders || [];
  const topicTags = selectedSubject?.topicTags || [];
  const documents = selectedSubject?.documents || [];
  const uploadedDocuments = getUploadedDocuments(documents);
  const generatedDocuments = getGeneratedDocuments(documents);
  const topicTagNames = topicTags.map((item) => item.name);
  const tagColorByName = Object.fromEntries(topicTags.map((item) => [item.name, item.color || DEFAULT_TOPIC_TAG_COLOR]));

  function getWorkspaceColor(workspace) {
    return normalizeWorkspaceColor(workspaceColorDraftById[workspace.id] || workspace.color || DEFAULT_WORKSPACE_COLOR);
  }

  function getSubjectColor(subject) {
    return normalizeSubjectColor(subjectColorDraftById[subject.id] || subject.color || DEFAULT_SUBJECT_COLOR);
  }

  function cardStyle(colorHex) {
    const safe = normalizeWorkspaceColor(colorHex);
    return {
      background: `linear-gradient(160deg, ${safe}4D, rgba(11, 30, 56, 0.94))`
    };
  }

  function getTagColor(tagName) {
    return normalizeTopicTagColor(tagColorDraftByName[tagName] || tagColorByName[tagName] || DEFAULT_TOPIC_TAG_COLOR);
  }

  const flattenedFolders = flattenFolders(folders);
  const folderLabels = buildFolderPathMap(folders);
  const effectiveFolderFilter = filterFolderId || activeFolderId;
  const selectedFolderLabel = folderLabels.get(activeFolderId) || "All folders";

  const filteredUploadedDocuments = filterDocuments(uploadedDocuments, {
    folderId: effectiveFolderFilter,
    tag: filterTag,
    text: filterText
  });

  const filteredGeneratedDocuments = filterDocuments(generatedDocuments, {
    folderId: effectiveFolderFilter,
    tag: filterTag,
    text: filterText
  });

  const folderChildrenMap = buildFolderChildrenMap(flattenedFolders);
  const { documentsByFolder: uploadedDocumentsByFolder, unfiledDocuments: unfiledUploadedDocuments } = splitDocumentsByFolder(uploadedDocuments);
  const { documentsByFolder: generatedDocumentsByFolder, unfiledDocuments: unfiledGeneratedDocuments } = splitDocumentsByFolder(generatedDocuments);

  function clearFilters() {
    setFilterFolderId("");
    setFilterTag("");
    setFilterText("");
    setActiveFolderId("");
  }

  function toggleUploadFolder(folderId) {
    setUploadFolderIds((prev) => (prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]));
  }

  function handleCreateWorkspace() {
    const name = workspaceName.trim();
    if (!name) return;
    onCreateWorkspace(name);
    setWorkspaceName("");
  }

  function handleCreateSubject() {
    const name = subjectName.trim();
    if (!name) return;
    onCreateSubject(name);
    setSubjectName("");
  }

  function handleStartRenameSubject(subject) {
    setRenameSubjectId(subject.id);
    setRenameSubjectName(subject.name);
  }

  function handleSaveRenameSubject(subjectId) {
    const nextName = renameSubjectName.trim();
    if (!nextName) return;
    onRenameSubject(subjectId, nextName);
    setRenameSubjectId("");
    setRenameSubjectName("");
  }

  function handleAddFolder() {
    const name = folderName.trim();
    if (!name) return;
    onCreateFolder(name, parentFolderId);
    setFolderName("");
    setParentFolderId("");
    setShowFolderModal(false);
  }

  function handleAddTopicTag(event) {
    event.preventDefault();
    const tag = topicTagName.trim();
    if (!tag) return;
    onAddTopicTag(tag);
    setTopicTagName("");
  }

  function handleUploadSubmit() {
    if (!pendingFiles.length) return;
    onUploadTxt(pendingFiles, {
      folderIds: uploadFolderIds,
      tags: uploadSelectedTags
    });
    setPendingFiles([]);
    setUploadFolderIds([]);
    setUploadSelectedTags([]);
    setUploadTagDraft("");
    setShowUploadModal(false);
  }

  function handleStartRenameWorkspace(workspace) {
    setRenameWorkspaceId(workspace.id);
    setRenameWorkspaceName(workspace.name);
  }

  function handleSaveRenameWorkspace(workspaceId) {
    const nextName = renameWorkspaceName.trim();
    if (!nextName) return;
    onRenameWorkspace(workspaceId, nextName);
    setRenameWorkspaceId("");
    setRenameWorkspaceName("");
  }

  function handleStartRenameFolder(folder) {
    setRenameFolderId(folder.id);
    setRenameFolderName(folder.name);
  }

  function handleSaveRenameFolder(folderId) {
    const nextName = renameFolderName.trim();
    if (!nextName) return;
    onRenameFolder(folderId, nextName);
    setRenameFolderId("");
    setRenameFolderName("");
  }

  function handleRemoveFolder(folderId) {
    if (!window.confirm("Remove this folder? Documents remain and only lose folder assignments.")) return;
    onRemoveFolder(folderId);
    setUploadFolderIds((prev) => prev.filter((id) => id !== folderId));
    if (activeFolderId === folderId) setActiveFolderId("");
    if (filterFolderId === folderId) setFilterFolderId("");
  }

  function handleStartRenameTopicTag(tag) {
    setRenameTopicTagFrom(tag.name);
    setRenameTopicTagTo(tag.name);
  }

  function handleSaveRenameTopicTag() {
    const nextTag = renameTopicTagTo.trim();
    if (!renameTopicTagFrom || !nextTag) return;
    onRenameTopicTag(renameTopicTagFrom, nextTag);
    setRenameTopicTagFrom("");
    setRenameTopicTagTo("");
  }

  function handleRemoveTopicTag(tag) {
    if (!window.confirm("Remove this topic tag from this subject and linked docs?")) return;
    onRemoveTopicTag(tag.name);
  }

  function handleStartRenameDoc(doc) {
    setRenameDocId(doc.id);
    setRenameDocName(doc.name);
  }

  function handleSaveRenameDoc(documentId) {
    const nextName = renameDocName.trim();
    if (!nextName) return;
    onRenameDocument(documentId, nextName);
    setRenameDocId("");
    setRenameDocName("");
  }

  function handleRemoveDoc(documentId) {
    if (!window.confirm("Remove this document?")) return;
    onRemoveDocument(documentId);
    if (previewDoc?.id === documentId) setPreviewDoc(null);
  }

  function toggleFolderCollapsed(folderId) {
    setCollapsedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  }

  function toggleFolderDocsCollapsed(folderId) {
    setCollapsedFolderDocs((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  }

  function getSelectedDownloadFormat(doc) {
    const options = Array.isArray(doc.availableFormats) && doc.availableFormats.length ? doc.availableFormats : ["txt"];
    const selected = downloadFormatByDocId[doc.id];
    return options.includes(selected) ? selected : options[0];
  }

  async function handleDownloadGeneratedDocument(doc) {
    try {
      const response = await fetch(WORKSPACES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "downloadGeneratedDocument",
          payload: {
            documentId: doc.id,
            format: getSelectedDownloadFormat(doc)
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Download failed");
      }

      downloadBase64File(data.download.contentBase64, data.download.fileName, data.download.mimeType);
    } catch (error) {
      window.alert(String(error.message || error));
    }
  }

  async function handleDownloadUploadedDocument(doc) {
    try {
      const response = await fetch(WORKSPACES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "downloadUploadedDocument",
          payload: {
            documentId: doc.id
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Download failed");
      }

      downloadBase64File(data.download.contentBase64, data.download.fileName, data.download.mimeType);
    } catch (error) {
      window.alert(String(error.message || error));
    }
  }

  function renderGeneratedDownloadControls(doc) {
    if (doc.sourceType !== "generated") return null;
    const formats = Array.isArray(doc.availableFormats) && doc.availableFormats.length ? doc.availableFormats : ["txt"];
    return (
      <>
        <select
          className="input"
          value={getSelectedDownloadFormat(doc)}
          onChange={(event) => setDownloadFormatByDocId((prev) => ({ ...prev, [doc.id]: event.target.value }))}
          disabled={isWorking}
        >
          {formats.map((format) => (
            <option key={`${doc.id}-${format}`} value={format}>{format.toUpperCase()}</option>
          ))}
        </select>
        <button className="table-btn" type="button" onClick={() => handleDownloadGeneratedDocument(doc)} disabled={isWorking}>Download</button>
      </>
    );
  }

  function renderUploadedDownloadControl(doc) {
    if (doc.sourceType === "generated") return null;
    return <button className="table-btn" type="button" onClick={() => handleDownloadUploadedDocument(doc)} disabled={isWorking}>Download</button>;
  }

  function renderInlineDocumentRow(doc, rowKey) {
    return (
      <div className="doc-inline-row" key={rowKey}>
        <span>{doc.name}</span>
        <div className="chip-wrap doc-inline-tags">
          {(doc.tags || []).map((tag) => (
            <span className="scope-chip" key={`${doc.id}-${tag}`} style={{ backgroundColor: `${getTagColor(tag)}2a`, borderColor: getTagColor(tag) }}>
              {tag}
            </span>
          ))}
        </div>
        <div className="inline-actions">
          {renderUploadedDownloadControl(doc)}
          {renderGeneratedDownloadControls(doc)}
          <button className="table-btn" type="button" onClick={() => handleStartRenameDoc(doc)}>Rename</button>
          <button className="table-btn" type="button" onClick={() => handleStartEditDocMeta(doc)}>Edit</button>
          <button className="table-btn" type="button" onClick={() => setPreviewDoc(doc)}>Preview</button>
          <button className="table-btn danger" type="button" onClick={() => handleRemoveDoc(doc.id)}>Delete</button>
        </div>
      </div>
    );
  }

  function renderFolderDocumentGroup(folderId, label, docs, collapseKey) {
    if (!docs.length) return null;
    const isCollapsed = Boolean(collapsedFolderDocs[collapseKey]);
    return (
      <div className="folder-docs-block">
        <button className="tree-toggle-docs" type="button" onClick={() => toggleFolderDocsCollapsed(collapseKey)}>
          {isCollapsed ? "+" : "-"} {label} ({docs.length})
        </button>
        {!isCollapsed ? (
          <div className="folder-docs-list">
            {docs.map((doc) => renderInlineDocumentRow(doc, `${folderId}-${doc.id}-${collapseKey}`))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderDocumentCards(documentList, emptyMessage) {
    return (
      <div className="doc-card-grid">
        {documentList.map((doc) => {
          const isRenaming = renameDocId === doc.id;
          const docFolderIds = getDocumentFolderIds(doc);
          const folderNames = docFolderIds.map((id) => folderLabels.get(id)).filter(Boolean);

          return (
            <article className="doc-visual-card" key={doc.id}>
              {isRenaming ? (
                <div className="form-stack">
                  <input className="input" value={renameDocName} onChange={(event) => setRenameDocName(event.target.value)} />
                  <div className="inline-actions">
                    <button className="table-btn" type="button" onClick={() => handleSaveRenameDoc(doc.id)}>Save</button>
                    <button className="table-btn" type="button" onClick={() => setRenameDocId("")}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <h5>{doc.name}</h5>
                  <p className="hint">{doc.sizeLabel}</p>
                </>
              )}

              <p className="hint">{folderNames.length ? folderNames.join(" · ") : "No folder"}</p>
              <div className="chip-wrap">
                {(doc.tags || []).map((tag) => (
                  <span className="scope-chip" key={`${doc.id}-${tag}`} style={{ backgroundColor: `${getTagColor(tag)}2a`, borderColor: getTagColor(tag) }}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="inline-actions" style={{ marginTop: "10px" }}>
                {renderUploadedDownloadControl(doc)}
                {renderGeneratedDownloadControls(doc)}
                {!isRenaming ? <button className="table-btn" type="button" onClick={() => handleStartRenameDoc(doc)}>Rename</button> : null}
                <button className="table-btn" type="button" onClick={() => handleStartEditDocMeta(doc)}>Edit</button>
                <button className="table-btn" type="button" onClick={() => setPreviewDoc(doc)}>Preview</button>
                <button className="table-btn danger" type="button" onClick={() => handleRemoveDoc(doc.id)}>Delete</button>
              </div>
            </article>
          );
        })}
        {!documentList.length ? <p className="hint">{emptyMessage}</p> : null}
      </div>
    );
  }

  function renderDocumentTable(documentList) {
    return (
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Workspace</th>
              <th>Folder Path</th>
              <th>Document</th>
              <th>Tags</th>
              <th>Size</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documentList.map((doc) => {
              const docFolderIds = getDocumentFolderIds(doc);
              const folderNames = docFolderIds.map((id) => folderLabels.get(id)).filter(Boolean);
              const isRenaming = renameDocId === doc.id;
              return (
                <tr key={doc.id}>
                  <td>{selectedWorkspace.name}</td>
                  <td>{folderNames.length ? folderNames.join(" | ") : "-"}</td>
                  <td>
                    {isRenaming ? (
                      <div className="inline-actions">
                        <input className="input" value={renameDocName} onChange={(event) => setRenameDocName(event.target.value)} />
                        <button className="table-btn" type="button" onClick={() => handleSaveRenameDoc(doc.id)}>Save</button>
                        <button className="table-btn" type="button" onClick={() => setRenameDocId("")}>Cancel</button>
                      </div>
                    ) : doc.name}
                  </td>
                  <td>{doc.tags?.length ? doc.tags.join(", ") : "-"}</td>
                  <td>{doc.sizeLabel}</td>
                  <td>
                    <div className="inline-actions">
                      {renderUploadedDownloadControl(doc)}
                      {renderGeneratedDownloadControls(doc)}
                      {!isRenaming ? <button className="table-btn" type="button" onClick={() => handleStartRenameDoc(doc)}>Rename</button> : null}
                      <button className="table-btn" type="button" onClick={() => handleStartEditDocMeta(doc)}>Edit</button>
                      <button className="table-btn" type="button" onClick={() => setPreviewDoc(doc)}>Preview</button>
                      <button className="table-btn danger" type="button" onClick={() => handleRemoveDoc(doc.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderDocumentsSection({ title, documentList, totalCount, emptyMessage, actionButton }) {
    return (
      <div className="documents-box">
        <div className="box-head">
          <h4>{title}</h4>
          <div className="inline-actions">
            {actionButton}
          </div>
        </div>

        <div className="box-foot">
          <span className="hint">Showing {documentList.length} of {totalCount}</span>
        </div>

        {docViewMode === "cards" ? renderDocumentCards(documentList, emptyMessage) : renderDocumentTable(documentList)}
        {!documentList.length && docViewMode === "list" ? <p className="hint">{emptyMessage}</p> : null}
      </div>
    );
  }

  function handleStartEditDocMeta(doc) {
    const folderIds = getDocumentFolderIds(doc);
    setEditDocMeta(doc);
    setEditDocFolderIds(folderIds);
    setEditDocSelectedTags(doc.tags || []);
    setEditDocTagDraft("");
  }

  function toggleEditDocFolder(folderId) {
    setEditDocFolderIds((prev) => (prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]));
  }

  function handleSaveDocMeta() {
    if (!editDocMeta) return;
    onUpdateDocumentMeta(editDocMeta.id, {
      folderIds: editDocFolderIds,
      tags: editDocSelectedTags
    });
    setEditDocMeta(null);
    setEditDocFolderIds([]);
    setEditDocSelectedTags([]);
    setEditDocTagDraft("");
  }

  function addTagToSelection(rawValue, setter) {
    const nextTag = normalizeTagName(rawValue);
    if (!nextTag) return;
    setter((prev) => (prev.includes(nextTag) ? prev : [...prev, nextTag]));
  }

  function removeTagFromSelection(tagName, setter) {
    setter((prev) => prev.filter((item) => item !== tagName));
  }

  function renderFolderNode(folder, depth) {
    const childFolders = folderChildrenMap.get(folder.id) || [];
    const uploadedFolderDocs = uploadedDocumentsByFolder.get(folder.id) || [];
    const generatedFolderDocs = generatedDocumentsByFolder.get(folder.id) || [];
    const isCollapsed = Boolean(collapsedFolders[folder.id]);
    const hasTreeToggle = childFolders.length > 0 || uploadedFolderDocs.length > 0 || generatedFolderDocs.length > 0;

    return (
      <div key={folder.id} className="folder-indent-wrap" style={{ marginLeft: `${depth * 18}px` }}>
        <div className={activeFolderId === folder.id ? "folder-node on" : "folder-node"}>
          {renameFolderId === folder.id ? (
            <div className="inline-actions">
              <input
                className="input"
                value={renameFolderName}
                onChange={(event) => setRenameFolderName(event.target.value)}
                disabled={isWorking}
              />
              <button className="table-btn" type="button" onClick={() => handleSaveRenameFolder(folder.id)} disabled={isWorking}>Save</button>
              <button className="table-btn" type="button" onClick={() => setRenameFolderId("")} disabled={isWorking}>Cancel</button>
            </div>
          ) : (
            <>
              <div className="folder-node-head">
                <div className="folder-node-title">
                  {hasTreeToggle ? (
                    <button className="tree-toggle" type="button" onClick={() => toggleFolderCollapsed(folder.id)} disabled={isWorking}>
                      {isCollapsed ? "+" : "-"}
                    </button>
                  ) : <span className="tree-toggle-empty" />}
                  <button className="folder-node-main" type="button" onClick={() => setActiveFolderId(folder.id)} disabled={isWorking}>
                    {folder.name}
                  </button>
                </div>
                <div className="inline-actions">
                  <button className="table-btn" type="button" onClick={() => handleStartRenameFolder(folder)} disabled={isWorking}>Rename</button>
                  <button className="table-btn danger" type="button" onClick={() => handleRemoveFolder(folder.id)} disabled={isWorking}>Delete</button>
                </div>
              </div>

              {!isCollapsed ? (
                <div className="folder-children-wrap">
                  {renderFolderDocumentGroup(folder.id, "Uploaded Documents", uploadedFolderDocs, `${folder.id}:uploaded`)}
                  {renderFolderDocumentGroup(folder.id, "Generated Documents", generatedFolderDocs, `${folder.id}:generated`)}

                  {childFolders.map((child) => renderFolderNode(child, depth + 1))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="view-stack">
      {statusMessage ? <p className="hint">{statusMessage}</p> : null}
      {isWorking ? <p className="hint">Syncing changes...</p> : null}

      <article className="workspace-shell">
        <div className="workspace-shell-head">
          <h3>Workspaces</h3>
          <p className="hint">Click a workspace to open its folder and document explorer.</p>
        </div>

        <div className="workspace-grid">
          {workspaces.map((workspace) => (
            <article
              key={workspace.id}
              className={workspace.id === selectedWorkspaceId ? "ws-card on" : "ws-card"}
              style={cardStyle(getWorkspaceColor(workspace))}
              onClick={() => onSelectWorkspace(workspace.id)}
            >
              {renameWorkspaceId === workspace.id ? (
                <div className="form-stack" onClick={(event) => event.stopPropagation()}>
                  <input
                    className="input"
                    value={renameWorkspaceName}
                    onChange={(event) => setRenameWorkspaceName(event.target.value)}
                    disabled={isWorking}
                  />
                  <div className="inline-actions">
                    <button className="table-btn" type="button" onClick={() => handleSaveRenameWorkspace(workspace.id)} disabled={isWorking}>Save</button>
                    <button className="table-btn" type="button" onClick={() => setRenameWorkspaceId("")} disabled={isWorking}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <h4>{workspace.name}</h4>
                  <p className="hint">{workspace.subjects.length} subjects</p>
                  <div className="inline-actions" onClick={(event) => event.stopPropagation()}>
                    <input
                      className="input color-input"
                      type="color"
                      value={getWorkspaceColor(workspace)}
                      onChange={(event) => {
                        const nextColor = normalizeWorkspaceColor(event.target.value);
                        setWorkspaceColorDraftById((prev) => ({ ...prev, [workspace.id]: nextColor }));
                        onSetWorkspaceColor(workspace.id, nextColor);
                      }}
                      disabled={isWorking}
                    />
                    <button className="table-btn" type="button" onClick={() => handleStartRenameWorkspace(workspace)} disabled={isWorking}>Rename</button>
                    <button className="table-btn danger" type="button" onClick={() => onRemoveWorkspace(workspace.id)} disabled={isWorking}>Delete</button>
                  </div>
                </>
              )}
            </article>
          ))}

          <article className="ws-card add-end">
            <p className="field-label">Add workspace</p>
            <input
              className="input"
              placeholder="e.g. SAT Prep"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              disabled={isWorking}
            />
            <button className="primary-btn" type="button" onClick={handleCreateWorkspace} disabled={isWorking}>Create Workspace</button>
          </article>
        </div>
      </article>

      {selectedWorkspace ? (
        <article className="workspace-shell">
          <div className="workspace-shell-head">
            <h3>{selectedWorkspace.name}</h3>
            <p className="hint">Choose a subject, then folders. Documents open below for the selected folder.</p>
          </div>

          <div className="subject-strip">
            <div className="subject-grid">
              {subjects.map((subject) => (
                <article
                  key={subject.id}
                  className={subject.id === selectedSubjectId ? "subject-card on" : "subject-card"}
                  style={cardStyle(getSubjectColor(subject))}
                  onClick={() => onSelectSubject(subject.id)}
                >
                  {renameSubjectId === subject.id ? (
                    <div className="form-stack" onClick={(event) => event.stopPropagation()}>
                      <input
                        className="input"
                        value={renameSubjectName}
                        onChange={(event) => setRenameSubjectName(event.target.value)}
                        disabled={isWorking}
                      />
                      <div className="inline-actions">
                        <button className="table-btn" type="button" onClick={() => handleSaveRenameSubject(subject.id)} disabled={isWorking}>Save</button>
                        <button className="table-btn" type="button" onClick={() => setRenameSubjectId("")} disabled={isWorking}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4>{subject.name}</h4>
                      <p className="hint">{getUploadedDocuments(subject.documents || []).length} uploaded · {getGeneratedDocuments(subject.documents || []).length} generated</p>
                      <div className="inline-actions" onClick={(event) => event.stopPropagation()}>
                        <input
                          className="input color-input"
                          type="color"
                          value={getSubjectColor(subject)}
                          onChange={(event) => {
                            const nextColor = normalizeSubjectColor(event.target.value);
                            setSubjectColorDraftById((prev) => ({ ...prev, [subject.id]: nextColor }));
                            onSetSubjectColor(subject.id, nextColor);
                          }}
                          disabled={isWorking}
                        />
                        <button className="table-btn" type="button" onClick={() => handleStartRenameSubject(subject)} disabled={isWorking}>Rename</button>
                        <button className="table-btn danger" type="button" onClick={() => onRemoveSubject(subject.id)} disabled={isWorking}>Delete</button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>

            <div className="subject-create">
              <input
                className="input"
                placeholder="Add subject"
                value={subjectName}
                onChange={(event) => setSubjectName(event.target.value)}
                disabled={isWorking}
              />
              <button className="ghost-btn" type="button" onClick={handleCreateSubject} disabled={isWorking}>Add Subject</button>
            </div>
          </div>

          {selectedSubject ? (
            <>
              <div className="folder-box">
                <div className="box-head">
                  <h4>Folders</h4>
                  <p className="hint">Selected: {selectedFolderLabel}</p>
                </div>

                <div className="folder-tree-visual">
                  {(folderChildrenMap.get("") || []).map((folder) => renderFolderNode(folder, 0))}

                  {unfiledUploadedDocuments.length ? (
                    <div className="folder-indent-wrap">
                      <div className="folder-node">
                        <div className="folder-node-head">
                          <div className="folder-node-title">
                            <button className="tree-toggle" type="button" onClick={() => setUnfiledCollapsed((prev) => !prev)}>
                              {unfiledCollapsed ? "+" : "-"}
                            </button>
                            <span className="folder-node-main">Unfiled Uploaded Documents</span>
                          </div>
                        </div>
                        {!unfiledCollapsed ? (
                          <div className="folder-docs-list">
                            {unfiledUploadedDocuments.map((doc) => renderInlineDocumentRow(doc, `unfiled-uploaded-${doc.id}`))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {unfiledGeneratedDocuments.length ? (
                    <div className="folder-indent-wrap">
                      <div className="folder-node">
                        <div className="folder-node-head">
                          <div className="folder-node-title">
                            <button className="tree-toggle" type="button" onClick={() => toggleFolderDocsCollapsed("unfiled-generated")}>
                              {collapsedFolderDocs["unfiled-generated"] ? "+" : "-"}
                            </button>
                            <span className="folder-node-main">Unfiled Generated Documents</span>
                          </div>
                        </div>
                        {!collapsedFolderDocs["unfiled-generated"] ? (
                          <div className="folder-docs-list">
                            {unfiledGeneratedDocuments.map((doc) => renderInlineDocumentRow(doc, `unfiled-generated-${doc.id}`))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {!flattenedFolders.length ? <p className="hint">No folders yet for this subject.</p> : null}
                </div>

                <div className="box-foot">
                  <button className="primary-btn" type="button" onClick={() => setShowFolderModal(true)} disabled={isWorking}>Add Folder</button>
                </div>
              </div>

              <div className="tags-box">
                <div className="box-head">
                  <h4>Topic Tags</h4>
                </div>

                <form className="form-stack" onSubmit={handleAddTopicTag}>
                  <input
                    className="input"
                    placeholder="Add a topic tag"
                    value={topicTagName}
                    onChange={(event) => setTopicTagName(event.target.value)}
                    disabled={isWorking}
                  />
                  <button className="ghost-btn" type="submit" disabled={isWorking}>Add Tag</button>
                </form>

                <div className="chip-stack" style={{ marginTop: "10px" }}>
                  {topicTags.map((tag) => (
                    <div className="scope-chip-row tag-row" key={tag.name}>
                      {renameTopicTagFrom === tag.name ? (
                        <>
                          <input
                            className="input chip-input"
                            value={renameTopicTagTo}
                            onChange={(event) => setRenameTopicTagTo(event.target.value)}
                            disabled={isWorking}
                          />
                          <button className="table-btn" type="button" onClick={handleSaveRenameTopicTag} disabled={isWorking}>Save</button>
                          <button className="table-btn" type="button" onClick={() => setRenameTopicTagFrom("")} disabled={isWorking}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <span className="scope-chip" style={{ backgroundColor: `${getTagColor(tag.name)}2a`, borderColor: getTagColor(tag.name) }}>#{tag.name}</span>
                          <input
                            className="input color-input"
                            type="color"
                            value={getTagColor(tag.name)}
                            onChange={(event) => {
                              const nextColor = normalizeTopicTagColor(event.target.value);
                              setTagColorDraftByName((prev) => ({ ...prev, [tag.name]: nextColor }));
                              onSetTopicTagColor(tag.name, nextColor);
                            }}
                            disabled={isWorking}
                          />
                          <button className="table-btn" type="button" onClick={() => handleStartRenameTopicTag(tag)} disabled={isWorking}>Rename</button>
                          <button className="table-btn danger" type="button" onClick={() => handleRemoveTopicTag(tag)} disabled={isWorking}>Delete</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="documents-box">
                <div className="box-head">
                  <h4>Document Filters</h4>
                  <div className="inline-actions">
                    <button className={docViewMode === "cards" ? "table-btn view-on" : "table-btn"} type="button" onClick={() => setDocViewMode("cards")}>Cards</button>
                    <button className={docViewMode === "list" ? "table-btn view-on" : "table-btn"} type="button" onClick={() => setDocViewMode("list")}>List View</button>
                  </div>
                </div>

                <div className="panel-grid three filter-grid">
                  <label className="form-stack">
                    <span className="field-label">Filter by folder</span>
                    <select className="input" value={filterFolderId} onChange={(event) => setFilterFolderId(event.target.value)}>
                      <option value="">All folders</option>
                      {flattenedFolders.map((folder) => (
                        <option key={folder.id} value={folder.id}>{folderLabels.get(folder.id)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-stack">
                    <span className="field-label">Filter by tag</span>
                    <select className="input" value={filterTag} onChange={(event) => setFilterTag(event.target.value)}>
                      <option value="">All tags</option>
                      {topicTags.map((tag) => (
                        <option key={tag.name} value={tag.name}>{tag.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-stack">
                    <span className="field-label">Search by name/content</span>
                    <input className="input" value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="search..." />
                  </label>
                </div>

                <div className="box-foot">
                  <button className="table-btn" type="button" onClick={clearFilters}>Reset Filters</button>
                  <span className="hint">Showing {filteredUploadedDocuments.length} of {uploadedDocuments.length} uploaded · {filteredGeneratedDocuments.length} of {generatedDocuments.length} generated</span>
                </div>
              </div>

              {renderDocumentsSection({
                title: "Uploaded Documents",
                documentList: filteredUploadedDocuments,
                totalCount: uploadedDocuments.length,
                emptyMessage: "No uploaded documents found in this view.",
                actionButton: <button className="primary-btn" type="button" onClick={() => setShowUploadModal(true)} disabled={isWorking}>Add Uploaded Document</button>
              })}

              {renderDocumentsSection({
                title: "Generated Documents",
                documentList: filteredGeneratedDocuments,
                totalCount: generatedDocuments.length,
                emptyMessage: "No generated documents found in this view.",
                actionButton: null
              })}
            </>
          ) : (
            <p className="hint">Choose a subject to view folders and documents.</p>
          )}
        </article>
      ) : null}

      {showFolderModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <h4>Add Folder / Subfolder</h4>
              <button className="table-btn" type="button" onClick={() => setShowFolderModal(false)}>Close</button>
            </div>
            <div className="form-stack" style={{ marginTop: "10px" }}>
              <input
                className="input"
                placeholder="Folder name"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
              />
              <select className="input" value={parentFolderId} onChange={(event) => setParentFolderId(event.target.value)}>
                <option value="">Top level folder</option>
                {flattenedFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folderLabels.get(folder.id)}</option>
                ))}
              </select>
              <button className="primary-btn" type="button" onClick={handleAddFolder}>Add</button>
            </div>
          </div>
        </div>
      ) : null}

      {showUploadModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <h4>Add Uploaded Documents</h4>
              <button className="table-btn" type="button" onClick={() => setShowUploadModal(false)}>Close</button>
            </div>
            <div className="form-stack" style={{ marginTop: "10px" }}>
              <label className="upload-box">
                <span>Select TXT files</span>
                <input
                  type="file"
                  accept=".txt,text/plain"
                  multiple
                  onChange={(event) => setPendingFiles(Array.from(event.target.files || []))}
                />
              </label>

              <div>
                <p className="field-label">Assign to folders</p>
                <div className="chip-stack finder-upload-folders">
                  {flattenedFolders.map((folder) => (
                    <label className="scope-chip-row" key={folder.id}>
                      <input
                        type="checkbox"
                        checked={uploadFolderIds.includes(folder.id)}
                        onChange={() => toggleUploadFolder(folder.id)}
                      />
                      <span className="scope-chip">{folderLabels.get(folder.id)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <input
                className="input"
                placeholder="Type a new tag"
                value={uploadTagDraft}
                onChange={(event) => setUploadTagDraft(event.target.value)}
              />

              <div className="inline-actions">
                <button
                  className="table-btn"
                  type="button"
                  onClick={() => {
                    addTagToSelection(uploadTagDraft, setUploadSelectedTags);
                    setUploadTagDraft("");
                  }}
                >
                  Add Tag
                </button>
              </div>

              <div className="chip-wrap">
                {topicTagNames.map((tagName) => (
                  <button
                    key={`upload-existing-${tagName}`}
                    className="table-btn"
                    type="button"
                    onClick={() => addTagToSelection(tagName, setUploadSelectedTags)}
                  >
                    + {tagName}
                  </button>
                ))}
              </div>

              <div className="chip-wrap">
                {uploadSelectedTags.map((tagName) => (
                    <span className="scope-chip tag-picked" key={`upload-picked-${tagName}`} style={{ backgroundColor: `${getTagColor(tagName)}2a`, borderColor: getTagColor(tagName) }}>
                    {tagName}
                    <button type="button" className="tag-remove-btn" onClick={() => removeTagFromSelection(tagName, setUploadSelectedTags)}>x</button>
                  </span>
                ))}
              </div>

              <button className="primary-btn" type="button" onClick={handleUploadSubmit} disabled={!pendingFiles.length}>Add Uploaded Documents</button>
            </div>
          </div>
        </div>
      ) : null}

      {previewDoc ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <h4>{previewDoc.name}</h4>
              <button className="table-btn" onClick={() => setPreviewDoc(null)} type="button">Close</button>
            </div>
            <p className="hint">{previewDoc.sizeLabel} · TXT</p>
            <pre className="doc-preview">{previewDoc.content || "(empty file)"}</pre>
          </div>
        </div>
      ) : null}

      {editDocMeta ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <h4>Edit Document Metadata</h4>
              <button className="table-btn" onClick={() => setEditDocMeta(null)} type="button">Close</button>
            </div>

            <p className="hint" style={{ marginTop: "8px" }}>{editDocMeta.name}</p>

            <div className="doc-meta-grid">
              <div className="form-stack">
                <span className="field-label">Folders</span>
                <div className="chip-stack finder-upload-folders">
                  {flattenedFolders.map((folder) => (
                    <label className="scope-chip-row" key={`edit-${folder.id}`}>
                      <input
                        type="checkbox"
                        checked={editDocFolderIds.includes(folder.id)}
                        onChange={() => toggleEditDocFolder(folder.id)}
                      />
                      <span className="scope-chip">{folderLabels.get(folder.id)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="form-stack">
                <span className="field-label">Tags</span>
                <input
                  className="input"
                  value={editDocTagDraft}
                  onChange={(event) => setEditDocTagDraft(event.target.value)}
                  placeholder="Type a new tag"
                />

                <div className="inline-actions">
                  <button
                    className="table-btn"
                    type="button"
                    onClick={() => {
                      addTagToSelection(editDocTagDraft, setEditDocSelectedTags);
                      setEditDocTagDraft("");
                    }}
                  >
                    Add Tag
                  </button>
                </div>

                <div className="chip-wrap">
                  {topicTagNames.map((tagName) => (
                    <button
                      key={`edit-existing-${tagName}`}
                      className="table-btn"
                      type="button"
                      onClick={() => addTagToSelection(tagName, setEditDocSelectedTags)}
                    >
                      + {tagName}
                    </button>
                  ))}
                </div>

                <div className="chip-wrap">
                  {editDocSelectedTags.map((tagName) => (
                    <span className="scope-chip tag-picked" key={`edit-picked-${tagName}`} style={{ backgroundColor: `${getTagColor(tagName)}2a`, borderColor: getTagColor(tagName) }}>
                      {tagName}
                      <button type="button" className="tag-remove-btn" onClick={() => removeTagFromSelection(tagName, setEditDocSelectedTags)}>x</button>
                    </span>
                  ))}
                </div>
              </label>
            </div>

            <div className="inline-actions" style={{ marginTop: "10px" }}>
              <button className="primary-btn" type="button" onClick={handleSaveDocMeta}>Save Changes</button>
              <button className="table-btn" type="button" onClick={() => setEditDocMeta(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function QuizView() {
  return (
    <section className="view-stack">
      <ScopeBar />
      <div className="panel-grid two-wide">
        <article className="panel">
          <h4>Question 7 of 20</h4>
          <p>What is the derivative of f(x) = x ln(x)?</p>
          <ul className="line-list">
            <li>A. ln(x) + 1</li>
            <li>B. 1/x</li>
            <li>C. ln(x)</li>
            <li>D. x ln(x) + x</li>
          </ul>
          <p className="hint">Placeholder feedback and grading flow.</p>
        </article>
        <article className="panel">
          <h4>Progress</h4>
          <ul className="line-list">
            <li>Answered: 6/20</li>
            <li>Correct: 5</li>
            <li>Accuracy: 83%</li>
          </ul>
          <h4>Export</h4>
          <div className="chip-grid">
            <button className="chip">PDF Student</button>
            <button className="chip">PDF Teacher</button>
            <button className="chip">Word</button>
            <button className="chip">JSON</button>
          </div>
        </article>
      </div>
    </section>
  );
}

export function ChatView() {
  return (
    <section className="view-stack">
      <ScopeBar />
      <article className="panel">
        <h4>Tutor Chat</h4>
        <div className="chat-feed">
          <p><b>AI:</b> I am limited to Mathematics with Integrals tag.</p>
          <p><b>You:</b> Explain chain rule with my notes.</p>
          <p><b>AI:</b> Chain rule placeholder response with citation.</p>
        </div>
        <label className="search full">
          <span>Ask within selected scope</span>
          <input placeholder="Type your question" />
        </label>
      </article>
    </section>
  );
}

export function AnalyticsView() {
  return (
    <section className="view-stack">
      <ScopeBar label="Assess" />
      <div className="panel-grid three">
        <article className="panel">
          <h4>Mastery</h4>
          <h3>78%</h3>
          <p className="hint">Up 12% this month</p>
        </article>
        <article className="panel">
          <h4>Strong</h4>
          <ul className="line-list">
            <li>Derivatives: 91%</li>
            <li>Limits: 86%</li>
          </ul>
        </article>
        <article className="panel">
          <h4>Needs Work</h4>
          <ul className="line-list">
            <li>Integration: 63%</li>
            <li>Integration by Parts: 41%</li>
          </ul>
        </article>
      </div>
      <article className="panel accent">
        AI Insight placeholder: 3 short sessions on Integration by Parts can improve projected score.
      </article>
    </section>
  );
}

export function MarketplaceView({ onGoBuilder }) {
  return (
    <section className="view-stack">
      <div className="panel-grid three">
        <article className="panel"><h4>GMAT Coach</h4><p>Adaptive exam prep placeholder.</p></article>
        <article className="panel"><h4>IELTS Speaking Coach</h4><p>Speaking simulation placeholder.</p></article>
        <article className="panel"><h4>Worksheet Generator</h4><p>Teacher worksheet placeholder.</p></article>
      </div>
      <article className="panel">
        <h4>Build your own agent</h4>
        <p>Create prompt, scope and pricing without coding.</p>
        <button className="primary-btn" onClick={onGoBuilder}>Create Agent</button>
      </article>
    </section>
  );
}

export function BuilderView() {
  return (
    <section className="view-stack">
      <div className="panel-grid two-wide">
        <article className="panel">
          <h4>Agent Configuration</h4>
          <ul className="line-list">
            <li>Name and category placeholder</li>
            <li>Description and system prompt placeholder</li>
            <li>Knowledge scope placeholder</li>
            <li>Input/output schema placeholder</li>
          </ul>
        </article>
        <article className="panel">
          <h4>Pricing and Publish</h4>
          <ul className="line-list">
            <li>Model selector placeholder</li>
            <li>Subscription price placeholder</li>
            <li>Visibility placeholder</li>
            <li>Sandbox test placeholder</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

export function RevenueView() {
  return (
    <section className="view-stack">
      <div className="kpi-grid">
        <article className="kpi-card teal"><p>Revenue 30d</p><h3>$4,820</h3><small>+23%</small></article>
        <article className="kpi-card orange"><p>Total Runs</p><h3>12.4k</h3><small>+1.8k</small></article>
        <article className="kpi-card sky"><p>Active Users</p><h3>842</h3><small>+96</small></article>
        <article className="kpi-card rose"><p>Avg Rating</p><h3>4.8</h3><small>312 reviews</small></article>
      </div>
      <article className="panel">
        <h4>Agent performance table placeholder</h4>
        <p className="hint">Detailed financial reporting remains UI-only for now.</p>
      </article>
    </section>
  );
}
