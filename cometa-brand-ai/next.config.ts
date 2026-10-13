import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Render original images. This does not disable Vercel's image endpoint.
  images: { unoptimized: true },
};

export default nextConfig;
