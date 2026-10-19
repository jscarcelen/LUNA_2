import { isReservedSubjectName } from "../accounts/shared.js";

/** The topics worth a chip: "Shared documents" and "Shared with me" are filled by other people and live in Courses only. */
export const visibleSubjects = (subjects = []) => subjects.filter((subject) => !isReservedSubjectName(subject.name));

/** The topic a screen opens on: the first one of your own, else the first one there is (a new teacher may only have the shared ones). */
export const defaultSubjectId = (subjects = []) => (visibleSubjects(subjects)[0] || subjects[0])?.id || "";

/** True when the selected topic is one of the shared ones and you have none of your own to plan or practise in. */
export const needsOwnSubject = (subjects = [], selectedSubjectId = "") => {
  const selected = subjects.find((subject) => subject.id === selectedSubjectId);
  return Boolean(selected && isReservedSubjectName(selected.name) && !visibleSubjects(subjects).length);
};
