import { EXPERT_KEYS } from "@/config/experts";
import { ApiError } from "@/lib/http";

// Which Hermes profile a chat runs on: an expert's key, or "default" for the business chat (the
// instance's own Hermes home, no persona).
export const DEFAULT_PROFILE = "default";

export function profileParam(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_PROFILE;
  if (raw === DEFAULT_PROFILE || (typeof raw === "string" && (EXPERT_KEYS as string[]).includes(raw))) {
    return raw as string;
  }
  throw new ApiError(400, "invalid_request", "Unknown profile");
}

// `?profile=` for the instance's session routes; omitted for the default home.
export function profileQuery(profile: string): string {
  return profile === DEFAULT_PROFILE ? "" : `?profile=${encodeURIComponent(profile)}`;
}
