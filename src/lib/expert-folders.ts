import "server-only";
import { catalogueKeyOf, loadCatalogue, matchCatalogue } from "@/lib/catalogue";

/**
 * The folders of the drive (`Livrables/<folder>`) an expert writes in, most likely first: the
 * catalogue's drive folder (« Djénéba »), its first name, then the profile's key capitalised, as
 * older packs did. Never the whole profile id (« unifood__djeneba »): no expert writes there.
 */
export async function expertDriveFolders(profile: string): Promise<string[]> {
  const key = catalogueKeyOf(profile);
  const entry = matchCatalogue((await loadCatalogue()).experts, profile);
  const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const names = [entry?.driveFolder, entry?.name, key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()];
  const out: string[] = [];
  for (const n of names) {
    const v = n?.trim();
    if (!v || v.includes("/") || v.includes("..")) continue;
    for (const f of [v, plain(v)]) if (!out.includes(f)) out.push(f);
  }
  return out;
}
