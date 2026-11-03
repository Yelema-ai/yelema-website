import "server-only";
import { agent37, type RuntimeCapabilities } from "@/lib/agent37";
import { memo } from "@/lib/memo";
import { currentInstance, currentUserId } from "@/lib/session";

// What an instance's runtime offers changes with its image (or a runtime switch, which changes the
// image): kept per instance and image version, read again past 10 minutes.
const caps = memo<RuntimeCapabilities | null>({ ttlMs: 10 * 60_000, staleOnErrorMs: 60 * 60_000, maxEntries: 2000, maxFlightMs: 35_000 });

/** The image an instance runs, as `template:revision`, when it is the caller's own; "" otherwise. */
export async function imageKeyOf(agentId: string): Promise<string> {
  const instance = await currentInstance().catch(() => null);
  return instance?.id === agentId ? `${instance.image.template ?? ""}:${instance.image.revision ?? ""}` : "";
}

export async function runtimeCapabilities(agentId: string): Promise<RuntimeCapabilities | null> {
  // Per caller: on a team instance each member's own experts (copies) are what the gateway lists.
  const user = await currentUserId().catch(() => null);
  return caps.get(`${agentId}|${user ?? ""}|${await imageKeyOf(agentId)}`, () => agent37.capabilities(agentId));
}

/** Whether the instance serves the Hermes-only screens (messaging channels). */
export async function servesHermesTools(agentId: string): Promise<boolean> {
  const c = await runtimeCapabilities(agentId);
  return c ? c.capabilities.includes("hermesTools") : true;
}
