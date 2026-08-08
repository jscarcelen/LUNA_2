function assertNamedComponent(component, kind = "component") {
  if (!component || typeof component !== "object") {
    throw new Error(`${kind} must be an object.`);
  }
  if (!String(component.id || "").trim()) {
    throw new Error(`${kind} must declare a non-empty id.`);
  }
}

export class ComponentRegistry {
  constructor(kind = "component") {
    this.kind = kind;
    this.byId = new Map();
  }

  register(component = {}) {
    assertNamedComponent(component, this.kind);
    if (this.byId.has(component.id)) {
      throw new Error(`Duplicate ${this.kind} id: ${component.id}`);
    }
    this.byId.set(component.id, component);
    return this;
  }

  get(id = "") {
    return this.byId.get(String(id || "").trim()) || null;
  }

  list() {
    return Array.from(this.byId.keys());
  }
}

export class DocumentPipelineRegistry {
  constructor() {
    this.byType = new Map();
  }

  register(type, spec = {}) {
    const key = String(type || "").trim().toLowerCase();
    if (!key) {
      throw new Error("Document pipeline type is required.");
    }
    this.byType.set(key, { ...spec, type: key });
    return this;
  }

  get(type = "") {
    const key = String(type || "").trim().toLowerCase();
    return this.byType.get(key) || this.byType.get("default") || null;
  }

  listTypes() {
    return Array.from(this.byType.keys());
  }
}

export function createPipelineSpec({ parserId = "", rendererId = "", chunkerId = "", embedderId = "", validatorId = "" } = {}) {
  return {
    parserId: String(parserId || "").trim(),
    rendererId: String(rendererId || "").trim(),
    chunkerId: String(chunkerId || "").trim(),
    embedderId: String(embedderId || "").trim(),
    validatorId: String(validatorId || "").trim()
  };
}
