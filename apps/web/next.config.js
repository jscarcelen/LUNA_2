/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable instrumentation.js (server-startup polyfills for pdfjs-dist etc.)
  experimental: {
    instrumentationHook: true,
  },
  // Prevent webpack from bundling pdfjs-dist and other Node-native modules
  // that must run in their original ESM/CJS form in the Node.js runtime.
  serverExternalPackages: ["pdfjs-dist", "canvas", "@napi-rs/canvas", "nodemailer"],
  // PDF pictures and figures are read by plain Node child processes (modules/document-processing/parsers/aiVisionExtractor.js)
  // that load pdfjs, sharp and @napi-rs/canvas by path. Nothing imports them statically, so the file trace would leave them
  // out of the Vercel function and every figure would fall back to its description: include them explicitly.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/pdfjs-dist/package.json",
      "./node_modules/pdfjs-dist/legacy/build/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "../../node_modules/@napi-rs/canvas/**/*",
      "../../node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "../../node_modules/sharp/**/*",
      "../../node_modules/@img/colour/**/*",
      "../../node_modules/@img/sharp-linux-x64/**/*",
      "../../node_modules/@img/sharp-libvips-linux-x64/**/*",
      "../../node_modules/detect-libc/**/*",
      "../../node_modules/semver/**/*"
    ],
  },
};

module.exports = nextConfig;
