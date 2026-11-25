import "server-only";
import { agent37, instanceFetch } from "@/lib/agent37";
import { DRIVE_ROOT } from "@/lib/drive";
import { expertDriveFolders } from "@/lib/expert-folders";
import { expertDisplayName } from "@/lib/experts";
import { JSON_TIMEOUT_MS, withTimeout } from "@/lib/fetch-timeout";
import { JOUR_ZERO_ABSENT, JOUR_ZERO_MAX_BYTES, parseJourZero, type JourZero } from "@/lib/jour-zero";

/** The expert's folders, the accented one first (« Aïcha », where it writes), then its unaccented copy. */
async function foldersOf(profile: string): Promise<string[]> {
  return [...new Set([...(await expertDriveFolders(profile)), expertDisplayName(profile)])].map((f) => `${DRIVE_ROOT}/${f}`);
}

/**
 * An expert's day-zero preparation, from its journal in the drive (`profile` already checked): the first
 * folder holding one wins. No file, or one that is not a preparation, reads as not prepared; `refused`
 * turns an upstream error into the throw.
 */
export async function readJourZero(agentId: string, profile: string, refused: (res: Response) => Promise<never>): Promise<JourZero> {
  const folders = await foldersOf(profile);
  for (const folder of folders) {
    // The signal also keeps Next's fetch dedupe out: it tees the body, and cancelling one half then never settles.
    const res = await instanceFetch(agentId, `/v1/files/content?path=${encodeURIComponent(`${folder}/_memoire/jour-zero.json`)}`, withTimeout(undefined, JSON_TIMEOUT_MS));
    if (res.status === 404) {
      await res.body?.cancel().catch(() => undefined);
      continue;
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
  // An expert whose folder already holds work was there before the preparation: not « to prepare ».
  const working = await Promise.all(
    folders.map((f) =>
      agent37
        .listFiles(agentId, f)
        .then((l) => l.entries.some((e) => !e.name.startsWith(".")))
        .catch(() => false)
    )
  );
  return working.includes(true) ? { ...JOUR_ZERO_ABSENT, working: true } : JOUR_ZERO_ABSENT;
}
