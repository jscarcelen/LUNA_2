import { aiToolsRegistry } from "../registry";

export function AIToolsHubPage({ onOpenTool }) {
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
      </div>
    </section>
  );
}
