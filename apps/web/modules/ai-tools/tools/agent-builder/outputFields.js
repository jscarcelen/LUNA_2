/**
 * Mapping helpers for the run flow.
 *
 * Templates name the same thing many times: four question designs all have a "Question" slot, and
 * the list that holds them is called "Questions". For the person mapping the output that is one
 * decision, not five — `buildMappingRows` merges slots that mean the same thing (case, spacing and
 * singular/plural ignored) into a single row that writes its choice to every slot behind it.
 *
 * `addOutputField` is the other half: when a template asks for something the agent does not
 * produce (a title, a question number…), the field is added to the agent itself — output fields,
 * JSON schema and, for Agent Studio recipes, the output specification — so the next run returns it.
 */

/** "Questions", "question_text" and "Question" collapse to the same slot. */
export function mergeKey(name) {
  const normalized = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (normalized.length > 3 && normalized.endsWith("ies")) return `${normalized.slice(0, -3)}y`;
  if (normalized.length > 3 && /(ses|xes|zes|ches|shes)$/.test(normalized)) return normalized.slice(0, -2);
  if (normalized.length > 2 && normalized.endsWith("s") && !normalized.endsWith("ss")) return normalized.slice(0, -1);
  return normalized;
}

/**
 * One row per distinct slot. `names` are every template field the row stands for, `count` how many
 * places it fills, and `frequency` is "loop" when any of them repeats.
 */
export function buildMappingRows(templateFields = []) {
  const byKey = new Map();
  for (const field of templateFields) {
    const key = mergeKey(field.name);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...field, names: [field.name], count: 1 });
      continue;
    }
    existing.count += 1;
    if (!existing.names.includes(field.name)) existing.names.push(field.name);
    if (field.frequency === "loop") existing.frequency = "loop";
    // Keep the shortest label: "Question" reads better than "Question text (multiple choice)".
    if ((field.label || field.name).length < (existing.label || existing.name).length) existing.label = field.label || field.name;
  }
  return [...byKey.values()];
}

function slugKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const JSON_TYPE = { text: "string", rich_text: "string", number: "number", boolean: "boolean", list: "array" };

/**
 * Adds a simple field to an agent so it can fill a template slot it was not built for.
 * `frequency` is "loop" (one value per item) or "once" (one value for the whole document).
 */
export function addOutputField(agentConfig, { name, type = "text", frequency = "loop", description = "" } = {}) {
  const clean = String(name || "").trim();
  if (!agentConfig || !clean) return agentConfig;
  const fields = Array.isArray(agentConfig.template?.fields) ? agentConfig.template.fields : [];
  if (fields.some((field) => String(field.name).toLowerCase() === clean.toLowerCase())) return agentConfig;

  const jsonType = JSON_TYPE[type] || "string";
  const next = {
    ...agentConfig,
    template: {
      ...(agentConfig.template || {}),
      fields: [...fields, { name: clean, label: clean, type: jsonType === "array" ? "array" : jsonType, description, repeatScope: frequency === "once" ? "once" : "per-output", addedForTemplate: true }]
    }
  };

  const property = jsonType === "array" ? { type: "array", items: { type: "string" } } : { type: jsonType };
  if (description) property.description = description;

  // Keep the JSON schema the model is held to in step with the fields.
  const schema = agentConfig.outputJsonSchema;
  if (schema && typeof schema === "object" && schema.properties) {
    const copy = JSON.parse(JSON.stringify(schema));
    const target = frequency === "once" ? copy : copy.properties.items?.items;
    if (target && target.properties) {
      target.properties[frequency === "once" ? slugKey(clean) : clean] = property;
      if (Array.isArray(target.required)) target.required = [...new Set([...target.required, frequency === "once" ? slugKey(clean) : clean])];
      next.outputJsonSchema = copy;
    }
  }

  // Agent Studio recipes: the field joins the output specification, so the prompt describes it too.
  const spec = agentConfig.spec;
  if (spec && Array.isArray(spec.outputSchema)) {
    const specField = { id: `fld_${slugKey(clean)}_${Math.random().toString(36).slice(2, 7)}`, name: clean, type: type === "list" ? "array" : type === "rich_text" ? "rich_text" : type, description };
    if (frequency === "once") {
      next.spec = { ...spec, outputSchema: [...spec.outputSchema, specField] };
    } else {
      const primaryIndex = spec.outputSchema.findIndex((field) => field.type === "array");
      if (primaryIndex === -1) {
        next.spec = { ...spec, outputSchema: [...spec.outputSchema, specField] };
      } else {
        const outputSchema = spec.outputSchema.map((field, index) => {
          if (index !== primaryIndex) return field;
          const item = field.children?.[0];
          if (!item || item.type !== "object") return { ...field, children: [{ id: `fld_item_${Math.random().toString(36).slice(2, 7)}`, name: "item", type: "object", children: [...(item ? [item] : []), specField] }] };
          return { ...field, children: [{ ...item, children: [...(item.children || []), specField] }] };
        });
        next.spec = { ...spec, outputSchema };
      }
    }
  }

  return next;
}
