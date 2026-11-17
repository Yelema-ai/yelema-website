import "server-only";
import { agent37, instanceFetch } from "@/lib/agent37";
import { DRIVE_ROOT } from "@/lib/drive";
import { expertDisplayName } from "@/lib/experts";
import { JOUR_ZERO_ABSENT, JOUR_ZERO_MAX_BYTES, parseJourZero, type JourZero } from "@/lib/jour-zero";

/**
 * An expert's day-zero preparation, from its journal in the drive (`profile` already checked). No file, or
 * one that is not a version-1 preparation, reads as not prepared; `refused` turns an upstream error into the throw.
 */
export async function readJourZero(agentId: string, profile: string, refused: (res: Response) => Promise<never>): Promise<JourZero> {
  const folder = `${DRIVE_ROOT}/${expertDisplayName(profile)}`;
  const res = await instanceFetch(agentId, `/v1/files/content?path=${encodeURIComponent(`${folder}/_memoire/jour-zero.json`)}`);
  if (res.status === 404) {
    await res.body?.cancel().catch(() => undefined);
    // An expert whose folder already holds work was there before the preparation: not « to prepare ».
    const working = await agent37
      .listFiles(agentId, folder)
      .then((l) => l.entries.some((e) => !e.name.startsWith(".")))
      .catch(() => false);
    return working ? { ...JOUR_ZERO_ABSENT, working: true } : JOUR_ZERO_ABSENT;
  }
  if (!res.ok) return refused(res);
  if (Number(res.headers.get("content-length") ?? 0) > JOUR_ZERO_MAX_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    console.error(`[jour-zero] oversized file on ${agentId}/${profile}`);
    return JOUR_ZERO_ABSENT;
  }
  const jz = parseJourZero(await res.text());
  if (!jz) console.error(`[jour-zero] unreadable file on ${agentId}/${profile}`);
  return jz ?? JOUR_ZERO_ABSENT;
}
