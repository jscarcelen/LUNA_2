export const appName = "LUNA";

export const navByRole = {
  student: [
    { key: "dashboard", label: "Dashboard" },
    { key: "workspaces", label: "Workspaces" },
    { key: "quiz", label: "Quizzes and Exams" },
    { key: "chat", label: "Tutor Chat" },
    { key: "analytics", label: "Analytics" },
    { key: "marketplace", label: "Marketplace" }
  ],
  teacher: [
    { key: "dashboard", label: "Dashboard" },
    { key: "workspaces", label: "Workspaces" },
    { key: "quiz", label: "Quizzes and Exams" },
    { key: "chat", label: "Tutor Chat" },
    { key: "analytics", label: "Analytics" },
    { key: "marketplace", label: "Marketplace" },
    { key: "builder", label: "Agent Builder" },
    { key: "revenue", label: "Revenue" }
  ]
};

export const pageTitles = {
  dashboard: "Dashboard",
  workspaces: "Workspaces",
  quiz: "Quiz Engine",
  chat: "Tutor Chat",
  analytics: "Learning Analytics",
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
