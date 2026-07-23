const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // Default is 1MB; the fill tool stores uploaded PDFs as base64 server
  // actions, which needs headroom above lib/limits.ts's MAX_FILL_PDF_BYTES.
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

module.exports = nextConfig;
