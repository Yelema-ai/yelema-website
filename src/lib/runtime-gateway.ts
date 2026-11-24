// The runtime gateway (yelema-platform `apps/runtime-gateway`, docs/plans/passerelle-execution.md):
// when RUNTIME_GATEWAY_URL and RUNTIME_GATEWAY_TOKEN are set, lib/agent37 sends every instance and
// control call through it, whatever runtime the instance runs, and no longer needs the Agent37 key.
// Unset: direct calls to Agent37, as before. Pure: no server-only import, so the mapping is tested.

export type RuntimeGateway = { url: string; token: string };

export function runtimeGateway(env: Record<string, string | undefined> = process.env): RuntimeGateway | null {
  const url = env.RUNTIME_GATEWAY_URL?.trim().replace(/\/+$/, "");
  const token = env.RUNTIME_GATEWAY_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

/** The gateway mirrors the instance's `/v1/…` paths under `/v1/instances/{id}/` (same verbs, same bodies). */
export function gatewayInstancePath(id: string, instancePath: string): string {
  if (!instancePath.startsWith("/v1/")) throw new Error("Invalid instance path");
  return `/v1/instances/${id}/${instancePath.slice("/v1/".length)}`;
}

/** A port's own key moves to X-Instance-Authorization: `Authorization` carries the gateway's token. */
export function gatewayPortHeaders(init: HeadersInit | undefined): Record<string, string> {
  const headers = new Headers(init);
  const own = headers.get("authorization");
  headers.delete("authorization");
  if (own) headers.set("X-Instance-Authorization", own);
  return Object.fromEntries(headers);
}

/** The member's Supabase access token, checked by the gateway, which then trusts it over `X-Yelema-User`. */
export function withMemberSession(init: RequestInit, token: string | null): RequestInit {
  if (!token) return init;
  const headers = new Headers(init.headers);
  headers.set("X-Yelema-Session", token);
  return { ...init, headers };
}

export function gatewayFetch(gw: RuntimeGateway, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${gw.token}`);
  return fetch(`${gw.url}${path}`, { ...init, headers, cache: "no-store" });
}
