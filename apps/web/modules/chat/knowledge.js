/**
 * What the assistant knows about Luna itself, so it can answer "how do I…?" with a short, structured
 * walkthrough. Written from the app as it is today — extend it when the product changes.
 */
export const LUNA_GUIDE = `
LUNA — WHAT THE APP DOES TODAY
Luna turns a learner's own material into a study plan, practice and results.

Main areas (left sidebar): Home · Workspaces · Activities · Study plans · Performance · AI agents · Templates · Marketplace.

WORKSPACES (sidebar → Workspaces)
- A workspace holds subjects (the top-level folders); each subject has folders inside folders. Everything — uploaded material and everything Luna generates — lives in this one tree.
- To find a document: Workspaces → choose the subject → open folders; generated resources sit in the same folders (they show a small activity/resource badge). Click a document to preview it; click a generated resource to open it (Read, Do it, Format & colour, Downloads).
- To upload: Workspaces → Upload (or drag files into the chat). Supported: Word, PDF, PowerPoint, images and handwritten notes, text/Markdown. Luna reads every page: text, headings, formulas, tables and figures.
- Files can be filed in several folders without being copied.

AI AGENTS (sidebar → AI agents)
- An agent is a recipe that turns material into something: a quiz, flashcards, a summary… Built in: Quiz Generator and Vocabulary Flashcards. Users can create their own (Create agent — four steps: what it does, what it reads, what the user chooses, which output blocks it may write), buy agents in the Marketplace, and edit them any time from the AI agents page.
- To run an agent: AI agents → Run. Steps: 1 choose material and answer the agent's questions, 2 Configure output (pick the format and colour of each component, or apply a saved template; Interactive tab shows the HTML version), 3 Export (save, download).
- After a result: "Iterate" lets you ask for a change in words ("focus more on cash flow"); Luna rewrites it.
- Save: "Save resource…" files it in the workspace, and can also add it to Activities (to do on Luna, results tracked) and/or to a study plan, with an optional due date.
- Download: PDF for any page size (A4, Letter, Slides) and view (Student view, Answer key), one file each; or the interactive HTML (it works anywhere, but results done outside Luna are NOT tracked).

TEMPLATES (sidebar → Templates = Template Studio)
- A template is a selection of component formats (document structure, questions, worksheets, games/flashcards) and colours. Agents decide the order and count; the user decides only the look.
- Components include: exam or document header, headings, paragraph, key points, callout, table, multiple choice, true/false, open answer, fill in the blanks, match, flashcards, footer.

STUDY PLANS (sidebar → Study plans)
- "Plan it for me": pick material, a deadline, time per week and which agents may build practice. Luna schedules reading, activities, spaced repetition and a final review, makes sure every concept of the material is studied and tested, and builds the practice. Adding material re-plans only what is still to do.

ACTIVITIES, PERFORMANCE
- Activities lists everything to do on Luna (quizzes, exams, flashcard decks); every attempt, with how sure the learner was, is recorded.
- Performance shows mastery per concept, mistakes by type, trends and what to do next.

MARKETPLACE
- Buy or sell agents, templates, resources and plans. Payment is paid in lunas.

LUNAS
- Lunas are Luna's credit: AI runs spend them (about one luna per token). The balance is at the top right.

THIS ASSISTANT (the chat)
- Answers questions about the user's material with references, answers questions about Luna, writes documents, runs agents (after asking), and can turn a repeatable process into a new agent.
- It can focus on a workspace, subject or folder, or on specific documents the user references or drops in.

NOT AVAILABLE YET
- Creating NEW template components or formats. Everything must be built from the existing components, agents and tools.
`;
