import { describe, expect, it } from "vitest";
import { visibleSubjects } from "../../modules/ui/subjects.js";
import { childLabel, matchesChildName } from "../../modules/accounts/nouns.js";
import { assignableDocuments, groundingDocumentIds, practiseButtonLabel, questionSetConfig } from "../../modules/accounts/sendQuestions.js";
import { helpFor, tourStepsFor } from "../../components/helpContent.js";
import { classSpecs } from "../../modules/dashboard/ui/classSpecs.js";

describe("topic chips", () => {
  it("hide Shared documents and Shared with me, keep real topics", () => {
    const names = visibleSubjects([{ name: "Accounting" }, { name: "Shared documents" }, { name: "shared with me" }, { name: "Statistics" }]).map((entry) => entry.name);
    expect(names).toEqual(["Accounting", "Statistics"]);
  });
});

describe("deleting a child's account", () => {
  const child = { displayName: "Maria  Garcia", email: "m@x.com" };
  it("needs the child's name typed back", () => {
    expect(matchesChildName("maria garcia", child)).toBe(true);
    expect(matchesChildName("Maria", child)).toBe(false);
    expect(matchesChildName("", { displayName: "", email: "" })).toBe(false);
    expect(childLabel({ email: "m@x.com" })).toBe("m@x.com");
  });
});

describe("send practice", () => {
  const plan = { id: "p", name: "Midterm.plan.json", tags: ["study-plan"], content: "{}" };
  const quiz = { id: "q", name: "Quiz 1.resource.json", tags: ["resource", "activity"], content: "{}" };
  const notes = { id: "n", name: "Notes.docx", tags: [], sourceType: "upload" };
  const received = { id: "r", name: "Sent.resource.json", tags: ["resource", "activity", "shared-by:t1"] };
  const workspaces = [{ subjects: [{ name: "Maths", documents: [plan, quiz, notes, received] }] }];
  it("offers only own activities and plans, activities first", () => {
    expect(assignableDocuments(workspaces).map((entry) => [entry.name, entry.kind])).toEqual([["Quiz 1", "activity"], ["Midterm", "plan"]]);
  });
  it("labels the weak-topic button by viewer", () => {
    expect(practiseButtonLabel("teacher", { questions: 10 }, "Maria")).toBe("Send 10 questions to Maria");
    expect(practiseButtonLabel("parent", { questions: 10 }, "Maria")).toBe("How to help");
    expect(practiseButtonLabel("student", { questions: 6 }, "")).toBe("Practise 6 questions");
  });
  it("builds a 10 question config grounded on uploaded material, topic matches first", () => {
    const config = questionSetConfig({ topic: "Osmosis", count: 10, workspaceId: "w", subjectId: "s", documentIds: groundingDocumentIds([{ subjects: [{ documents: [{ id: "a", name: "Algebra.pdf", sourceType: "upload" }, { id: "b", name: "Osmosis notes.pdf", sourceType: "upload" }] }] }], "Osmosis") });
    expect(config.scope.documentIds[0]).toBe("b");
    expect(config.questionAnswers[0].answer).toBe("10");
  });
});

describe("role copy", () => {
  it("teacher and parent tours do not talk about studying", () => {
    const text = (role) => JSON.stringify(tourStepsFor(role));
    expect(text("teacher")).toMatch(/class/i);
    expect(text("teacher")).not.toMatch(/plan your studying|Do a first quiz/);
    expect(text("parent")).toMatch(/child/i);
    expect(tourStepsFor("parent")).toHaveLength(3);
    expect(tourStepsFor("student")[0].title).toBe("Home: what to do now");
  });
  it("Home and Progress help are role specific", () => {
    expect(helpFor("dashboard", "teacher").what).toMatch(/classes/i);
    expect(helpFor("dashboard", "parent").what).toMatch(/child/i);
    expect(helpFor("dashboard", "student").what).toMatch(/next/i);
  });
  it("one card per group, plus those in no group", () => {
    const groups = [{ id: "g1", name: "Year 10", memberIds: ["a", "b"] }, { id: "g2", name: "Empty", memberIds: [] }];
    const specs = classSpecs(groups, [{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(specs.map((entry) => entry.name)).toEqual(["Year 10", "Not in a class yet"]);
    expect(specs[1].recipientIds).toEqual(["c"]);
    expect(classSpecs([], [{ id: "a" }])[0].name).toBe("All my students");
    expect(classSpecs([], [])).toEqual([]);
  });
  it("groups inside a class stay on the class card, not as classes of their own", () => {
    const groups = [{ id: "g1", name: "Year 10", memberIds: ["a", "b"] }, { id: "g1r", name: "Year 10 · Readers", parentId: "g1", memberIds: ["a"] }];
    expect(classSpecs(groups, [{ id: "a" }, { id: "b" }]).map((entry) => entry.name)).toEqual(["Year 10"]);
  });
});
