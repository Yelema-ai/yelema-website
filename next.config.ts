import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile). Vercel builds its own
  // output and ignores this; it goes away with the Dockerfile once every client runs on Vercel.
  output: "standalone",
};

export default nextConfig;
