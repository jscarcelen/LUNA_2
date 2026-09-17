/**
 * Data seam for the role dashboards.
 *
 * Until accounts and quiz attempts exist (roadmap phases 2–4) these functions return sample data
 * so the teacher / student / parent experiences can be designed and reviewed. Each function has
 * the signature it will keep once it reads from Supabase, so swapping the implementation is local
 * to this file. `isSampleData` lets the UI label the state honestly.
 */

export const isSampleData = true;

export const FORMAT_LABELS = {
  flashcards: "Flashcards",
  summary: "Written summary",
  quiz: "Practice quiz",
  schema: "Diagram / schema",
  worksheet: "Worksheet"
};

const STUDENTS = [
  { id: "s1", name: "Maria G.", initials: "MG", scores: { Maths: 82, History: 71, Biology: 88 }, preferredFormat: "flashcards", trend: 6, streak: 9, studyMinutes: 870, lastActive: "Today" },
  { id: "s2", name: "Lucas P.", initials: "LP", scores: { Maths: 64, History: 79, Biology: 70 }, preferredFormat: "summary", trend: -3, streak: 2, studyMinutes: 410, lastActive: "Yesterday" },
  { id: "s3", name: "Aisha K.", initials: "AK", scores: { Maths: 91, History: 85, Biology: 93 }, preferredFormat: "quiz", trend: 4, streak: 14, studyMinutes: 1120, lastActive: "Today" },
  { id: "s4", name: "Tom R.", initials: "TR", scores: { Maths: 58, History: 62, Biology: 66 }, preferredFormat: "schema", trend: 2, streak: 0, studyMinutes: 260, lastActive: "3 days ago" },
  { id: "s5", name: "Sofía M.", initials: "SM", scores: { Maths: 77, History: 90, Biology: 81 }, preferredFormat: "summary", trend: 8, streak: 6, studyMinutes: 690, lastActive: "Today" }
];

const ASSIGNMENTS = [
  { id: "a1", title: "Integration by parts — practice set", subject: "Maths", format: "quiz", due: "Tomorrow", status: "open", completed: 3, total: 5 },
  { id: "a2", title: "French Revolution — key dates", subject: "History", format: "flashcards", due: "Fri", status: "open", completed: 1, total: 5 },
  { id: "a3", title: "Cell respiration summary", subject: "Biology", format: "summary", due: "Done", status: "done", completed: 5, total: 5 }
];

const ACTIVITY = [
  { id: "e1", text: "Quiz completed: Calculus Ch.4 (18/20)", when: "2h ago", kind: "quiz" },
  { id: "e2", text: "Flashcards reviewed: French Revolution (32 cards)", when: "Yesterday", kind: "flashcards" },
  { id: "e3", text: "Uploaded: Exam_2023.pdf — 14 pages indexed", when: "2 days ago", kind: "upload" },
  { id: "e4", text: "Agent added from marketplace: Flashcard Maker", when: "3 days ago", kind: "agent" }
];

export function average(values = []) {
  const list = values.filter((value) => Number.isFinite(value));
  return list.length ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length) : 0;
}

export function getStudentInsights(studentId = "s1") {
  const student = STUDENTS.find((item) => item.id === studentId) || STUDENTS[0];
  const subjects = Object.entries(student.scores).map(([subject, score]) => ({ subject, score }));
  const weakest = [...subjects].sort((a, b) => a.score - b.score)[0];
  const strongest = [...subjects].sort((a, b) => b.score - a.score)[0];
  return {
    student,
    overall: average(subjects.map((item) => item.score)),
    subjects,
    weakest,
    strongest,
    assignments: ASSIGNMENTS,
    activity: ACTIVITY,
    formatScores: { flashcards: 86, quiz: 79, summary: 68, schema: 74, worksheet: 71 }
  };
}

export function getClassInsights() {
  const students = STUDENTS.map((student) => ({ ...student, overall: average(Object.values(student.scores)) }));
  const classAverage = average(students.map((student) => student.overall));
  const formatMix = students.reduce((mix, student) => {
    mix[student.preferredFormat] = (mix[student.preferredFormat] || 0) + 1;
    return mix;
  }, {});
  const needsAttention = students.filter((student) => student.overall < 70 || student.trend < 0);
  return {
    className: "Year 10 — Group B",
    students,
    classAverage,
    formatMix,
    needsAttention,
    assignments: ASSIGNMENTS,
    suggestions: needsAttention.map((student) => ({
      studentId: student.id,
      name: student.name,
      subject: Object.entries(student.scores).sort((a, b) => a[1] - b[1])[0][0],
      format: student.preferredFormat
    }))
  };
}

export function getChildrenInsights() {
  return {
    children: [STUDENTS[0], STUDENTS[3]].map((student) => {
      const subjects = Object.entries(student.scores).map(([subject, score]) => ({ subject, score }));
      return {
        ...student,
        overall: average(subjects.map((item) => item.score)),
        subjects,
        weekMinutes: Math.round(student.studyMinutes / 4),
        openAssignments: ASSIGNMENTS.filter((item) => item.status === "open").length
      };
    }),
    activity: ACTIVITY
  };
}
