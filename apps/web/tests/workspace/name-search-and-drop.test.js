import { describe, expect, it } from "vitest";
import { nameMatchScore, normaliseName, searchByName } from "../../modules/workspace/nameSearch.js";
import { filesFromDrop, isFileDrag } from "../../modules/workspace/fileDrop.js";

describe("searchByName", () => {
  const names = ["Investments_LectureWeek3.pdf", "Biology", "Photosynthesis notes.docx", "Fotos de clase", "Álgebra básica", "History essay"];
  const find = (query) => searchByName(query, names, (name) => name);

  it("normalises accents, extensions and underscores", () => {
    expect(normaliseName("Álgebra_Básica.PDF")).toBe("algebra basica");
  });
  it("finds exact words, prefixes and parts of words", () => {
    expect(find("biology")).toEqual(["Biology"]);
    expect(find("photo")).toEqual(["Photosynthesis notes.docx", "Fotos de clase"]); // the same sound comes second
    expect(find("lecture")).toEqual(["Investments_LectureWeek3.pdf"]);
  });
  it("forgives typos and missing accents", () => {
    expect(find("biolgy")).toEqual(["Biology"]);
    expect(find("photosintesis")).toEqual(["Photosynthesis notes.docx"]);
    expect(find("fotosintesis")).toEqual(["Photosynthesis notes.docx"]);
    expect(find("algebra")).toEqual(["Álgebra básica"]);
    expect(find("histroy")).toEqual(["History essay"]);
  });
  it("needs every typed word to match", () => {
    expect(find("inv lect")).toEqual(["Investments_LectureWeek3.pdf"]);
    expect(find("biology essay")).toEqual([]);
  });
  it("does not match unrelated short words", () => {
    expect(find("xyz")).toEqual([]);
    expect(nameMatchScore("cat", "Chemistry")).toBe(0);
  });
  it("ranks a closer match first", () => {
    expect(searchByName("foto", ["Photosynthesis", "Fotos de clase"], (name) => name)[0]).toBe("Fotos de clase");
  });
});

describe("filesFromDrop", () => {
  const file = (name) => ({ name, size: 1 });
  const fileEntry = (name) => ({ name, isFile: true, isDirectory: false, file: (resolve) => resolve(file(name)) });
  const dirEntry = (name, children) => ({
    name, isFile: false, isDirectory: true,
    createReader: () => { let given = false; return { readEntries: (resolve) => { resolve(given ? [] : children); given = true; } }; }
  });
  const transfer = (entries) => ({ types: ["Files"], items: entries.map((entry) => ({ kind: "file", webkitGetAsEntry: () => entry })), files: [] });

  it("tells a drag from Finder from a drag inside the page", () => {
    expect(isFileDrag({ dataTransfer: { types: ["Files"] } })).toBe(true);
    expect(isFileDrag({ dataTransfer: { types: ["text/plain"] } })).toBe(false);
  });
  it("opens dropped folders, keeps their paths and skips hidden files", async () => {
    const files = await filesFromDrop(transfer([
      fileEntry("loose.pdf"),
      dirEntry("Biology", [fileEntry("cells.pdf"), fileEntry(".DS_Store"), dirEntry("Unit 2", [fileEntry("dna.docx")])])
    ]));
    expect(files.map((entry) => [entry.name, entry.webkitRelativePath || ""])).toEqual([
      ["loose.pdf", ""],
      ["cells.pdf", "Biology/cells.pdf"],
      ["dna.docx", "Biology/Unit 2/dna.docx"]
    ]);
  });
  it("falls back to the plain file list when entries are not available", async () => {
    const files = await filesFromDrop({ items: [{ kind: "file" }], files: [file("a.pdf"), file("._a.pdf")] });
    expect(files.map((entry) => entry.name)).toEqual(["a.pdf"]);
  });
});
