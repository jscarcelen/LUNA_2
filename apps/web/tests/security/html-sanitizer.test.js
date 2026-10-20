import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../../lib/htmlSanitizer.js";

describe("stored document HTML cannot run script for the people it is shared with", () => {
  it("drops event handlers however they are written", () => {
    expect(sanitizeHtml("<img src=x onerror=alert(1)>")).not.toMatch(/onerror/i);
    expect(sanitizeHtml("<svg/onload=alert(1)></svg>")).not.toMatch(/onload/i);
    expect(sanitizeHtml(`<p onclick='x()'>a</p>`)).toBe("<p>a</p>");
  });
  it("drops script elements, frames and script links", () => {
    expect(sanitizeHtml("<script>alert(1)</script><p>ok</p>")).toBe("<p>ok</p>");
    expect(sanitizeHtml(`<iframe src="https://example.com"></iframe>`)).toBe("");
    expect(sanitizeHtml(`<a href="jav&#x09;ascript:alert(1)">x</a>`)).toBe("<a>x</a>");
    expect(sanitizeHtml(`<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>`)).not.toMatch(/animate|javascript/i);
    expect(sanitizeHtml(`<img src="data:text/html,hi">`)).toBe("<img>");
  });
  it("keeps the markup documents need", () => {
    const html = `<h2>Cells</h2><p style="color:red">Text <a href="https://example.com">link</a></p><table><tr><td>1</td></tr></table><span class="katex"><math><mi>x</mi></math></span><img src="data:image/png;base64,AAAA" alt="figure">`;
    expect(sanitizeHtml(html)).toBe(html);
  });
});
