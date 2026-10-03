import { buildResource } from "../resources/resource";
import { createAgentSpec, createInput } from "../agent-studio/engine/model";
import { runConfigFromSpec } from "../agent-studio/engine/migrate";
import { generateStepResource } from "../plans/execute";

/** The look each kind of block gets by default (Template Studio component ids). */
const FORMAT_OF_BLOCK = {
  document_header: "block-header-minimal", heading: "block-headings", paragraph: "block-paragraph", bullet_list: "block-key-points", callout: "block-callout", vocabulary: "block-vocabulary-row",
  section_header: "block-section-header", question_mc: "block-exam-question", question_open: "block-open-question", question_tf: "block-true-false", question_fill: "block-fill-blanks", flashcard: "block-flashcard-single"
};

/** Runs an agent the assistant proposed and the user approved. Nothing is saved: the result comes back for preview and "Save…". */
export async function runProposedAgent(action, { workspaceId, subjectId, subjectName, agentDocuments }) {
  const key = action.agent;
  const step = { title: action.title || "Generated result", kind: "activity", generate: key, concepts: [], dueDate: "" };
  const made = await generateStepResource({
    step,
    sourceDocumentIds: action.sourceDocumentIds || [],
    workspaceId,
    subjectId,
    subjectName,
    agentDocuments,
    options: action.options || {},
    extraInstructions: ""
  });
  return made;
}

/** A document the assistant wrote → a resource laid out with the default document template. */
export function documentFromAction(action, { subjectName = "" } = {}) {
  const blocks = (action.blocks || []).map((block) => ({ ...block, level: block.level ? Number(block.level) : block.level }));
  const resource = buildResource({
    name: action.title || "Document",
    data: { items: [], isBlockOutput: true, blocks, sources: [], title: action.title || "" },
    request: { outputStyles: {} },
    meta: { agentName: "Luna assistant", subjectName }
  });
  return resource;
}

/** The agent the assistant drafted → the saved agent document (same shape Agent Studio saves). */
export function agentFromAction(action) {
  const spec = createAgentSpec(action.name || "New agent");
  spec.purpose = { headline: action.purpose || "", description: action.purpose || "", category: "Custom" };
  spec.instructions = { core: action.instructions || "", constraints: [] };
  const typeOf = { text: "text", number: "number", choice: "choice", toggle: "toggle", language: "language" };
  spec.inputs = (action.inputs || []).map((input) => createInput(input.name, typeOf[input.type] || "text", {
    ...(input.options?.length ? { options: input.options } : {}),
    ...(input.default !== undefined && input.default !== "" ? { default: input.default } : {})
  }));
  spec.output = { selectedBlocks: (action.outputBlocks || []).map((blockId) => ({ blockId, formatId: FORMAT_OF_BLOCK[blockId] || blockId, color: "blue" })) };
  const config = runConfigFromSpec(spec);
  const content = JSON.stringify(config, null, 2);
  return { spec, name: spec.name, fileName: `${spec.name}.agent.json`, content, prompt: config.instructions };
}
