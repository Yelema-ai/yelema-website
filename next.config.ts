import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expert pictures come from the back office's public catalogue, full size. Only those addresses
  // may be resized by the image optimizer (see src/components/experts/ExpertImage.tsx); they
  // change with a catalogue release, so a resized copy is kept for a day.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.yelema.ai", pathname: "/api/public/experts/**" }],
    minimumCacheTTL: 86_400,
  },
  // Self-contained server bundle for the Docker image (see Dockerfile). Vercel builds its own
  // output and ignores this; it goes away with the Dockerfile once every client runs on Vercel.
  output: "standalone",
};

export default nextConfig;
