/** The cards of "Your classes": one per group, plus everyone not in a group (or all students when there are no groups). */
export function classSpecs(groups = [], students = []) {
  const grouped = new Set(groups.flatMap((group) => group.memberIds || []));
  const specs = groups.filter((group) => (group.memberIds || []).length).map((group) => ({ key: `g:${group.id}:${group.memberIds.join(",")}`, id: group.id, name: group.name, spec: { groupId: group.id }, groupIds: [group.id], recipientIds: [], colour: group.colour }));
  const rest = students.filter((student) => !grouped.has(student.id));
  if (rest.length) specs.push({ key: `s:${rest.map((student) => student.id).join(",")}`, id: "", name: groups.length ? "Not in a class yet" : "All my students", spec: { studentIds: rest.map((student) => student.id) }, groupIds: [], recipientIds: rest.map((student) => student.id), colour: "" });
  return specs;
}

