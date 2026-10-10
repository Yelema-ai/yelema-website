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
  // On every answer. The app is never shown inside another site's page (its own file previews
  // frame its own routes, hence SAMEORIGIN and not DENY); a browser keeps to HTTPS once it has
  // seen it; a type is never guessed; another site learns only that a visitor came from here.
  // No Content-Security-Policy yet: one that fits the chat, the screen and the previews needs
  // trying in a browser first.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
