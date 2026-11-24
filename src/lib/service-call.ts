// Calls to an instance made for no signed-in member: an instance's own token, a signed link, a signed
// webhook. Each such route names itself here; any other call without a verified account is refused.
import { AsyncLocalStorage } from "node:async_hooks";

export const SERVICE_CALLERS = ["yele-mcp", "composio-mcp", "meetstream-webhook", "shared-dashboard", "signed-file-link"] as const;
export type ServiceCaller = (typeof SERVICE_CALLERS)[number];

const scope = new AsyncLocalStorage<ServiceCaller>();

/** Runs `fn` as the named service: its instance calls may leave without an account. */
export const asService = <T>(who: ServiceCaller, fn: () => T): T => scope.run(who, fn);
export const serviceCaller = (): ServiceCaller | null => scope.getStore() ?? null;

/** GATEWAY_USER_MODE: `report` (default for the first rollout) logs an unnamed call and lets it through, `enforce` refuses it. */
export const gatewayUserMode = (raw: string | undefined): "enforce" | "report" => (raw?.trim().toLowerCase() === "enforce" ? "enforce" : "report");

export type UserDecision = { send: string | null } | { refuse: true };

/** Whom a gateway call names: the account given, else the session's, else nobody for a named service only. */
export function gatewayUser(explicit: string | null, sessionUser: string | null, service: ServiceCaller | null, mode: "enforce" | "report"): UserDecision {
  if (explicit) return { send: explicit };
  if (sessionUser) return { send: sessionUser };
  return service || mode === "report" ? { send: null } : { refuse: true };
}
