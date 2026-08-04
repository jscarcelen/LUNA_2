import { useState } from "react";
import { kpiCards } from "./data";

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
  onRemoveWorkspace,
  onCreateSubject,
  onRenameSubject,
  onRemoveSubject,
  onCreateFolder,
  onAddTopicTag,
  onRenameFolder,
  onRemoveFolder,
  onRenameTopicTag,
  onRemoveTopicTag,
  onUploadTxt,
  onRenameDocument,
  onRemoveDocument
}) {
  const [folderName, setFolderName] = useState("");
  const [parentFolderId, setParentFolderId] = useState("");
  const [topicTagName, setTopicTagName] = useState("");
  const [uploadFolderId, setUploadFolderId] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [renameDocId, setRenameDocId] = useState("");
  const [renameDocName, setRenameDocName] = useState("");
  const [renameWorkspaceId, setRenameWorkspaceId] = useState("");
  const [renameWorkspaceName, setRenameWorkspaceName] = useState("");
  const [renameSubjectId, setRenameSubjectId] = useState("");
  const [renameSubjectName, setRenameSubjectName] = useState("");
  const [renameFolderId, setRenameFolderId] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");
  const [renameTopicTagFrom, setRenameTopicTagFrom] = useState("");
  const [renameTopicTagTo, setRenameTopicTagTo] = useState("");
  const [previewDoc, setPreviewDoc] = useState(null);

  const selectedWorkspace = workspaces.find((item) => item.id === selectedWorkspaceId) || null;
  const subjects = selectedWorkspace ? selectedWorkspace.subjects : [];
  const selectedSubject = subjects.find((item) => item.id === selectedSubjectId) || null;
  const folders = selectedSubject?.folders || [];
  const topicTags = selectedSubject?.topicTags || [];

  function flattenFolders(folderList) {
    const childrenByParent = new Map();
    for (const folder of folderList) {
      const key = folder.parentFolderId || "";
      const list = childrenByParent.get(key) || [];
      list.push(folder);
      childrenByParent.set(key, list);
    }

    const out = [];
    const visit = (parentId, depth) => {
      const children = childrenByParent.get(parentId) || [];
      for (const child of children) {
        out.push({ ...child, depth });
        visit(child.id, depth + 1);
      }
    };

    visit("", 0);
    return out;
  }

  const flattenedFolders = flattenFolders(folders);

  function folderPathMap(folderList) {
    const byId = new Map(folderList.map((folder) => [folder.id, folder]));
    const cache = new Map();

    const labelFor = (id) => {
      if (!id) return "-";
      if (cache.has(id)) return cache.get(id);
      const folder = byId.get(id);
      if (!folder) return "-";

      const parentLabel = folder.parentFolderId ? labelFor(folder.parentFolderId) : "";
      const label = parentLabel && parentLabel !== "-" ? `${parentLabel} / ${folder.name}` : folder.name;
      cache.set(id, label);
      return label;
    };

    const labels = new Map();
    for (const folder of folderList) {
      labels.set(folder.id, labelFor(folder.id));
    }
    return labels;
  }

  const folderLabels = folderPathMap(folders);

  function parseTagList(rawValue) {
    return rawValue
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  }

  function handleCreateWorkspace(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const field = form.elements.namedItem("workspaceName");
    const name = field && "value" in field ? field.value.trim() : "";
    if (!name) return;
    onCreateWorkspace(name);
    form.reset();
  }

  function handleCreateSubject(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const field = form.elements.namedItem("subjectName");
    const name = field && "value" in field ? field.value.trim() : "";
    if (!name) return;
    onCreateSubject(name);
    form.reset();
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

  function handleCancelRenameWorkspace() {
    setRenameWorkspaceId("");
    setRenameWorkspaceName("");
  }

  function handleRemoveWorkspace(workspaceId) {
    onRemoveWorkspace(workspaceId);
    if (selectedWorkspaceId === workspaceId) {
      setRenameSubjectId("");
      setRenameSubjectName("");
    }
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

  function handleCancelRenameSubject() {
    setRenameSubjectId("");
    setRenameSubjectName("");
  }

  function handleRemoveSubject(subjectId) {
    onRemoveSubject(subjectId);
    if (selectedSubjectId === subjectId) {
      setRenameFolderId("");
      setRenameFolderName("");
      setRenameTopicTagFrom("");
      setRenameTopicTagTo("");
    }
  }

  function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const tags = parseTagList(uploadTags);
    onUploadTxt(files, {
      folderId: uploadFolderId || folders[0]?.id || "",
      tags
    });
    event.target.value = "";
  }

  function handleCreateFolder(event) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    onCreateFolder(name, parentFolderId);
    setFolderName("");
    setParentFolderId("");
  }

  function handleAddTopicTag(event) {
    event.preventDefault();
    const tag = topicTagName.trim();
    if (!tag) return;
    onAddTopicTag(tag);
    setTopicTagName("");
  }

  function handleStartRename(document) {
    setRenameDocId(document.id);
    setRenameDocName(document.name);
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

  function handleCancelRenameFolder() {
    setRenameFolderId("");
    setRenameFolderName("");
  }

  function handleRemoveFolder(folderId) {
    if (!window.confirm("Remove this folder? Documents will remain but lose folder assignment.")) return;
    onRemoveFolder(folderId);
    if (uploadFolderId === folderId) {
      setUploadFolderId("");
    }
  }

  function handleStartRenameTopicTag(tag) {
    setRenameTopicTagFrom(tag);
    setRenameTopicTagTo(tag);
  }

  function handleSaveRenameTopicTag() {
    const nextTag = renameTopicTagTo.trim();
    if (!renameTopicTagFrom || !nextTag) return;
    onRenameTopicTag(renameTopicTagFrom, nextTag);
    setRenameTopicTagFrom("");
    setRenameTopicTagTo("");
  }

  function handleCancelRenameTopicTag() {
    setRenameTopicTagFrom("");
    setRenameTopicTagTo("");
  }

  function handleRemoveTopicTag(tag) {
    if (!window.confirm("Remove this topic tag? It will be removed from related documents too.")) return;
    onRemoveTopicTag(tag);
  }

  function handleSaveRename(documentId) {
    const nextName = renameDocName.trim();
    if (!nextName) return;
    onRenameDocument(documentId, nextName);
    setRenameDocId("");
    setRenameDocName("");
  }

  function handleRemove(documentId) {
    if (!window.confirm("Remove this document?")) return;
    onRemoveDocument(documentId);
    if (previewDoc?.id === documentId) {
      setPreviewDoc(null);
    }
  }

  return (
    <section className="view-stack">
      <div className="scope-bar">
        <b>Workspace Builder</b>
        <span>Create workspace</span>
        <span>Add subjects</span>
        <span>Create folders, subfolders, and topic tags</span>
        <span>Upload TXT documents</span>
        <span>Persisted via Supabase API routes</span>
      </div>

      {statusMessage ? <p className="hint">{statusMessage}</p> : null}
      {isWorking ? <p className="hint">Syncing changes...</p> : null}

      <div className="panel-grid two-wide">
        <article className="panel">
          <h4>Create Workspace</h4>
          <form className="form-stack" onSubmit={handleCreateWorkspace}>
            <label className="field-label" htmlFor="workspaceName">Workspace name</label>
            <input
              id="workspaceName"
              name="workspaceName"
              className="input"
              placeholder="e.g. High School 2026"
              disabled={isWorking}
            />
            <button className="primary-btn" type="submit" disabled={isWorking}>Add Workspace</button>
          </form>

          <h4 style={{ marginTop: "18px" }}>Workspaces</h4>
          <div className="button-list">
            {workspaces.map((workspace) => (
              <div className="entity-row" key={workspace.id}>
                {renameWorkspaceId === workspace.id ? (
                  <div className="inline-actions entity-main">
                    <input
                      className="input"
                      value={renameWorkspaceName}
                      onChange={(event) => setRenameWorkspaceName(event.target.value)}
                      disabled={isWorking}
                    />
                    <button className="table-btn" type="button" onClick={() => handleSaveRenameWorkspace(workspace.id)} disabled={isWorking}>Save</button>
                    <button className="table-btn" type="button" onClick={handleCancelRenameWorkspace} disabled={isWorking}>Cancel</button>
                  </div>
                ) : (
                  <button
                    className={workspace.id === selectedWorkspaceId ? "list-btn on entity-main" : "list-btn entity-main"}
                    onClick={() => onSelectWorkspace(workspace.id)}
                    disabled={isWorking}
                    type="button"
                  >
                    <span>{workspace.name}</span>
                    <small>{workspace.subjects.length} subjects</small>
                  </button>
                )}

                {renameWorkspaceId !== workspace.id ? (
                  <div className="inline-actions">
                    <button className="table-btn" type="button" onClick={() => handleStartRenameWorkspace(workspace)} disabled={isWorking}>Edit</button>
                    <button className="table-btn danger" type="button" onClick={() => handleRemoveWorkspace(workspace.id)} disabled={isWorking}>Delete</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <h4>Create Subject</h4>
          <form className="form-stack" onSubmit={handleCreateSubject}>
            <label className="field-label" htmlFor="subjectName">Subject in selected workspace</label>
            <input
              id="subjectName"
              name="subjectName"
              className="input"
              placeholder="e.g. Mathematics"
              disabled={!selectedWorkspace || isWorking}
            />
            <button className="primary-btn" type="submit" disabled={!selectedWorkspace || isWorking}>
              Add Subject
            </button>
          </form>

          <h4 style={{ marginTop: "18px" }}>Subjects</h4>
          {!selectedWorkspace && <p className="hint">Select a workspace first.</p>}
          {selectedWorkspace && subjects.length === 0 && <p className="hint">No subjects yet in this workspace.</p>}
          {selectedWorkspace && subjects.length > 0 && (
            <div className="button-list">
              {subjects.map((subject) => (
                <div className="entity-row" key={subject.id}>
                  {renameSubjectId === subject.id ? (
                    <div className="inline-actions entity-main">
                      <input
                        className="input"
                        value={renameSubjectName}
                        onChange={(event) => setRenameSubjectName(event.target.value)}
                        disabled={isWorking}
                      />
                      <button className="table-btn" type="button" onClick={() => handleSaveRenameSubject(subject.id)} disabled={isWorking}>Save</button>
                      <button className="table-btn" type="button" onClick={handleCancelRenameSubject} disabled={isWorking}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      className={subject.id === selectedSubjectId ? "list-btn on entity-main" : "list-btn entity-main"}
                      onClick={() => onSelectSubject(subject.id)}
                      disabled={isWorking}
                      type="button"
                    >
                      <span>{subject.name}</span>
                      <small>{subject.documents.length} docs</small>
                    </button>
                  )}

                  {renameSubjectId !== subject.id ? (
                    <div className="inline-actions">
                      <button className="table-btn" type="button" onClick={() => handleStartRenameSubject(subject)} disabled={isWorking}>Edit</button>
                      <button className="table-btn danger" type="button" onClick={() => handleRemoveSubject(subject.id)} disabled={isWorking}>Delete</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <article className="panel">
        <h4>Subject Organization</h4>
        <p className="hint">Add folders and topic tags under the selected subject.</p>

        <div className="panel-grid two">
          <form className="form-stack" onSubmit={handleCreateFolder}>
            <label className="field-label" htmlFor="folderName">Create folder</label>
            <input
              id="folderName"
              className="input"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="e.g. Chapter 4"
              disabled={!selectedSubject || isWorking}
            />
            <label className="field-label" htmlFor="parentFolderId">Parent folder (optional)</label>
            <select
              id="parentFolderId"
              className="input"
              value={parentFolderId}
              onChange={(event) => setParentFolderId(event.target.value)}
              disabled={!selectedSubject || isWorking}
            >
              <option value="">Top level</option>
              {flattenedFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {`${"  ".repeat(folder.depth)}${folder.name}`}
                </option>
              ))}
            </select>
            <button className="ghost-btn" type="submit" disabled={!selectedSubject || isWorking}>Add Folder</button>
          </form>

          <form className="form-stack" onSubmit={handleAddTopicTag}>
            <label className="field-label" htmlFor="topicTagName">Add topic tag</label>
            <input
              id="topicTagName"
              className="input"
              value={topicTagName}
              onChange={(event) => setTopicTagName(event.target.value)}
              placeholder="e.g. derivatives"
              disabled={!selectedSubject || isWorking}
            />
            <button className="ghost-btn" type="submit" disabled={!selectedSubject || isWorking}>Add Tag</button>
          </form>
        </div>

        <div className="panel-grid two" style={{ marginTop: "12px" }}>
          <div>
            <p className="field-label">Folders</p>
            {folders.length ? (
              <div className="chip-stack">
                {flattenedFolders.map((folder) => (
                  <div className="scope-chip-row" key={folder.id}>
                    {renameFolderId === folder.id ? (
                      <>
                        <input
                          className="input chip-input"
                          value={renameFolderName}
                          onChange={(event) => setRenameFolderName(event.target.value)}
                          disabled={isWorking}
                        />
                        <button className="table-btn" type="button" onClick={() => handleSaveRenameFolder(folder.id)} disabled={isWorking}>Save</button>
                        <button className="table-btn" type="button" onClick={handleCancelRenameFolder} disabled={isWorking}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className="scope-chip">{`${"  ".repeat(folder.depth)}${folder.name}`}</span>
                        <button className="table-btn" type="button" onClick={() => handleStartRenameFolder(folder)} disabled={isWorking}>Edit</button>
                        <button className="table-btn danger" type="button" onClick={() => handleRemoveFolder(folder.id)} disabled={isWorking}>Delete</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">No folders yet.</p>
            )}
          </div>
          <div>
            <p className="field-label">Topic tags</p>
            {topicTags.length ? (
              <div className="chip-stack">
                {topicTags.map((tag) => (
                  <div className="scope-chip-row" key={tag}>
                    {renameTopicTagFrom === tag ? (
                      <>
                        <input
                          className="input chip-input"
                          value={renameTopicTagTo}
                          onChange={(event) => setRenameTopicTagTo(event.target.value)}
                          disabled={isWorking}
                        />
                        <button className="table-btn" type="button" onClick={handleSaveRenameTopicTag} disabled={isWorking}>Save</button>
                        <button className="table-btn" type="button" onClick={handleCancelRenameTopicTag} disabled={isWorking}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className="scope-chip">#{tag}</span>
                        <button className="table-btn" type="button" onClick={() => handleStartRenameTopicTag(tag)} disabled={isWorking}>Edit</button>
                        <button className="table-btn danger" type="button" onClick={() => handleRemoveTopicTag(tag)} disabled={isWorking}>Delete</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">No topic tags yet.</p>
            )}
          </div>
        </div>
      </article>

      <article className="panel">
        <h4>Upload Documents (TXT only for now)</h4>
        <p className="hint">
          Current scope: {selectedWorkspace ? selectedWorkspace.name : "No workspace"}
          {" / "}
          {selectedSubject ? selectedSubject.name : "No subject"}
        </p>

        <div className="panel-grid two" style={{ marginBottom: "12px" }}>
          <label className="form-stack">
            <span className="field-label">Folder for upload</span>
            <select
              className="input"
              value={uploadFolderId}
              onChange={(event) => setUploadFolderId(event.target.value)}
              disabled={!selectedSubject || isWorking}
            >
              <option value="">No folder</option>
              {flattenedFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>{`${"  ".repeat(folder.depth)}${folder.name}`}</option>
              ))}
            </select>
          </label>
          <label className="form-stack">
            <span className="field-label">Tags for uploaded docs</span>
            <input
              className="input"
              value={uploadTags}
              onChange={(event) => setUploadTags(event.target.value)}
              placeholder="comma,separated,tags"
              disabled={!selectedSubject || isWorking}
            />
          </label>
        </div>

        <label className="upload-box">
          <span>Choose one or more .txt files</span>
          <input
            type="file"
            accept=".txt,text/plain"
            multiple
            disabled={!selectedWorkspace || !selectedSubject || isWorking}
            onChange={handleUpload}
          />
        </label>

        {!selectedWorkspace || !selectedSubject ? (
          <p className="hint" style={{ marginTop: "10px" }}>
            Create/select a workspace and subject before uploading documents.
          </p>
        ) : null}

        {selectedSubject && selectedSubject.documents.length > 0 ? (
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Folder</th>
                  <th>Tags</th>
                  <th>Size</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {selectedSubject.documents.map((doc) => {
                  const isRenaming = renameDocId === doc.id;
                  return (
                    <tr key={doc.id}>
                      <td>
                        {isRenaming ? (
                          <div className="inline-actions">
                            <input
                              className="input"
                              value={renameDocName}
                              onChange={(event) => setRenameDocName(event.target.value)}
                            />
                            <button className="table-btn" onClick={() => handleSaveRename(doc.id)} type="button">Save</button>
                            <button className="table-btn" onClick={() => setRenameDocId("")} type="button">Cancel</button>
                          </div>
                        ) : (
                          <span>{doc.name}</span>
                        )}
                      </td>
                      <td>{folderLabels.get(doc.folderId) || "-"}</td>
                      <td>{doc.tags?.length ? doc.tags.join(", ") : "-"}</td>
                      <td>{doc.sizeLabel}</td>
                      <td>
                        <div className="inline-actions">
                          {!isRenaming ? <button className="table-btn" onClick={() => handleStartRename(doc)} type="button">Rename</button> : null}
                          <button className="table-btn" onClick={() => setPreviewDoc(doc)} type="button">Preview</button>
                          <button className="table-btn danger" onClick={() => handleRemove(doc.id)} type="button">Remove</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint" style={{ marginTop: "10px" }}>
            No TXT files uploaded yet.
          </p>
        )}

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
      </article>
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
