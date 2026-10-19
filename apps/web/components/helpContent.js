/**
 * The "?" next to every page title: one plain sentence on what the page is for and the one thing to try. Keyed by the
 * page (the part before "?"). Short on purpose: a person should read it in ten seconds.
 * (The component is PageHelp.js. This file has a different name on purpose: names that differ only by case collide on macOS.)
 */
export const PAGE_HELP = {
  dashboard: { what: "Home shows the one thing to do next, and the quickest ways to start.", tip: "Press the big button on the next-step card." },
  workspaces: { what: "Courses is where your material lives, in folders. Everything Luna makes for you is saved here too.", tip: "Upload your notes, tick a document, then press Make a quiz." },
  plans: { what: "A study plan says what to study and when, with activities and deadlines.", tip: "Press Plan it for me and Luna builds one from your material." },
  activities: { what: "Practice is where you answer quizzes, flashcards and worksheets. Your results feed Progress.", tip: "Open an activity and answer it. Mistakes are saved so you can review them." },
  performance: { what: "Progress shows how you are doing: accuracy, how much you remember, and what to work on next.", tip: "Press the i next to any number to see exactly how it is calculated." },
  students: { what: "Here you see the people you are connected to and how they are doing.", tip: "Open a person to see their progress, or send them something to do." },
  create: { what: "Make turns your material into a quiz, problem set, flashcards or a summary in a few clicks.", tip: "Pick what to make, tick the material, and press Continue." },
  templates: { what: "Output styles control how generated documents look. You rarely need to change them.", tip: "Pick a style when you run a tool. Come here only to design your own." },
  marketplace: { what: "Browse tools other people made. Add one and it appears in Make.", tip: "Open a tool to see what it does before adding it." },
  connections: { what: "People are the teachers, students and parents you are connected to.", tip: "Send a request by email. Both sides must accept." }
};

/** Home and Progress read differently for a teacher or a parent: classes and a child, not "your studying". */
const ROLE_HELP = {
  teacher: {
    dashboard: { what: "Your classes shows, for each class, who is behind and what is due this week.", tip: "Press Send practice on a class to assign it a quiz in one go." },
    performance: { what: "Overview is your own work. My students shows how each student and class is doing.", tip: "Open My students and pick a class or a student." },
    students: { what: "Here you see your classes and students and how each is doing.", tip: "Open a student to see where they struggle and send them 10 questions." }
  },
  parent: {
    dashboard: { what: "Your child this week shows whether they are on track, where they struggle and one way you can help.", tip: "Open your child's progress for the detail." },
    performance: { what: "Overview is your own account. My children shows how each child is doing.", tip: "Open My children and pick a child." },
    students: { what: "Here you see how each of your children is doing. You can look, not change.", tip: "Open a topic your child struggles with and press How to help." }
  }
};

export function helpFor(page = "", role = "student") {
  const base = String(page).split("?")[0];
  if (ROLE_HELP[role]?.[base]) return ROLE_HELP[role][base];
  if (PAGE_HELP[base]) return PAGE_HELP[base];
  if (/^(ai-tool:|custom-agent:|agent-edit:)/.test(String(page)) || ["ai-tools", "builder", "revenue"].includes(base)) return PAGE_HELP.create;
  return null;
}

/** The first-run tour: one step per section. `video` is an optional short clip (a path under /public); a step shows a still illustration until one is added. */
export const TOUR_STEPS = [
  { id: "home", title: "Home: what to do now", text: "Home always shows your next step. Press the big button and Luna takes you there.", icon: "⌂", video: "" },
  { id: "study", title: "Study: your material, plans and practice", text: "Upload notes in Courses, let Luna plan your studying in Study plans, and answer quizzes in Practice.", icon: "📚", video: "" },
  { id: "progress", title: "Progress: how you are doing", text: "See your accuracy, how much you remember, and which topics to work on next.", icon: "◴", video: "" },
  { id: "create", title: "Create: make anything from your notes", text: "Pick a quiz, flashcards or a summary, tick your material, and go. Press the ? on any page for help.", icon: "✦", video: "" }
];

/** The tour for a teacher (classes) or a parent (their child): the student's tour talks about studying, which is not their job here. */
const ROLE_TOUR = {
  teacher: [
    { id: "home", title: "Classes: who needs you", text: "Each class shows who is behind and what is due this week. Press Send practice and the class gets a quiz.", icon: "⌂", video: "" },
    { id: "study", title: "Courses: your material", text: "Upload notes and slides in Courses. Luna builds quizzes and plans from them, and you send them to a class.", icon: "📚", video: "" },
    { id: "progress", title: "Progress: your students", text: "Open My students to see each student and class, where they struggle, and send 10 questions on a weak topic.", icon: "◴", video: "" },
    { id: "create", title: "Create: make practice", text: "Pick a quiz, flashcards or a worksheet, tick your material, and go. Press the ? on any page for help.", icon: "✦", video: "" }
  ],
  parent: [
    { id: "home", title: "Your child this week", text: "Home shows whether your child is on track, where they struggle and one way you can help. Nothing here is a task for you.", icon: "⌂", video: "" },
    { id: "study", title: "Study: what they have planned", text: "Look at your child's courses and study plans. You can read them, not change them.", icon: "📚", video: "" },
    { id: "progress", title: "Progress: how they are doing", text: "Open My children for accuracy, what they remember and which topics need support. Press How to help for ideas.", icon: "◴", video: "" }
  ]
};

export const tourStepsFor = (role = "student") => ROLE_TOUR[role] || TOUR_STEPS;

export const TOUR_KEY = "luna.tour.v1";
export const TOUR_EVENT = "luna:tour";
