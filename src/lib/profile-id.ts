// Which Hermes profile a chat runs on. No imports: shared by the server guard (lib/profiles.ts)
// and the client (URL grammar, chat hooks).
//
// An expert is a profile installed on the member's instance (`client__expert`); "default" is the
// instance's own Hermes home, with no persona.
export const DEFAULT_PROFILE = "default";

// A profile name ends up in a query string and in URL paths on the instance, so it is held to a
// strict shape before it goes anywhere.
const PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isProfileId(value: string): boolean {
  return PROFILE_ID.test(value);
}

// `?profile=` for this app's own chat routes and for the instance's session routes; empty for the
// default home.
export function profileQuery(profile: string | null | undefined): string {
  return !profile || profile === DEFAULT_PROFILE ? "" : `?profile=${encodeURIComponent(profile)}`;
}
