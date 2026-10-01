/**
 * pdfTextWorker.mjs
 *
 * Standalone Node.js script that reads a PDF from stdin (as base64) and
 * writes extracted text to stdout as JSON: { text, pageCount }
 *
 * Run via child_process.execFile so it bypasses Next.js/webpack entirely.
 * pdfjs-dist works fine in a plain Node.js process.
 */

import { fileURLToPath } from "url";
import { createRequire } from "module";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Polyfill browser APIs that pdfjs references (warnings only, not errors)
if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() { this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0;this.m11=1;this.m22=1;this.m33=1;this.m44=1;this.is2D=true;this.isIdentity=true; }
    multiply(){return new DOMMatrix();}
    translate(tx=0,ty=0){const m=new DOMMatrix();m.e=tx;m.f=ty;return m;}
    scale(sx=1,sy=sx){const m=new DOMMatrix();m.a=sx;m.d=sy;return m;}
    inverse(){return new DOMMatrix();}
    rotateAxisAngle(){return new DOMMatrix();}
    static fromMatrix(){return new DOMMatrix();}
    transformPoint(p={x:0,y:0}){return {x:p.x*this.a+p.y*this.c+this.e,y:p.x*this.b+p.y*this.d+this.f};}
  };
}
if (typeof globalThis.DOMPoint === "undefined") {
  globalThis.DOMPoint = class DOMPoint {
    constructor(x=0,y=0,z=0,w=1){this.x=x;this.y=y;this.z=z;this.w=w;}
    static fromPoint(p={}){return new DOMPoint(p.x,p.y,p.z,p.w);}
  };
}
if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class ImageData {
    constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);}
  };
}
if (typeof globalThis.Path2D === "undefined") {
  globalThis.Path2D = class Path2D {
    rect(){}moveTo(){}lineTo(){}arc(){}closePath(){}addPath(){}
  };
}

async function main() {
  // Read base64-encoded PDF bytes from stdin
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const b64 = Buffer.concat(chunks).toString("utf8").trim();

  if (!b64) {
    process.stdout.write(JSON.stringify({ error: "No input received" }));
    process.exit(1);
  }

  const buf = Buffer.from(b64, "base64");

  // Resolve pdfjs-dist relative to this file's node_modules
  const pdfjsPath = path.resolve(__dirname, "../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  const { getDocument } = await import(pdfjsPath);

  const pdf = await getDocument({
    data: new Uint8Array(buf),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableRange: true,
    disableStream: true,
    stopAtErrors: false,
  }).promise;

  const pageCount = pdf.numPages;
  let text = "";

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const tc = await page.getTextContent();
    const pageText = tc.items
      .map((item) => item.str + (item.hasEOL ? "\n" : ""))
      .join("");
    text += pageText + "\n\n";
  }

  process.stdout.write(JSON.stringify({ text: text.trim(), pageCount }));
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(String(err.message || err));
  process.stdout.write(JSON.stringify({ error: String(err.message || err) }));
  process.exit(1);
});
