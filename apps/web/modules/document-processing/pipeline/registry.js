function assertStage(stage) {
  if (!stage || typeof stage !== "object") {
    throw new Error("Pipeline stage must be an object.");
  }
  if (!String(stage.id || "").trim()) {
    throw new Error("Pipeline stage must declare a non-empty id.");
  }
  if (typeof stage.run !== "function") {
    throw new Error(`Pipeline stage ${stage.id} must provide a run function.`);
  }
}

export class PipelineRegistry {
  constructor(stages = []) {
    this.stages = [];
    for (const stage of stages) {
      this.register(stage);
    }
  }

  register(stage) {
    assertStage(stage);
    if (this.stages.some((entry) => entry.id === stage.id)) {
      throw new Error(`Duplicate pipeline stage id: ${stage.id}`);
    }
    this.stages.push(stage);
    return this;
  }

  listStageIds() {
    return this.stages.map((stage) => stage.id);
  }

  async run(initialContext = {}) {
    let context = { ...initialContext };
    for (const stage of this.stages) {
      const next = await stage.run(context);
      if (!next || typeof next !== "object") {
        throw new Error(`Pipeline stage ${stage.id} returned an invalid context.`);
      }
      context = next;
    }
    return context;
  }
}

export function createStage(id, run) {
  return {
    id: String(id || "").trim(),
    run
  };
}
