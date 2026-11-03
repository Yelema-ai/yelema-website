import { ApiError, readJson } from "@/lib/http";
import { parseVaultDraft, parseVaultProfiles, parseVaultRefs, vaultRefusalMessage, type VaultDraft, type VaultRef } from "@/lib/vault";
import { settingsError } from "../llm/_shared";

export { noStore, settingsToken } from "../llm/_shared";

export async function vaultDraft(request: Request): Promise<VaultDraft> {
  const draft = parseVaultDraft(await readJson(request));
  if (!draft) throw new ApiError(400, "bad_request", "Cette demande n’a pas pu être traitée.");
  return draft;
}

const refused = () => new ApiError(400, "bad_request", "Cette demande n’a pas pu être traitée.");

/** Un brouillon et les profils qui le reçoivent, lus dans le même corps. */
export async function vaultDraftFor(request: Request): Promise<{ draft: VaultDraft; profiles: string[] }> {
  const body = await readJson(request);
  const draft = parseVaultDraft(body);
  const profiles = parseVaultProfiles((body as { profiles?: unknown } | null)?.profiles);
  if (!draft || !profiles) throw refused();
  return { draft, profiles };
}

export async function vaultRefs(request: Request): Promise<VaultRef[]> {
  const refs = parseVaultRefs(((await readJson(request)) as { entries?: unknown } | null)?.entries);
  if (!refs) throw refused();
  return refs;
}

// Un refus du back-office arrive au membre en une phrase écrite dans src/lib/vault.ts.
export const vaultError = (e: unknown) => settingsError(e, vaultRefusalMessage);
