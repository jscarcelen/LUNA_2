export function AIToolRuntimePage({ title, description, onBack, children }) {
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
