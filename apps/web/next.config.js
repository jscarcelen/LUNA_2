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
};

module.exports = nextConfig;
