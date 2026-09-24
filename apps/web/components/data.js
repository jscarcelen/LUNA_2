export const appName = "LUNA";

export const navByRole = {
  student: [
    { key: "dashboard", label: "Home", icon: "⌂" },
    { key: "workspaces", label: "Workspaces", icon: "🗂" },
    { key: "activities", label: "Activities", icon: "✎" },
    { key: "resources", label: "Resources", icon: "◫" },
    { key: "plans", label: "Study plans", icon: "◷" },
    { key: "performance", label: "Performance", icon: "◴" },
    { key: "ai-tools", label: "AI agents", icon: "✦", match: "ai-tool:" },
    { key: "templates", label: "Templates", icon: "▦" },
    { key: "marketplace", label: "Marketplace", icon: "⬡" }
  ],
  teacher: [
    { key: "dashboard", label: "Classes", icon: "⌂" },
    { key: "workspaces", label: "Workspaces", icon: "🗂" },
    { key: "activities", label: "Activities", icon: "✎" },
    { key: "resources", label: "Resources", icon: "◫" },
    { key: "plans", label: "Study plans", icon: "◷" },
    { key: "performance", label: "Performance", icon: "◴" },
    { key: "ai-tools", label: "AI agents", icon: "✦", match: "ai-tool:" },
    { key: "templates", label: "Templates", icon: "▦" },
    { key: "marketplace", label: "Marketplace", icon: "⬡" }
  ],
  parent: [
    { key: "dashboard", label: "Children", icon: "⌂" },
    { key: "workspaces", label: "Workspaces", icon: "🗂" },
    { key: "activities", label: "Activities", icon: "✎" },
    { key: "resources", label: "Resources", icon: "◫" },
    { key: "plans", label: "Study plans", icon: "◷" },
    { key: "performance", label: "Performance", icon: "◴" },
    { key: "marketplace", label: "Marketplace", icon: "⬡" }
  ]
};

export const roleProfiles = {
  student: { name: "Maria G.", subtitle: "Student", initials: "MG" },
  teacher: { name: "Prof. Rivera", subtitle: "Teacher · Creator", initials: "PR" },
  parent: { name: "Elena G.", subtitle: "Parent of Maria & Tom", initials: "EG" }
};

export const pageTitles = {
  dashboard: "Home",
  workspaces: "Workspaces",
  activities: "Activities",
  resources: "Resources",
  performance: "Performance",
  "ai-tools": "AI agents",
  templates: "Templates",
  plans: "Study plans",
  "ai-tool-quiz": "Quiz Generator",
  "ai-tool-tutor": "AI Tutor",
  "ai-tool-chatbot": "Chatbot",
  marketplace: "Agent Marketplace",
  builder: "Agent Builder",
  revenue: "Creator Revenue"
};

export const kpiCards = [
  { label: "Overall Score", value: "82%", trend: "+6% week", tone: "teal" },
  { label: "Documents Indexed", value: "47", trend: "+4 new", tone: "orange" },
  { label: "Study Time", value: "14.5h", trend: "+2.1h", tone: "sky" },
  { label: "Day Streak", value: "9", trend: "On track", tone: "rose" }
];
