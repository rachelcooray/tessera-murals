import type { NextConfig } from "next";

// GitHub Pages serves the site from /<repo>, so the build sets PAGES_BASE_PATH.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  turbopack: { root: __dirname },
};

export default nextConfig;
