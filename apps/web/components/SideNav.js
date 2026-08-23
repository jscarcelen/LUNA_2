import { useState } from "react";
import { appName } from "./data";

export function SideNav({
  role,
  onRoleChange,
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onSetWorkspaceColor,
  onRemoveWorkspace,
  isWorking
}) {
  const [showAddWorkspace, setShowAddWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [menuWorkspaceId, setMenuWorkspaceId] = useState("");
  const [editWorkspaceId, setEditWorkspaceId] = useState("");
  const [editWorkspaceName, setEditWorkspaceName] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  function handleCreateWorkspace() {
    const nextName = workspaceName.trim();
    if (!nextName) return;
    onCreateWorkspace(nextName);
    setWorkspaceName("");
    setShowAddWorkspace(false);
  }

  if (collapsed) {
    return (
      <aside className="side-nav workspace-rail side-nav-collapsed">
        <button className="side-nav-collapse-btn" type="button" onClick={() => setCollapsed(false)} title="Expand sidebar">
          <div className="brand-dot" style={{ margin: "0 auto 8px" }} />
          <span style={{ fontSize: 16 }}>›</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="side-nav workspace-rail">
      <div className="brand-wrap">
        <div className="brand-dot" />
        <h1>{appName}</h1>
        <button className="side-nav-collapse-btn" type="button" onClick={() => setCollapsed(true)} title="Collapse sidebar" style={{ marginLeft: "auto" }}>‹</button>
      </div>

      <div className="role-switch" role="tablist" aria-label="Role selector">
        <button className={role === "student" ? "on" : ""} onClick={() => onRoleChange("student")}>Student</button>
        <button className={role === "teacher" ? "on" : ""} onClick={() => onRoleChange("teacher")}>Teacher</button>
      </div>

      <section className="rail-workspaces">
        <div className="rail-workspaces-head">
          <h4>Workspaces</h4>
          <button className="table-btn" type="button" onClick={() => setShowAddWorkspace((previous) => !previous)} disabled={isWorking}>+</button>
        </div>

        {showAddWorkspace ? (
          <div className="rail-add-inline">
            <input className="input" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="New workspace" disabled={isWorking} />
            <button className="primary-btn" type="button" onClick={handleCreateWorkspace} disabled={isWorking}>Add</button>
          </div>
        ) : null}

        <div className="rail-workspace-list">
          {workspaces.map((workspace) => {
            const selected = workspace.id === selectedWorkspaceId;
            const menuOpen = menuWorkspaceId === workspace.id;
            const editing = editWorkspaceId === workspace.id;

            return (
              <div key={workspace.id} className={selected ? "rail-workspace-item on" : "rail-workspace-item"}>
                {editing ? (
                  <div className="rail-inline-edit">
                    <input className="input" value={editWorkspaceName} onChange={(event) => setEditWorkspaceName(event.target.value)} disabled={isWorking} />
                    <div className="inline-actions">
                      <button
                        className="table-btn"
                        type="button"
                        onClick={() => {
                          const nextName = editWorkspaceName.trim();
                          if (!nextName) return;
                          onRenameWorkspace(workspace.id, nextName);
                          setEditWorkspaceId("");
                          setEditWorkspaceName("");
                        }}
                        disabled={isWorking}
                      >
                        Save
                      </button>
                      <button className="table-btn" type="button" onClick={() => setEditWorkspaceId("")} disabled={isWorking}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button className="rail-workspace-main" type="button" onClick={() => onSelectWorkspace(workspace.id)} disabled={isWorking}>
                      <span className="workspace-dot" style={{ backgroundColor: workspace.color || "#9b7cff" }} />
                      <span>{workspace.name}</span>
                    </button>
                    <div className="doc-inline-menu-wrap">
                        <button className="table-btn icon-btn emoji-menu-btn" type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuWorkspaceId((previous) => (previous === workspace.id ? "" : workspace.id));
                        }}
                        disabled={isWorking}
                      >
                          🛠️
                      </button>
                      {menuOpen ? (
                        <div className="row-menu">
                          <button
                            className="table-btn"
                            type="button"
                            onClick={() => {
                              setEditWorkspaceId(workspace.id);
                              setEditWorkspaceName(workspace.name);
                              setMenuWorkspaceId("");
                            }}
                          >
                            Edit
                          </button>
                          <label className="rail-color-row">
                            <span>Color</span>
                            <input
                              className="input color-input"
                              type="color"
                              value={workspace.color || "#9b7cff"}
                              onChange={(event) => onSetWorkspaceColor(workspace.id, event.target.value)}
                              disabled={isWorking}
                            />
                          </label>
                          <button className="table-btn danger" type="button" onClick={() => onRemoveWorkspace(workspace.id)} disabled={isWorking}>Delete</button>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="storage-box">
        <strong>Storage</strong>
        <p className="hint">2.4 GB of 10 GB used</p>
        <div className="storage-meter"><span style={{ width: "24%" }} /></div>
        <button className="table-btn" type="button">Upgrade</button>
      </div>

      <div className="side-footer">
        <div className="avatar">MG</div>
        <div>
          <strong>{role === "teacher" ? "Prof. Rivera" : "Maria G."}</strong>
          <p>{role === "teacher" ? "Teacher and Creator" : "Student Pro"}</p>
        </div>
      </div>
    </aside>
  );
}
