export function TopBar({ title }) {
  return (
    <header className="top-bar">
      <h2>{title}</h2>
      <label className="search">
        <span>Search</span>
        <input placeholder="Documents, agents, quizzes" />
      </label>
      <button className="primary-btn">New</button>
    </header>
  );
}
