// The bearer an instance calls with: its apps token (`yapps_…`, known here by its SHA-256), or a token bound to
// one profile, `yprof1.<h>.<profil>.<sceau>` (yelema-platform docs/specs/jeton-de-profil.md). `h` is that same
// SHA-256: it finds the instance and proves nothing, only the back office can check the seal. Pure: tested.
import { createHash } from "node:crypto";

const PROFILE_TOKEN = /^yprof1\.([0-9a-f]{64})\.([a-z0-9][a-z0-9_-]{0,63})\.([0-9a-f]{64})$/;

export interface InstanceBearer {
  /** `agents.apps_token_hash` of the instance the bearer is for. */
  hash: string;
  /** Set for a profile token: the profile it is bound to, to believe only once the back office has accepted the token. */
  profile: string | null;
}

/** null: shaped like a profile token but malformed, refused before any lookup. */
export function instanceBearer(bearer: string): InstanceBearer | null {
  if (!bearer.startsWith("yprof1.")) return { hash: createHash("sha256").update(bearer, "utf8").digest("hex"), profile: null };
  const m = PROFILE_TOKEN.exec(bearer);
  return m ? { hash: m[1], profile: m[2] } : null;
}

/** The profile a call is made for: the token's own when it carries one, else the one the instance announces. */
export const callerProfile = (bearer: InstanceBearer, announced: string | null | undefined): string | null => bearer.profile ?? (announced?.trim() || null);
