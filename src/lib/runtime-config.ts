import "server-only";

// Deployment configuration, read from the environment AT RUNTIME — never at build time.
//
// One Docker image serves every client: the back-office starts it with that client's env
// (SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL, …). Next.js inlines any literal
// `process.env.NEXT_PUBLIC_*` access into the bundle at build time, so this module only
// reads variables through a computed key, and it is the only place that reads them. The
// legacy NEXT_PUBLIC_* names are still honoured as a fallback for older .env.local files.
//
// The browser gets the public subset (`publicConfig()`) from the root layout via
// `PublicConfigProvider`; the service-role key never leaves the server.

function read(name: string, legacy?: string): string | undefined {
  const env = process.env;
  const value = env[name]?.trim() || (legacy ? env[legacy]?.trim() : undefined);
  return value || undefined;
}

export function supabaseUrl(): string | undefined {
  return read("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string | undefined {
  return read("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function supabaseServiceRoleKey(): string | undefined {
  return read("SUPABASE_SERVICE_ROLE_KEY");
}

export function siteUrl(): string | undefined {
  return read("SITE_URL", "NEXT_PUBLIC_SITE_URL");
}

export function brandLogoUrl(): string | undefined {
  return read("BRAND_LOGO_URL");
}

// Yelema's Composio project key: the Connecteurs tab and the experts' tool proxy run on it.
// Server-only. Optional: without it, an instance wired for it answers "pas encore activés".
export function composioApiKey(): string | undefined {
  return read("COMPOSIO_API_KEY");
}

// The Yelema back office's public origin: it serves the expert catalogue (names, roles, photos,
// videos). Optional: without it the app still works and shows each expert by its profile name.
export function backofficeUrl(): string | undefined {
  return read("BACKOFFICE_URL")?.replace(/\/+$/, "");
}

// The client workspace this deployment serves. Every client shares ONE Supabase project (see
// docs/decisions/supabase-projet-partage.md), so the deployment is pinned to its workspace: any
// other workspace — even one the signed-in user belongs to — is invisible here. Unset means the
// legacy dedicated-project mode, where the database holds a single workspace anyway.
export function deploymentWorkspaceId(): string | undefined {
  return read("WORKSPACE_ID");
}

// The version this deployment runs: the git tag the back office deployed (APP_VERSION), else the
// ref Vercel built, else "dev" locally.
export function appVersion(): string {
  return read("APP_VERSION") ?? read("VERCEL_GIT_COMMIT_REF") ?? "dev";
}

// Names of the required variables that are unset. Used by /api/health, which reports only
// whether the deployment is complete — never which values it holds.
export function missingRequired(): string[] {
  const required: [string, string | undefined][] = [
    ["AGENT37_API_KEY", read("AGENT37_API_KEY")],
    ["SUPABASE_URL", supabaseUrl()],
    ["SUPABASE_ANON_KEY", supabaseAnonKey()],
    ["SUPABASE_SERVICE_ROLE_KEY", supabaseServiceRoleKey()],
    ["SITE_URL", siteUrl()],
  ];
  return required.filter(([, value]) => !value).map(([name]) => name);
}

// What the browser needs: Supabase Auth runs client-side with the anon key, which is public
// by design (the tables are granted to the service role only).
export type PublicConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteUrl: string | null;
  logoUrl: string | null;
};

export function publicConfig(): PublicConfig {
  return {
    supabaseUrl: supabaseUrl() ?? "",
    supabaseAnonKey: supabaseAnonKey() ?? "",
    siteUrl: siteUrl() ?? null,
    logoUrl: brandLogoUrl() ?? null,
  };
}
