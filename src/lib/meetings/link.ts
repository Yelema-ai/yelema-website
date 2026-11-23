export type MeetingPlatform = "meet" | "teams";

export interface MeetingLink {
  url: string;
  platform: MeetingPlatform;
}

export const MEETING_PLATFORMS: readonly MeetingPlatform[] = ["meet", "teams"];

const MAX_LINK_LENGTH = 2048;
const MEET_PATH = /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/;
const TEAMS_HOSTS = new Set(["teams.microsoft.com", "teams.live.com"]);
const TEAMS_PATH = /^\/(l\/meetup-join\/|meet\/)\S+/;

export function parseMeetingLink(raw: unknown): MeetingLink | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > MAX_LINK_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (host === "meet.google.com") {
    const code = MEET_PATH.exec(url.pathname.toLowerCase())?.[1];
    return code ? { url: `https://meet.google.com/${code}`, platform: "meet" } : null;
  }
  if (TEAMS_HOSTS.has(host) && TEAMS_PATH.test(url.pathname)) {
    if (host === "teams.live.com" && !url.pathname.startsWith("/meet/")) return null;
    url.hash = "";
    url.hostname = host;
    return { url: url.toString(), platform: "teams" };
  }
  return null;
}
