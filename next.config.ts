import type { NextConfig } from "next";

// Set NEXT_PUBLIC_BASE_PATH (e.g. "/melbourne-liveability") for sub-path hosting
// such as a GitHub Pages project site. Leave unset for root hosting (Vercel/local).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
