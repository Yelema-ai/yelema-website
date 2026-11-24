// What the screens leave in the browser about an account beside the device cache: the open space, conversation
// ids, the names a member gave to documents, its channels' state, its Experts' reply times. Gone at sign-out with
// the rest (lib/device-cache-client). Pure: tested.
// Preferences of the device itself (theme, folded panels, notification choices) are not listed and stay.

const EXACT = ["agent37wl_workspace", "yelema.documents-noms", "yelema.q", "yelema:latence"];
const PREFIXES = ["yele-session:", "yelema.activity.", "yelema.documents-epingles.", "yelema:tableau-auto:", "yelema-install:", "yelema:channels:"];

type Store = Pick<Storage, "length" | "key" | "removeItem">;

export const isAccountKey = (key: string): boolean => EXACT.includes(key) || PREFIXES.some((p) => key.startsWith(p));

export function eraseMetadata(...stores: (Store | null | undefined)[]): void {
  for (const s of stores) {
    try {
      if (!s) continue;
      const keys = Array.from({ length: s.length }, (_, i) => s.key(i)).filter((k): k is string => k !== null && isAccountKey(k));
      for (const k of keys) s.removeItem(k);
    } catch {
      /* storage refused: nothing was kept there either */
    }
  }
}
