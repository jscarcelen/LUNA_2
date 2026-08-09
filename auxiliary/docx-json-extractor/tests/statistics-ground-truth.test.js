import test from "node:test";
import assert from "node:assert/strict";
import { auditGroundTruth } from "../src/auditGroundTruth.js";

test("statistics OOXML ground truth audit passes without fidelity gaps", async () => {
  const { fidelityReport, mathAudit, headingAudit } = await auditGroundTruth();

  assert.ok(fidelityReport.math.sourceCount > 0);
  assert.equal(fidelityReport.math.sourceCount, fidelityReport.math.jsonCount);
  assert.equal(headingAudit.sourceHeadings.length, headingAudit.jsonHeadings.length);
  assert.ok(Array.isArray(mathAudit));
  assert.ok(mathAudit.length > 0);
  assert.equal(fidelityReport.document.headings.duplicates.length, 0);
  assert.equal(fidelityReport.math.duplicates.length, 0);
  assert.equal(fidelityReport.math.missing.length, 0);
  assert.equal(fidelityReport.provenance.missing.length, 0);
  assert.equal(fidelityReport.ordering.orderingFailures.length, 0);
  assert.equal(fidelityReport.overall.passed, true);
  assert.deepEqual(fidelityReport.overall.criticalFailures, []);
});