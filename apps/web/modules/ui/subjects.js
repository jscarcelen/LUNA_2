import { isReservedSubjectName } from "../accounts/shared.js";

/** The topics worth a chip: "Shared documents" and "Shared with me" are filled by other people and live in Courses only. */
export const visibleSubjects = (subjects = []) => subjects.filter((subject) => !isReservedSubjectName(subject.name));
