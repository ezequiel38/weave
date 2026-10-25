import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js dev-tools badge (bottom-left); it only exists in `next dev` anyway.
  devIndicators: false,
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
