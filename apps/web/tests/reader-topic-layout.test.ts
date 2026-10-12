import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { formatPages, pageCountOf, topicRows } from "../modules/reader/topicLayout.js";
// @ts-ignore - plain JS module
import { masterOriginals } from "../modules/reader/downloadOriginal.js";

describe("topic map layout", () => {
  const concepts = [
    { id: "1", name: "Osmosis", topic: "Cells", source_pages: [3, 4] },
    { id: "2", name: "Diffusion", topic: "Cells", source_pages: [4, 5, 9] },
    { id: "3", name: "Enzymes", topic: "Energy", source_pages: [12] },
    { id: "4", name: "Loose idea", topic: "", source_pages: [] }
  ];

  it("groups concepts under their topic and orders topics by where they first appear", () => {
    const rows = topicRows(concepts);
    expect(rows.map((row: any) => row.topic)).toEqual(["Cells", "Energy", "Other topics"]);
    expect(rows[0].pages).toEqual([3, 4, 5, 9]);
    expect(rows[0].segments).toEqual([{ from: 3, to: 5 }, { from: 9, to: 9 }]);
    expect(rows[2].firstPage).toBeNull();
  });

  it("counts pages from the page markers, else from the concepts", () => {
    expect(pageCountOf('<section data-page="1"></section><section data-page="14"></section>', concepts)).toBe(14);
    expect(pageCountOf("", concepts)).toBe(12);
  });

  it("writes page runs the way a person would", () => {
    expect(formatPages([3, 4, 5, 9])).toBe("pp. 3–5, 9");
    expect(formatPages([7])).toBe("p. 7");
    expect(formatPages([])).toBe("");
  });
});

describe("masterOriginals", () => {
  it("lists the uploaded files a master document was made from", () => {
    expect(masterOriginals({ master: { originals: [{ id: "a", name: "Notes.docx" }, { name: "no id" }] } })).toEqual([{ id: "a", name: "Notes.docx" }]);
    expect(masterOriginals({ data: { originals: [{ id: "b", name: "Book.pdf" }] } })).toEqual([{ id: "b", name: "Book.pdf" }]);
    expect(masterOriginals({})).toEqual([]);
  });
});
