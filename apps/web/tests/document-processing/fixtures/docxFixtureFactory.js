import JSZip from "jszip";

function baseDocumentXml(body = "") {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    ${body}
  </w:body>
</w:document>`;
}

function baseHeaderXml(body = "") {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  ${body}
</w:hdr>`;
}

function baseFooterXml(body = "") {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  ${body}
</w:ftr>`;
}

function paragraph(children = "", style = "") {
  const styleXml = style
    ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`
    : "";
  return `<w:p>${styleXml}${children}</w:p>`;
}

function run(text = "", runPr = "") {
  const pr = runPr ? `<w:rPr>${runPr}</w:rPr>` : "";
  return `<w:r>${pr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function hyperlink(text = "Link", relId = "rId1") {
  return `<w:hyperlink r:id="${relId}">${run(text)}</w:hyperlink>`;
}

function inlineMathOmmlFromBody(body = "<m:r><m:t>x</m:t></m:r>") {
  return `<m:oMath>${body}</m:oMath>`;
}

function displayMathOmmlFromBody(body = "<m:r><m:t>x</m:t></m:r>") {
  return `<m:oMathPara><m:oMath>${body}</m:oMath></m:oMathPara>`;
}

function ommlFraction() {
  return inlineMathOmmlFromBody("<m:f><m:num><m:r><m:t>a+b</m:t></m:r></m:num><m:den><m:r><m:t>c</m:t></m:r></m:den></m:f>");
}

function ommlSubSup() {
  return inlineMathOmmlFromBody("<m:sSubSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sub><m:r><m:t>i</m:t></m:r></m:sub><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSubSup>");
}

function ommlMatrix() {
  return displayMathOmmlFromBody("<m:m><m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>0</m:t></m:r></m:e></m:mr><m:mr><m:e><m:r><m:t>0</m:t></m:r></m:e><m:e><m:r><m:t>1</m:t></m:r></m:e></m:mr></m:m>");
}

function ommlIntegralWithLimits() {
  return displayMathOmmlFromBody("<m:nary><m:naryPr><m:chr m:val=\"∫\"/></m:naryPr><m:sub><m:r><m:t>0</m:t></m:r></m:sub><m:sup><m:r><m:t>1</m:t></m:r></m:sup><m:e><m:r><m:t>f(x)dx</m:t></m:r></m:e></m:nary>");
}

function ommlSummationGreek() {
  return displayMathOmmlFromBody("<m:nary><m:naryPr><m:chr m:val=\"∑\"/></m:naryPr><m:sub><m:r><m:t>i=1</m:t></m:r></m:sub><m:sup><m:r><m:t>n</m:t></m:r></m:sup><m:e><m:r><m:t>α_i+β</m:t></m:r></m:e></m:nary>");
}

function ommlNested() {
  return inlineMathOmmlFromBody("<m:f><m:num><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:num><m:den><m:rad><m:e><m:r><m:t>y+1</m:t></m:r></m:e></m:rad></m:den></m:f>");
}

function numberedListParagraph(text = "First") {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(text)}</w:p>`;
}

