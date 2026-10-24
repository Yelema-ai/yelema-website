import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expert pictures come from the back office, full size: the public catalogue's, and the one a
  // member chose (its address changes with the picture). Only those addresses may be resized by the
  // image optimizer (see src/components/experts/ExpertImage.tsx); a resized copy is kept for a day.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.yelema.ai", pathname: "/api/public/experts/**" },
      { protocol: "https", hostname: "**.yelema.ai", pathname: "/api/public/expert-avatars/**" },
    ],
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
  // Administration became the company part of Paramètres (Leslie, 24/10): its old addresses, and
  // those of the tabs that moved to Intégrations before, still lead somewhere.
  async redirects() {
    return [
      { source: "/administration", destination: "/parametres/membres", permanent: false },
      { source: "/administration/membres", destination: "/parametres/membres", permanent: false },
      { source: "/administration/memoire", destination: "/parametres/entreprise", permanent: false },
      { source: "/administration/:tab(instances|facturation|consommation|entreprise|organigramme)", destination: "/parametres/:tab", permanent: false },
      { source: "/administration/:tab(canaux|connecteurs|emails|modeles|mcp)", destination: "/integrations/:tab", permanent: false },
    ];
  },
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
