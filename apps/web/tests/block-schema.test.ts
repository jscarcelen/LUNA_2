import { describe, expect, it } from "vitest";
import { BLOCKS, buildJsonSchema } from "../modules/ai-tools/blocks/blockRegistry.js";

describe("block JSON schema", () => {
  it("is valid for OpenAI for any selection: unique required fields, `type` stays the discriminator", () => {
    const ids = Object.keys(BLOCKS);
    for (const selection of [ids, ["document_header", "heading", "paragraph", "bullet_list", "callout", "vocabulary"], ["callout"]]) {
      const item: any = buildJsonSchema(selection).items;
      expect(new Set(item.required).size).toBe(item.required.length);
      expect(item.properties.type).toMatchObject({ type: "string" });
      expect(item.properties.type.anyOf).toBeUndefined();
      expect(Object.keys(item.properties).sort()).toEqual([...item.required].sort());
    }
  });

  it("no block field is called `type`", () => {
    for (const [id, block] of Object.entries(BLOCKS) as [string, any][]) expect(Object.keys(block.aiFields), id).not.toContain("type");
  });
});
