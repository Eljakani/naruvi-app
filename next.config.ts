import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["playwright", "playwright-core", "pdfjs-dist", "imapflow", "mailparser", "nodemailer", "read-excel-file"],
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
