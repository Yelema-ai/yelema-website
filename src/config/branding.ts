// Branding lives in code, not env — one Yelema brand for every client deployment.
// `logoUrl` can be a path to a file in /public (e.g. "/logo.svg") or an absolute URL; "" hides
// it. A deployment can override the logo at runtime with BRAND_LOGO_URL (see runtime-config.ts).
//
// PROVISOIRE : logo, favicon (src/app/icon.svg) et couleurs (globals.css) sont des valeurs
// d'attente en attendant la charte Yelema définitive.
export const branding = {
  appName: "Yelema",
  logoUrl: "/logo.svg",
} as const;
