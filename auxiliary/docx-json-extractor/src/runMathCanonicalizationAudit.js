import { auditMathCanonicalization, readExtractedStatistics } from "./auditMathCanonicalization.js";

const documentTree = await readExtractedStatistics();
const report = auditMathCanonicalization(documentTree);

console.log(JSON.stringify({
  equationsAudited: report.equationReports.length,
  canonicalMathErrors: report.canonicalMathErrors,
  canonicalLaTeXContainsUnsupportedTokens: report.canonicalLaTeXContainsUnsupportedTokens,
  failures: report.equationReports.filter((item) => !item.passed).map((item) => ({ id: item.id, failures: item.failures }))
}, null, 2));