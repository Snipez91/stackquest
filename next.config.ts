import type { NextConfig } from "next";

// Learner code runs only inside /sandbox.html, which is served with a CSP
// `sandbox` directive (opaque origin) so it can never read the app's cookies,
// call authenticated APIs, or touch application storage.
const PYODIDE_CDN = "https://cdn.jsdelivr.net";

const appCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const sandboxCsp = [
  "sandbox allow-scripts",
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: ${PYODIDE_CDN}`,
  "worker-src blob:",
  `connect-src ${PYODIDE_CDN}`,
  "style-src 'unsafe-inline'",
  // No frame-ancestors here: with `sandbox` the document's own origin is opaque,
  // so 'self' would never match and the frame would be blocked.
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/((?!sandbox\\.html).*)",
        headers: [
          { key: "Content-Security-Policy", value: appCsp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/sandbox.html",
        headers: [
          { key: "Content-Security-Policy", value: sandboxCsp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
