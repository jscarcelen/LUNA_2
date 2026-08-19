import { aiToolsRegistry } from "../registry";

function parseAgentName(document) {
  try {
    const parsed = JSON.parse(String(document.content || "{}"));
    return String(parsed.name || document.name || "Untitled Agent").trim() || "Untitled Agent";
  } catch {
    return document.name || "Untitled Agent";
  }
}

function parseAgentDescription(document) {
  try {
    const parsed = JSON.parse(String(document.content || "{}"));
    return String(parsed.instructions || "").trim().slice(0, 140) || "Custom AI agent.";
  } catch {
    return "Custom AI agent.";
  }
}

export function AIToolsHubPage({ onOpenTool, onOpenCustomAgent, workspaces = [], selectedWorkspaceId, selectedSubjectId }) {
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) || null;
  const selectedSubject = selectedWorkspace?.subjects?.find((subject) => subject.id === selectedSubjectId) || null;
  const customAgents = (selectedSubject?.documents || []).filter(
    (document) => document.sourceType === "generated" && (document.tags || []).includes("ai-agent")
  );

  return (
    <section className="view-stack">
      <article className="panel accent">
        <h4 style={{ marginTop: 0 }}>AI Tools Library</h4>
        <p className="hint">This catalog will keep growing. Click any tool to open its full page.</p>
      </article>

      <div className="panel-grid three">
        {aiToolsRegistry.map((tool) => (
          <article key={tool.id} className="panel ai-tool-card">
            <h4>{tool.name}</h4>
            <p>{tool.description}</p>
            <button className="primary-btn" type="button" onClick={() => onOpenTool(tool.id)}>{tool.runLabel}</button>
          </article>
        ))}
        {customAgents.map((document) => (
          <article key={document.id} className="panel ai-tool-card">
            <h4>{parseAgentName(document)}</h4>
            <p>{parseAgentDescription(document)}</p>
            <button
              className="primary-btn"
              type="button"
              onClick={() => (typeof onOpenCustomAgent === "function" ? onOpenCustomAgent(document.id) : null)}
            >
              Open Agent
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
