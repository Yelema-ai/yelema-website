import "server-only";
import { backofficeUrl } from "@/lib/runtime-config";
import type { CatalogueExpert, CatalogueExpertDetail } from "@/lib/types";

// The expert catalogue, served by the Yelema back office (GET /api/v1/public/experts and
// /experts/{key}): who each expert is, in words and media. Nothing about experts is written in
// this repo. The back office answers the same thing for every client, so one in-memory copy per
// server instance is kept for a few minutes.
//
// The catalogue is content, not authorization: which experts a member HAS is what is installed on
// their instance. Without BACKOFFICE_URL, or when the back office is down, every function here
// answers "nothing" and the app shows experts by their profile name.

const TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 8_000;

export interface Catalogue {
  available: boolean;
  defaultExpertKey: string | null;
  categories: { key: string; label: string }[];
  experts: CatalogueExpert[];
}

const EMPTY: Catalogue = { available: false, defaultExpertKey: null, categories: [], experts: [] };

let listCache: { at: number; value: Catalogue } | null = null;
const detailCache = new Map<string, { at: number; value: CatalogueExpertDetail | null }>();

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : []);

function category(v: unknown): { key: string; label: string } | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Raw;
  const key = str(c.key) ?? str(c.id);
  return key ? { key, label: str(c.label) ?? key } : null;
}

// One catalogue row in this app's words. Fields the back office does not send yet (pronoun, short
// title, suggestions, drive folder) come back empty rather than guessed.
function toExpert(raw: Raw): CatalogueExpert | null {
  const key = str(raw.key);
  if (!key) return null;
  const pronoun = str(raw.pronoun);
  return {
    key,
    name: str(raw.personaName) ?? str(raw.name) ?? str(raw.label) ?? key,
    role: str(raw.role),
    title: str(raw.shortTitle) ?? str(raw.title),
    tagline: str(raw.tagline),
    description: str(raw.description),
    pronoun: pronoun === "elle" || pronoun === "il" ? pronoun : null,
    category: category(raw.category),
    avatarUrl: str(raw.avatarUrl) ?? str(raw.thumbnailUrl),
    portraitUrl: str(raw.profileUrl),
    driveFolder: str(raw.driveFolder),
    suggestions: strings(raw.suggestions),
  };
}

function toDetail(raw: Raw): CatalogueExpertDetail | null {
  const base = toExpert(raw);
  if (!base) return null;
  const showcase = (raw.showcase && typeof raw.showcase === "object" ? raw.showcase : {}) as Raw;
  const video = (raw.video && typeof raw.video === "object" ? raw.video : {}) as Raw;
  const rows = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((r): r is Raw => !!r && typeof r === "object") : []);
  return {
    ...base,
    tagline: base.tagline ?? str(showcase.tagline),
    useCase: str(showcase.useCase),
    valueAdd: str(showcase.valueAdd),
    whyRelevant: str(showcase.whyRelevant),
    salesDescription: str(raw.salesDescription),
    skills: rows(raw.skills)
      .map((s) => ({ name: str(s.name) ?? "", summary: str(s.summary) }))
      .filter((s) => s.name),
    competencies: strings(raw.competencies),
    deliverables: rows(raw.deliverableExamples)
      .map((d) => ({ label: str(d.label) ?? "", thumbnailUrl: str(d.thumbnailUrl) }))
      .filter((d) => d.label),
    video: { url: str(video.url), posterUrl: str(video.posterUrl) },
  };
}

async function getJson(path: string): Promise<unknown | null> {
  const base = backofficeUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      if (res.status !== 404) console.error(`[catalogue] ${path}: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`[catalogue] ${path} unreachable:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function loadCatalogue(): Promise<Catalogue> {
  if (listCache && Date.now() - listCache.at < TTL_MS) return listCache.value;
  const body = await getJson("/api/v1/public/experts");
  // A bare array today; an envelope ({ experts, categories, defaultExpertKey }) once the back
  // office adds the ordered categories and the default expert.
  const envelope = (body && !Array.isArray(body) && typeof body === "object" ? body : {}) as Raw;
  const rows = Array.isArray(body) ? body : Array.isArray(envelope.experts) ? envelope.experts : null;
  if (!rows) {
    // Keep a stale copy over an empty screen when the back office blips.
    return listCache?.value ?? EMPTY;
  }

  const experts = rows.map((r) => toExpert((r ?? {}) as Raw)).filter((e): e is CatalogueExpert => e !== null);
  const listed = Array.isArray(envelope.categories)
    ? envelope.categories.map(category).filter((c): c is { key: string; label: string } => c !== null)
    : [];
  // Without an ordered list, categories come in the order the experts introduce them.
  const seen = new Map<string, { key: string; label: string }>();
  for (const c of listed) seen.set(c.key, c);
  for (const e of experts) if (e.category && !seen.has(e.category.key)) seen.set(e.category.key, e.category);

  const value: Catalogue = {
    available: true,
    defaultExpertKey: str(envelope.defaultExpertKey),
    categories: [...seen.values()],
    experts,
  };
  listCache = { at: Date.now(), value };
  return value;
}

export async function loadCatalogueExpert(key: string): Promise<CatalogueExpertDetail | null> {
  const hit = detailCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const body = await getJson(`/api/v1/public/experts/${encodeURIComponent(key)}`);
  const value = body && typeof body === "object" ? toDetail(body as Raw) : null;
  // Do not remember a miss when the back office is merely unreachable.
  if (value || backofficeUrl()) detailCache.set(key, { at: Date.now(), value });
  return value;
}

// ---- Joining a Hermes profile to its catalogue entry ------------------------------------------

// Profiles are named client__expert: the catalogue key is what follows the last "__". A profile
// installed under another scheme has no separator and is taken whole.
export function catalogueKeyOf(profileId: string): string {
  return profileId.includes("__") ? profileId.slice(profileId.lastIndexOf("__") + 2) : profileId;
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The catalogue entry of a profile: by key first, then by the expert's first name, because some
// profiles are named after the persona ("djeneba") while the catalogue key describes the job.
export function matchCatalogue(experts: CatalogueExpert[], profileId: string): CatalogueExpert | null {
  const key = catalogueKeyOf(profileId);
  const wanted = slug(key);
  return experts.find((e) => e.key === key) ?? experts.find((e) => slug(e.key) === wanted || slug(e.name) === wanted) ?? null;
}
