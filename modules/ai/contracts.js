export const AI_DOMAIN_VERSION = "1";

const REQUIRED_TOOL_FIELDS = ["id", "name", "description", "runLabel", "component"];

export function validateAiToolManifest(tool) {
  const issues = [];

  if (!tool || typeof tool !== "object") {
    return { ok: false, issues: ["tool manifest must be an object"] };
  }

  for (const field of REQUIRED_TOOL_FIELDS) {
    if (!tool[field]) {
      issues.push(`missing required field: ${field}`);
    }
  }

  if (tool.id && typeof tool.id !== "string") {
    issues.push("field id must be a string");
  }

  if (tool.pipelineConfig && typeof tool.pipelineConfig !== "object") {
    issues.push("field pipelineConfig must be an object when provided");
  }

  return { ok: issues.length === 0, issues };
}