function bulletListParagraph(text = "Bullet") {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>${run(text)}</w:p>`;
}

function pageBreakRun() {
  return "<w:r><w:br w:type=\"page\"/></w:r>";
}

function advancedTableXml() {
  const formattedRun = "<w:b/><w:rFonts w:ascii=\"Courier New\"/><w:color w:val=\"FF0000\"/><w:highlight w:val=\"yellow\"/>";
  const nestedTable = `<w:tbl>
    <w:tr>
      <w:tc><w:p>${run("Nested cell A")}</w:p></w:tc>
      <w:tc><w:p>${run("Nested cell B")}</w:p></w:tc>
    </w:tr>
  </w:tbl>`;

  return `<w:tbl>
    <w:tr>
      <w:tc>
        <w:tcPr><w:gridSpan w:val="2"/></w:tcPr>
        <w:p>${run("Merged heading cell")}</w:p>
      </w:tc>
    </w:tr>
    <w:tr>
      <w:tc>
        <w:tcPr><w:vMerge w:val="restart"/></w:tcPr>
        <w:p>${run("Cell with equation ")}${ommlSubSup()}</w:p>
      </w:tc>
      <w:tc>
        <w:p>${run("Formatted", formattedRun)}${run(" and link ")}${hyperlink("CellLink")}</w:p>
        ${nestedTable}
      </w:tc>
    </w:tr>
    <w:tr>
      <w:tc>
        <w:tcPr><w:vMerge/></w:tcPr>
        <w:p>${run("Merged down")}</w:p>
      </w:tc>
      <w:tc>
        <w:p>${ommlFraction()}</w:p>
      </w:tc>
    </w:tr>
  </w:tbl>`;
}

function formattingEdgeParagraph() {
  const boldRun = "<w:b/>";
  const colorRun = "<w:color w:val=\"00AAFF\"/>";
  const highlightRun = "<w:highlight w:val=\"green\"/>";
  const fontRun = "<w:rFonts w:ascii=\"Cambria\"/>";
  return paragraph(
    run("Bold near math ", boldRun)
      + ommlNested()
      + run(" color ", colorRun)
      + run(" highlight ", highlightRun)
      + run(" font change ", fontRun)
      + hyperlink("MixedLink")
  );
}

function complexEquationBodyXml() {
  return [
    paragraph(run("Section Equations"), "Heading1"),
    paragraph(run("Fraction ") + ommlFraction() + run(" inside text")),
    paragraph(run("SubSup ") + ommlSubSup() + run(" inline")),
    paragraph(ommlMatrix()),
    paragraph(ommlIntegralWithLimits()),
    paragraph(ommlSummationGreek()),
    paragraph(run("Nested ") + ommlNested() + run(" inline nested"))
  ].join("\n");
}

function structureBodyXml() {
  return [
    paragraph(run("Section One"), "Heading1"),
    paragraph(run("Intro paragraph")),
    numberedListParagraph("Step one"),
    numberedListParagraph("Step two"),
    bulletListParagraph("Point A"),
    bulletListParagraph("Point B"),
    paragraph(pageBreakRun() + run("After page break")),
    "<w:sectPr/>",
    paragraph(run("Section Two"), "Heading1"),
    paragraph(run("Continuation paragraph"))
  ].join("\n");
}

function combinedAdversarialBodyXml() {
  return [
    paragraph(run("Section Alpha"), "Heading1"),
    formattingEdgeParagraph(),
    complexEquationBodyXml(),
    advancedTableXml(),
    structureBodyXml(),
    "<w:sectPr/>"
  ].join("\n");
}

function headerBodyXml() {
  return [
    paragraph(run("Header zone text")),
    paragraph(run("Header equation ") + ommlSubSup())
  ].join("\n");
}

function footerBodyXml() {
  return [
    paragraph(run("Footer zone text")),
    paragraph(run("Footer link ") + hyperlink("FooterRef"))
  ].join("\n");
}

function ommlVariance() {
  return inlineMathOmmlFromBody("<m:sSubSup><m:e><m:r><m:t>S</m:t></m:r></m:e><m:sub><m:r><m:t>x</m:t></m:r></m:sub><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSubSup>");
}

function ommlIndexedX() {
  return inlineMathOmmlFromBody("<m:sSub><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sub><m:r><m:t>i</m:t></m:r></m:sub></m:sSub>");
}

function ommlBarX() {
  return inlineMathOmmlFromBody("<m:acc><m:accPr><m:chr m:val=\"¯\"/></m:accPr><m:e><m:r><m:t>x</m:t></m:r></m:e></m:acc>");
}

function ommlSampleVarianceDisplay() {
  return displayMathOmmlFromBody(
    "<m:sSubSup><m:e><m:r><m:t>S</m:t></m:r></m:e><m:sub><m:r><m:t>x</m:t></m:r></m:sub><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSubSup>"
    + "<m:r><m:t>=</m:t></m:r>"
    + "<m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>n-1</m:t></m:r></m:den></m:f>"
    + "<m:nary><m:naryPr><m:chr m:val=\"∑\"/></m:naryPr><m:sub><m:r><m:t>i=1</m:t></m:r></m:sub><m:sup><m:r><m:t>n</m:t></m:r></m:sup><m:e><m:r><m:t>(x_(i)-bar{x})^(2)</m:t></m:r></m:e></m:nary>"
  );
}

function statisticsBodyXml() {
  return [
    paragraph(run("Statistics Report"), "Heading1"),
    paragraph(run("Sample variance ") + ommlVariance() + run(" for score ") + ommlIndexedX() + run(".")),
    paragraph(run("Mean estimate ") + ommlBarX() + run(" is stable.")),
    `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>${run("Observation ")}${ommlIndexedX()}${run(" has centered tendency ")}${displayMathOmmlFromBody("<m:r><m:t>x</m:t></m:r>")}</w:p>`,
    paragraph(ommlSampleVarianceDisplay())
  ].join("\n");
}

export async function createDocxFixtureBuffer(bodyXml = "", options = {}) {
  const zip = new JSZip();
  zip.file("word/document.xml", baseDocumentXml(bodyXml));

  if (Array.isArray(options.headers)) {
    for (let index = 0; index < options.headers.length; index += 1) {
      zip.file(`word/header${index + 1}.xml`, baseHeaderXml(String(options.headers[index] || "")));
    }
  }

  if (Array.isArray(options.footers)) {
    for (let index = 0; index < options.footers.length; index += 1) {
      zip.file(`word/footer${index + 1}.xml`, baseFooterXml(String(options.footers[index] || "")));
    }
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

function toFile(name, buffer) {
  return {
    name,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    contentBase64: buffer.toString("base64")
  };
}

export async function createComplexDocxFixtureFile() {
  const buffer = await createDocxFixtureBuffer(combinedAdversarialBodyXml(), {
    headers: [headerBodyXml()],
    footers: [footerBodyXml()]
  });
  return toFile("fidelity-complex.docx", buffer);
}

export async function createMinimalDocxFixtureFile() {
  const body = paragraph(run("A ") + inlineMathOmmlFromBody("<m:r><m:t>x</m:t></m:r>") + run(" B"));
  const buffer = await createDocxFixtureBuffer(body);
  return toFile("fidelity-minimal.docx", buffer);
}

export async function createStatisticsDocxFixtureFile() {
  const buffer = await createDocxFixtureBuffer(statisticsBodyXml(), {
    headers: [paragraph(run("Header statistics note"))],
    footers: [paragraph(run("Footer statistics note"))]
  });
  return toFile("statistics-regression.docx", buffer);
}

export async function createAdversarialFixtures() {
  const fixtures = [];

  const equationsBuffer = await createDocxFixtureBuffer(complexEquationBodyXml());
  fixtures.push({
    id: "equations-complex",
    file: toFile("adversarial-equations.docx", equationsBuffer),
    expected: {
      minEquationCount: 6,
      minHeadingCount: 1,
      minTableCount: 0,
      minFidelityScore: 0.65,
      sourceText: "Section Equations Fraction SubSup inline nested"
    }
  });

  const formattingBuffer = await createDocxFixtureBuffer(formattingEdgeParagraph());
  fixtures.push({
    id: "formatting-edge",
    file: toFile("adversarial-formatting.docx", formattingBuffer),
    expected: {
      minEquationCount: 1,
      minHeadingCount: 0,
      minTableCount: 0,
      minFidelityScore: 0.8,
      sourceText: "Bold near math color highlight font change MixedLink"
    }
  });

  const tableBuffer = await createDocxFixtureBuffer(advancedTableXml());
  fixtures.push({
    id: "table-advanced",
    file: toFile("adversarial-tables.docx", tableBuffer),
    expected: {
      minEquationCount: 2,
      minHeadingCount: 0,
      minTableCount: 1,
      minFidelityScore: 0.65,
      sourceText: "Merged heading cell Nested cell A Nested cell B"
    }
  });

  const structureBuffer = await createDocxFixtureBuffer(structureBodyXml(), {
    headers: [headerBodyXml()],
    footers: [footerBodyXml()]
  });
  fixtures.push({
    id: "document-structures",
    file: toFile("adversarial-structures.docx", structureBuffer),
    expected: {
      minEquationCount: 1,
      minHeadingCount: 2,
      minTableCount: 0,
      minFidelityScore: 0.75,
      sourceText: "Section One Section Two Header zone text Footer zone text"
    }
  });

  const combinedBuffer = await createDocxFixtureBuffer(combinedAdversarialBodyXml(), {
    headers: [headerBodyXml()],
    footers: [footerBodyXml()]
  });
  fixtures.push({
    id: "combined-adversarial",
    file: toFile("adversarial-combined.docx", combinedBuffer),
    expected: {
      minEquationCount: 10,
      minHeadingCount: 3,
      minTableCount: 1,
      minFidelityScore: 0.55,
      sourceText: "Section Alpha Section Equations Header zone text Footer zone text"
    }
  });

  return fixtures;
}
