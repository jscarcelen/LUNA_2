/**
 * Next.js instrumentation — runs once at server startup before any route handlers.
 *
 * Polyfills browser APIs that Node.js lacks but are required by server-side
 * dependencies (notably pdfjs-dist, which pdf-parse pulls in and which
 * references DOMMatrix at module evaluation time).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // ── DOMMatrix polyfill ─────────────────────────────────────────────────
    // pdfjs-dist references DOMMatrix at module load time.  Without this,
    // any route that imports pdf-parse (or pdfjs-dist directly) throws:
    //   ReferenceError: DOMMatrix is not defined
    if (typeof globalThis.DOMMatrix === "undefined") {
      globalThis.DOMMatrix = class DOMMatrix {
        constructor(init) {
          // Identity matrix (4×4, column-major)
          this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
          this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
          this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
          this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
          // 2D aliases
          this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
          this.is2D = true;
          this.isIdentity = true;

          if (typeof init === "string") {
            // Parse CSS transform string — only the common cases pdfjs uses
            const parts = init.trim().match(/^matrix\(([^)]+)\)$/);
            if (parts) {
              const [a, b, c, d, e, f] = parts[1].split(",").map(Number);
              this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
              this.m11 = a; this.m12 = b; this.m21 = c; this.m22 = d;
              this.m41 = e; this.m42 = f;
              this.isIdentity = (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0);
            }
          } else if (Array.isArray(init)) {
            if (init.length === 6) {
              const [a, b, c, d, e, f] = init;
              this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
            } else if (init.length === 16) {
              [this.m11, this.m12, this.m13, this.m14,
               this.m21, this.m22, this.m23, this.m24,
               this.m31, this.m32, this.m33, this.m34,
               this.m41, this.m42, this.m43, this.m44] = init;
            }
          }
        }

        multiply(other) { return new DOMMatrix(); }
        translate(tx = 0, ty = 0, tz = 0) { const m = new DOMMatrix(); m.e = tx; m.f = ty; return m; }
        scale(sx = 1, sy = sx, sz = 1, ox = 0, oy = 0, oz = 0) { const m = new DOMMatrix(); m.a = sx; m.d = sy; return m; }
        rotate(rx = 0, ry, rz) { return new DOMMatrix(); }
        rotateAxisAngle(x = 0, y = 0, z = 0, angle = 0) { return new DOMMatrix(); }
        skewX(sx = 0) { return new DOMMatrix(); }
        skewY(sy = 0) { return new DOMMatrix(); }
        inverse() { return new DOMMatrix(); }
        flipX() { return new DOMMatrix(); }
        flipY() { return new DOMMatrix(); }
        transformPoint(p = {}) { return { x: p.x || 0, y: p.y || 0, z: 0, w: 1 }; }
        toFloat32Array() { return new Float32Array([this.m11,this.m12,this.m13,this.m14,this.m21,this.m22,this.m23,this.m24,this.m31,this.m32,this.m33,this.m34,this.m41,this.m42,this.m43,this.m44]); }
        toFloat64Array() { return new Float64Array([this.m11,this.m12,this.m13,this.m14,this.m21,this.m22,this.m23,this.m24,this.m31,this.m32,this.m33,this.m34,this.m41,this.m42,this.m43,this.m44]); }
        toString() { return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`; }
        toJSON() { return { a:this.a,b:this.b,c:this.c,d:this.d,e:this.e,f:this.f,m11:this.m11,m12:this.m12,m13:this.m13,m14:this.m14,m21:this.m21,m22:this.m22,m23:this.m23,m24:this.m24,m31:this.m31,m32:this.m32,m33:this.m33,m34:this.m34,m41:this.m41,m42:this.m42,m43:this.m43,m44:this.m44,is2D:this.is2D,isIdentity:this.isIdentity }; }

        static fromMatrix(other = {}) { return new DOMMatrix(); }
        static fromFloat32Array(arr) { return new DOMMatrix(Array.from(arr)); }
        static fromFloat64Array(arr) { return new DOMMatrix(Array.from(arr)); }
      };
    }

    // ── DOMPoint polyfill ──────────────────────────────────────────────────
    // Also referenced by pdfjs-dist
    if (typeof globalThis.DOMPoint === "undefined") {
      globalThis.DOMPoint = class DOMPoint {
        constructor(x = 0, y = 0, z = 0, w = 1) {
          this.x = x; this.y = y; this.z = z; this.w = w;
        }
        matrixTransform(m) { return new DOMPoint(this.x, this.y, this.z, this.w); }
        toJSON() { return { x: this.x, y: this.y, z: this.z, w: this.w }; }
        static fromPoint(other = {}) { return new DOMPoint(other.x, other.y, other.z, other.w); }
      };
    }

    // ── DOMRect polyfill ───────────────────────────────────────────────────
    if (typeof globalThis.DOMRect === "undefined") {
      globalThis.DOMRect = class DOMRect {
        constructor(x = 0, y = 0, width = 0, height = 0) {
          this.x = x; this.y = y; this.width = width; this.height = height;
        }
        get top() { return this.y; }
        get left() { return this.x; }
        get bottom() { return this.y + this.height; }
        get right() { return this.x + this.width; }
        toJSON() { return { x:this.x,y:this.y,width:this.width,height:this.height }; }
        static fromRect(other = {}) { return new DOMRect(other.x, other.y, other.width, other.height); }
      };
    }
  }
}
