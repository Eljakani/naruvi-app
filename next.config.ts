import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "playwright-core", "pdfjs-dist", "imapflow", "mailparser", "nodemailer"],
  // Logo uploads go through server actions (2 MB images + form overhead).
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
