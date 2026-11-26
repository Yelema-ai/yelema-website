// Where an authorization page really is, against the server it is for. The address comes from the instance:
// one on the server's own domain opens by itself, any other waits for the member to read its host. Pure: tested.

// Suffixes under which anyone registers a name: two hosts there share nothing but the suffix.
const SHARED_SUFFIXES = [
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.za", "co.jp", "ne.jp", "or.jp", "co.kr", "co.in", "com.br", "com.mx", "com.ar",
  "com.tr", "com.sg", "com.hk", "com.cn", "com.tw", "co.il", "co.id", "com.my", "com.ng", "co.ke", "com.gh", "co.ma", "com.eg",
  "vercel.app", "netlify.app", "herokuapp.com", "github.io", "gitlab.io", "pages.dev", "workers.dev", "web.app", "firebaseapp.com", "appspot.com", "run.app",
  "cloudfunctions.net", "azurewebsites.net", "cloudapp.net", "amazonaws.com", "cloudfront.net", "onrender.com", "fly.dev", "railway.app", "ngrok.io", "ngrok.app",
  "ngrok-free.app", "trycloudflare.com", "replit.app", "repl.co", "glitch.me", "deno.dev", "supabase.co", "agent37.app",
];

const hostOf = (url: string | null | undefined): string | null => {
  try {
    const u = new URL(String(url ?? ""));
    return u.protocol === "https:" && !u.username && !u.password ? u.hostname.toLowerCase().replace(/\.$/, "") : null;
  } catch {
    return null;
  }
};

/** The name its owner registered: the last two labels, or three under a suffix anyone registers in. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split(".");
  const shared = SHARED_SUFFIXES.find((s) => host === s || host.endsWith(`.${s}`));
  return labels.slice(-(shared ? shared.split(".").length + 1 : 2)).join(".");
}

export interface AuthorizationTarget {
  url: string;
  /** What the member reads before going on. */
  host: string;
  /** On the server's own domain (or the one our directory lists for it): opens without asking. */
  expected: boolean;
}

/** null: not an https address (or one carrying credentials), never opened. */
export function authorizationTarget(authorizationUrl: string, serverUrl: string | null | undefined, knownDomains: readonly string[] = []): AuthorizationTarget | null {
  const host = hostOf(authorizationUrl);
  if (!host) return null;
  const server = hostOf(serverUrl);
  const own = [...(server ? [registrableDomain(server)] : []), ...knownDomains.map((d) => d.toLowerCase())];
  return { url: authorizationUrl, host, expected: own.some((d) => host === d || host.endsWith(`.${d}`)) };
}
