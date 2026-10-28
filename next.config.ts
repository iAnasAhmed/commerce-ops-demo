import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keeps the dev badge out of the tour screenshots.
  devIndicators: false,
  // Cloudflare Workers has no image optimiser; the tour images are already sized.
  images: { unoptimized: true },
  // Pin the workspace root. Without this, Turbopack walks up and finds the
  // stray package-lock.json in the home directory, then warns on every build.
  turbopack: {
    root: path.resolve("."),
  },
};

export default nextConfig;

// Gives `next dev` a Miniflare-backed `env.DB` (the D1 binding), so the
// Action Needed tab's read/write route works locally too, not just under
// `npm run preview`/the deployed Worker. Dev-only — no-op in production.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
