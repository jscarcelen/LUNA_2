import { describe, expect, it } from "vitest";
import { prepareUploadedDocumentsForPersistence } from "../../lib/workspacesRepository.js";
import { createStatisticsDocxFixtureFile } from "./fixtures/docxFixtureFactory.js";

function countOccurrences(source = "", needle = "") {
  if (!needle) return 0;
  return String(source || "").split(needle).length - 1;
}

describe("statistics real pipeline", () => {
  it("uses the real upload preparation path and produces clean persisted markdown", async () => {
    const file = await createStatisticsDocxFixtureFile();
    const { parsedFiles, extractionReport } = await prepareUploadedDocumentsForPersistence([file], { minConfidence: 0.72 });

    expect(parsedFiles).toHaveLength(1);
    expect(extractionReport).toHaveLength(1);

    const persisted = parsedFiles[0];
    const report = extractionReport[0];
    const markdown = String(persisted?.content || "");

    expect(report.processingRunId).toBeTruthy();
    expect(report.processingPipelineVersion).toBeTruthy();
    // The upload path uses the vendored auxiliary DOCX parser (commit 3513582), not the CDM v2 extractor.
    expect(report.method).toBe("docx-auxiliary-json-extractor");
    expect(report.processingSummary?.schemaVersion).toBe("1.0");
    expect(report.processingSummary?.cdmVersion).toBe("auxiliary-docx-tree");
    expect(report.processingSummary?.equationCount).toBeGreaterThan(0);

    expect(countOccurrences(markdown, "# Statistics Report")).toBe(1);
    expect(countOccurrences(markdown, "## Statistics Report")).toBe(0);

    expect(markdown).not.toContain("S_(x)^(2)");
    expect(markdown).not.toContain("S x 2");
    expect(markdown).not.toContain("(1)/(n-1)");
    expect(markdown).not.toContain("i=1 n");
    expect(markdown).not.toContain("cdm-document");
    expect(markdown).not.toContain("class=");
    expect(markdown).not.toContain("cursor:");
    expect(markdown).not.toContain("&amp;");
    expect(markdown).not.toContain("&lt;");

    expect(markdown).toContain("S_x^2");
    expect(markdown).toContain("\\frac{1}{n-1}");
    expect(markdown).toContain("\\sum_{i=1}^{n}");
    expect(markdown).toContain("Sample variance $S_x^2$ for score $x_i$.");
  });
});
