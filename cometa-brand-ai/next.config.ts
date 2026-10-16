import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolated local verification must not clean private release evidence in .next.
  distDir: process.env.COMETA_BUILD_DIR === ".next-retail-check" ? ".next-retail-check" : ".next",
  // Render original images. This does not disable Vercel's image endpoint.
  images: { unoptimized: true },
};

export default nextConfig;
