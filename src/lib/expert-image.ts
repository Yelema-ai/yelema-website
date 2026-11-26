// Which expert pictures go through Next's image optimizer. Keep in sync with `images.remotePatterns` in next.config.ts.
// A sensitive client's back office (`*.sensible-staging.yelema.ai`, `*.sensible.yelema.ai`) resolves to a Tailscale
// address, which the optimizer refuses: the member's browser, on the tailnet, loads it as it is.
export function optimizable(src: string): boolean {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".yelema.ai")) return false;
    if (url.hostname.split(".").some((label) => label === "sensible" || label.startsWith("sensible-"))) return false;
    return url.pathname.startsWith("/api/public/experts/") || url.pathname.startsWith("/api/public/expert-avatars/");
  } catch {
    return false;
  }
}
