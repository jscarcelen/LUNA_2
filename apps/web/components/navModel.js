/**
 * The shape of the app's navigation: four sections, each with a few tabs inside it.
 *
 *   Home      what to do next
 *   Study     Courses (the material) · Study plans · Practice
 *   Progress  how am I doing (teachers and parents: also their students)
 *   Create    Make (quick make + my tools) · Output styles · Browse tools
 *
 * Every page key the app already used (`workspaces`, `plans?open=…`, `ai-tool:quiz-generator`…) keeps working: this
 * file only says which section a page belongs to, so links, history and old bookmarks do not break. Pure, tested.
 */

export const SECTION_INFO = {
  dashboard: { label: "Home", icon: "⌂", landing: "dashboard" },
  study: { label: "Study", icon: "📚", landing: "workspaces" },
  progress: { label: "Progress", icon: "◴", landing: "performance" },
  create: { label: "Create", icon: "✦", landing: "create" }
};

const PREFIXES = [
  ["study", ["workspaces", "plans", "activities", "resources"]],
  ["progress", ["performance", "students"]],
  ["create", ["create", "ai-tools", "ai-tool:", "custom-agent:", "agent-edit:", "templates", "marketplace", "builder", "revenue"]]
];

/** Which section a page key belongs to. Pages that are not in a section (connections) belong to none. */
export function sectionOf(page = "") {
  const value = String(page || "");
  if (!value || value === "dashboard") return "dashboard";
  for (const [section, prefixes] of PREFIXES) {
    if (prefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}?`) || (prefix.endsWith(":") && value.startsWith(prefix)))) return section;
  }
  return "";
}

/** The sections a role sees, in order. Parents do not create material, so they have no Create. */
export function sectionsFor(role = "student") {
  return role === "parent" ? ["dashboard", "study", "progress"] : ["dashboard", "study", "progress", "create"];
}

const HOME_LABEL = { student: "Home", teacher: "Classes", parent: "Children" };

/**
 * The page a section opens. Progress opens on "My students" / "My children" for a teacher or parent with an account:
 * their own stats are empty, the people they follow are the point.
 */
export function landingOf(section, role = "student", account = false) {
  if (section === "progress" && account && role !== "student") return "students";
  return SECTION_INFO[section].landing;
}

/** The rail / bottom bar items: `{ key (the page it opens), section, label, icon }`. */
export function navFor(role = "student", account = false) {
  return sectionsFor(role).map((section) => ({
    key: landingOf(section, role, account),
    section,
    label: section === "dashboard" ? HOME_LABEL[role] || "Home" : SECTION_INFO[section].label,
    icon: SECTION_INFO[section].icon
  }));
}

/**
 * The tabs inside a section: `{ key (page), label, matches }`. Fewer than two means no tab bar.
 * `account` is true on the real platform, where teachers and parents can open their students.
 */
export function tabsFor(section, role = "student", account = false) {
  if (section === "study") return [
    { key: "workspaces", label: "Courses", hint: "Your material, organised in folders" },
    { key: "plans", label: "Study plans", hint: "What to study, and when" },
    { key: "activities", label: "Practice", hint: "Quizzes, flashcards and worksheets" }
  ];
  if (section === "progress") {
    const tabs = [{ key: "performance", label: role === "student" ? "My progress" : "Overview", hint: "Accuracy, retention and what to work on" }];
    // Teachers and parents see the people they follow first: that is what Progress is for them.
    if (account && role !== "student") tabs.unshift({ key: "students", label: role === "parent" ? "My children" : "My students", hint: "See how each person is doing" });
    return tabs;
  }
  if (section === "create") {
    const tabs = [
      { key: "create", label: "Make", hint: "Make a quiz, flashcards or a summary from your material" },
      { key: "marketplace", label: "Browse tools", hint: "Tools other people made" }
    ];
    // Output styles are for people who design their own look: teachers and creators.
    if (role !== "student") tabs.splice(1, 0, { key: "templates", label: "Output styles", hint: "How generated documents look (advanced)" });
    return tabs;
  }
  return [];
}

/** The tab that is open, for a page key (`ai-tool:quiz-generator` is a tool inside Make). */
export function tabKeyOf(page = "") {
  const value = String(page || "");
  const base = value.split("?")[0];
  if (["ai-tools", "builder", "revenue"].includes(base) || /^(ai-tool:|custom-agent:|agent-edit:)/.test(value)) return "create";
  if (base === "resources") return "workspaces";
  return base;
}

/** Is this page one the role can open? (Used for links such as /platform?page=connections.) */
export function isPageAllowed(page = "", role = "student", account = false) {
  const base = String(page || "").split("?")[0];
  if (base === "dashboard") return true;
  if (base === "connections") return Boolean(account);
  const section = sectionOf(page);
  if (!section) return false;
  if (!sectionsFor(role).includes(section)) return false;
  if (base === "students") return Boolean(account) && role !== "student";
  return true;
}

/** Plain-language names for page titles. */
export const PAGE_TITLES = {
  dashboard: "Home",
  workspaces: "Courses",
  plans: "Study plans",
  activities: "Practice",
  performance: "Progress",
  create: "Make something",
  "ai-tools": "Make something",
  templates: "Output styles",
  marketplace: "Browse tools",
  builder: "Build a tool",
  revenue: "Creator earnings",
  connections: "People",
  students: "My students"
};

/** Phone-sized names: the top bar has little room, so a long title would be cut ("Make study…"). */
export const SHORT_TITLES = {
  dashboard: "Home",
  workspaces: "Courses",
  plans: "Study",
  activities: "Practice",
  performance: "Progress",
  create: "Make",
  "ai-tools": "Make",
  templates: "Styles",
  marketplace: "Browse",
  builder: "Build",
  revenue: "Earnings",
  connections: "People",
  students: "Students"
};

const HOME_TITLE = { student: "Home", teacher: "Classes", parent: "Children" };
const HOME_SHORT = { student: "Home", teacher: "Classes", parent: "Children" };

/** The page name shown in the top bar. Tools and agents (`ai-tool:…`) pass their own name as `toolName`. */
export function titleOf(page = "", role = "student", toolName = "") {
  const value = String(page || "");
  if (toolName) return toolName;
  if (!value || value === "dashboard") return HOME_TITLE[role] || "Home";
  const base = value.split("?")[0];
  if (base === "students" && role === "parent") return "My children";
  return PAGE_TITLES[base] || (sectionOf(value) === "create" ? "Make something" : "LUNA");
}

/** The short top-bar name for a phone ("My students" → "Students", "Make something" → "Make", "Study plans" → "Study"). */
export function shortTitleOf(page = "", role = "student") {
  const value = String(page || "");
  if (!value || value === "dashboard") return HOME_SHORT[role] || "Home";
  const base = value.split("?")[0];
  if (SHORT_TITLES[base]) return SHORT_TITLES[base];
  if (sectionOf(value) === "create") return "Make";
  return titleOf(value, role);
}
