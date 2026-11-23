import "server-only";
import { instanceFetch } from "@/lib/agent37";
import { expertPresentation } from "@/lib/installed-experts";
import type { AgendaHost } from "./agenda";
import type { MeetingScope } from "./drive";
import { logFailure } from "./log";
import { expertRole } from "./minutes-parts";
import type { Byline, Pronoun } from "./record";

export type MeetingRequester = AgendaHost;

export interface ExpertIdentity {
  name: string;
  imageUrl: string | null;
  title: string | null;
  pronoun: Pronoun | null;
}

const TURN_TIMEOUT_MS = 750_000;

export async function identityOf(profile: string): Promise<ExpertIdentity> {
  const expert = await expertPresentation(profile);
  const image = expert.photoUrl ?? expert.portraitUrl;
  return { name: expert.name, imageUrl: image && /^https:\/\//i.test(image) ? image : null, title: expert.title, pronoun: expert.pronoun };
}

export function consentMessage(identity: ExpertIdentity, requester: MeetingRequester | null): string {
  const owner = [requester?.name, requester?.company].filter(Boolean).map((part) => ` de ${part}`).join("");
  return `Bonjour, je suis ${identity.name}, l’${expertRole(identity)}${owner}. Je prends les notes et j’enverrai le compte rendu aux participants. Si vous préférez sans moi, retirez-moi de la réunion.`;
}

export const bylineOf = (identity: ExpertIdentity, requester: MeetingRequester | null): Byline => ({
  expert: identity.name,
  pronoun: identity.pronoun,
  owner: requester?.name ?? null,
  company: requester?.company ?? null,
  logo: requester?.logo ?? null,
  color: requester?.color ?? null,
  photo: identity.imageUrl,
  title: identity.title,
});

export async function runTurn(scope: MeetingScope, sessionId: string, input: string): Promise<boolean> {
  try {
    const res = await instanceFetch(scope.agentId, "/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(scope.userId ? { "X-Yelema-User": scope.userId } : {}) },
      body: JSON.stringify({ input, session_id: sessionId, stream: false, profile: scope.profile }),
      signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
    });
    await res.body?.cancel().catch(() => undefined);
    if (res.ok) return true;
    console.error(`[meetings] turn refused on ${scope.agentId}/${scope.profile}: ${res.status}`);
    return false;
  } catch (e) {
    logFailure(`turn on ${scope.agentId}/${scope.profile}`, e);
    return false;
  }
}
