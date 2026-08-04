import { appName, navByRole } from "./data";

export function SideNav({ role, page, onPageChange, onRoleChange }) {
  const nav = navByRole[role];

  return (
    <aside className="side-nav">
      <div className="brand-wrap">
        <div className="brand-dot" />
        <h1>{appName}</h1>
      </div>

      <div className="role-switch" role="tablist" aria-label="Role selector">
        <button
          className={role === "student" ? "on" : ""}
          onClick={() => onRoleChange("student")}
        >
          Student
        </button>
        <button
          className={role === "teacher" ? "on" : ""}
          onClick={() => onRoleChange("teacher")}
        >
          Teacher
        </button>
      </div>

      <nav>
        {nav.map((item) => (
          <button
            key={item.key}
            className={page === item.key ? "nav-item on" : "nav-item"}
            onClick={() => onPageChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

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
