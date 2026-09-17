/** Normalizes the raw agent config posted by the Agent Builder / Run Agent UIs. */
export function normalizeConfig(input = {}) {
  return {
    name: String(input.name || "").trim(),
    instructions: String(input.instructions || "").trim(),
    contextPrompt: String(input.contextPrompt || "").trim(),
    questionAnswers: Array.isArray(input.questionAnswers)
      ? input.questionAnswers
        .map((entry) => ({
          question: String(entry?.question || "").trim(),
          answer: Array.isArray(entry?.answer) ? entry.answer.join(", ") : String(entry?.answer ?? "").trim()
        }))
        .filter((entry) => entry.question)
      : [],
    outputExample: String(input.outputExample || "").trim(),
    refinementPrompt: String(input.refinementPrompt || "").trim(),
    previousOutput: input.previousOutput || null,
    model: String(input.model || "").trim(),
    creativity: String(input.creativity || "medium").trim(),
    template: {
      fields: Array.isArray(input.template?.fields)
        ? input.template.fields
          .map((field) => ({
            name: String(field?.name || "").trim(),
            label: String(field?.label || field?.name || "").trim(),
            type: ["string", "number", "boolean", "array"].includes(field?.type) ? field.type : "string",
            repeatScope: field?.repeatScope === "once" ? "once" : "per-output"
          }))
          .filter((field) => field.name)
        : []
    },
    scope: {
      workspaceId: String(input.scope?.workspaceId || ""),
      subjectId: String(input.scope?.subjectId || ""),
      documentIds: Array.isArray(input.scope?.documentIds) ? input.scope.documentIds : []
    }
  };
}
