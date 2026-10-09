// Branding lives in code, not env — one Yelema brand for every client deployment.
// `logoUrl` (the wordmark) and `markUrl` (the square mark, also src/app/icon.svg) are files in
// /public. A deployment can show its client's logo in the menu with BRAND_LOGO_URL (see
// runtime-config.ts).
export const branding = {
  appName: "Yelema",
  logoUrl: "/yelema-long.png",
  markUrl: "/yelema_y.svg",
} as const;
