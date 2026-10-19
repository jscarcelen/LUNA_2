/**
 * Removes everything from stored HTML that can run script in a reader's browser, keeping the markup that documents,
 * KaTeX and MathML need. Document HTML is stored by one account and rendered (dangerouslySetInnerHTML) for others
 * through live shares and copies, so a script that survived here would run in the reader's session.
 *
 * Parsed with linkedom (a real HTML parser), so attribute tricks a regular expression misses (unquoted `onerror=`,
 * `<svg/onload=…>`, entity-encoded `javascript:` links) are handled the way a browser would read them.
 */
import { parseHTML } from "linkedom";

/** Elements that run script, load another document or change how the page resolves links: dropped with their content. */
const DROPPED_ELEMENTS = ["script", "iframe", "frame", "frameset", "object", "embed", "applet", "base", "meta", "link", "noscript", "template", "portal", "form"];
/** SVG elements that can set an attribute (such as href) to a script URL after parsing. */
const DROPPED_SVG_ELEMENTS = ["animate", "set", "animatemotion", "animatetransform", "handler", "listener"];
const URL_ATTRIBUTES = new Set(["href", "src", "xlink:href", "action", "formaction", "background", "poster", "cite", "data", "lowsrc", "dynsrc", "ping"]);

/** The scheme a browser would see: entities are already decoded by the parser; control characters and spaces are ignored by browsers. */
const schemeOf = (value) => {
  // eslint-disable-next-line no-control-regex -- browsers ignore these characters inside a URL scheme, so this check must too
  const compact = String(value || "").replace(/[\u0000-\u0020\u007f-\u009f]/g, "").toLowerCase();
  const match = compact.match(/^([a-z][a-z0-9+.-]*):/);
  return match ? match[1] : "";
};

function safeUrl(name, value, tagName) {
  const scheme = schemeOf(value);
  if (!scheme) return true; // relative link or anchor
  if (scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel") return true;
  // Pictures pasted into documents are stored inline.
  if (scheme === "data") return name === "src" && tagName === "img" && /^data:image\/(png|jpe?g|gif|webp|bmp)[;,]/i.test(String(value).trim());
  return false;
}

export function sanitizeHtml(html = "") {
  const source = String(html || "");
  if (!source.trim()) return "";
  const { document } = parseHTML(`<!doctype html><html><head></head><body><div id="luna-sanitize-root">${source}</div></body></html>`);
  const root = document.getElementById("luna-sanitize-root");
  if (!root) return "";
  for (const element of root.querySelectorAll([...DROPPED_ELEMENTS, ...DROPPED_SVG_ELEMENTS].join(","))) element.remove();
  for (const element of root.querySelectorAll("*")) {
    const tagName = String(element.tagName || "").toLowerCase();
    for (const { name, value } of [...element.attributes]) {
      const key = String(name).toLowerCase();
      const scriptable = key.startsWith("on") || key === "srcdoc" || key === "formaction";
      const badUrl = URL_ATTRIBUTES.has(key) && !safeUrl(key, value, tagName);
      // CSS cannot run script in current browsers, but an old engine or a url() to a script scheme still can.
      const badStyle = key === "style" && /expression\s*\(|javascript:|vbscript:|-moz-binding|behavior\s*:/i.test(String(value));
      if (scriptable || badUrl || badStyle) element.removeAttribute(name);
    }
  }
  return root.innerHTML;
}
