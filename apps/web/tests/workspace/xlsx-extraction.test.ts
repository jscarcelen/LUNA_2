import { describe, expect, it } from "vitest";
import JSZip from "jszip";
// @ts-ignore - plain JS module
import { cellPosition, extractXlsx, rowsToMarkdown } from "../../lib/spreadsheetExtraction.js";

async function workbook() {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", `<workbook xmlns="x" xmlns:r="r"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`);
  zip.file("xl/sharedStrings.xml", `<sst><si><t>Item</t></si><si><t>Cost | EUR</t></si><si><r><t>Pa</t></r><r><t>per</t></r></si></sst>`);
  zip.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>12.5</v></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>Total</t></is></c><c r="C4"><f>B2*2</f><v>25</v></c></row></sheetData></worksheet>`);
  zip.file("xl/worksheets/sheet2.xml", `<worksheet><sheetData/></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("Excel upload", () => {
  it("reads every sheet as a table, with shared strings, formatted text, inline strings and calculated values", async () => {
    const result = await extractXlsx(await workbook());
    expect(result.sheets.map((sheet: any) => sheet.name)).toEqual(["Budget", "Empty"]);
    expect(result.markdown).toContain("## Budget");
    expect(result.markdown).toContain("| Item | Cost \\| EUR |  |");
    expect(result.markdown).toContain("| Paper | 12.5 |  |");
    expect(result.markdown).toContain("| Total |  | 25 |");
    expect(result.markdown).toContain("_This sheet is empty._");
    expect(result.text).toContain("Paper\t12.5");
  });

  it("turns a cell reference into a column and row", () => {
    expect(cellPosition("A1")).toEqual({ column: 0, row: 0 });
    expect(cellPosition("AA10")).toEqual({ column: 26, row: 9 });
    expect(cellPosition("nonsense")).toBeNull();
  });

  it("writes nothing for an empty grid", () => {
    expect(rowsToMarkdown([[], ["", " "]])).toBe("");
  });
});
