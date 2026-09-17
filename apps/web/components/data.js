export const appName = "LUNA";

export const navByRole = {
  student: [
    { key: "dashboard", label: "Home" },
    { key: "workspaces", label: "Workspaces" },
    { key: "ai-tools", label: "AI Tools" },
    { key: "marketplace", label: "Marketplace" }
  ],
  teacher: [
    { key: "dashboard", label: "Classes" },
    { key: "workspaces", label: "Workspaces" },
    { key: "ai-tools", label: "AI Tools" },
    { key: "ai-tool:template-builder", label: "Template Builder" },
    { key: "marketplace", label: "Marketplace" }
  ],
  parent: [
    { key: "dashboard", label: "Children" },
    { key: "workspaces", label: "Workspaces" },
    { key: "marketplace", label: "Marketplace" }
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
  "ai-tools": "AI Tools",
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
