// Where this browser's messaging key rests: bound to the account that made it, gone at sign-out.
// No crypto import, so the shell can erase it without loading the messaging code. Pure: tested.

export const BUZZ_KEY = "yelema.buzz.key";
export const BUZZ_RELAY = "yelema.buzz.relais";

type Read = Pick<Storage, "getItem">;
type Write = Pick<Storage, "setItem">;
type Erase = Pick<Storage, "removeItem">;

/** `account` null: a key kept before keys were bound, whose owner is unknown. */
export interface KeptKey { hex: string; account: string | null }

const HEX = /^[0-9a-f]{64}$/;

export function readKey(s: Read): KeptKey | null {
  const raw = s.getItem(BUZZ_KEY);
  if (!raw) return null;
  if (HEX.test(raw)) return { hex: raw, account: null };
  try {
    const v = JSON.parse(raw) as { k?: unknown; a?: unknown };
    return typeof v.k === "string" && HEX.test(v.k) && typeof v.a === "string" && v.a ? { hex: v.k, account: v.a } : null;
  } catch {
    return null;
  }
}

export const writeKey = (s: Write, hex: string, account: string): void => s.setItem(BUZZ_KEY, JSON.stringify({ k: hex, a: account }));

/** The key `account` may use before the back office answers: its own, never an unbound or another account's. */
export const ownKey = (kept: KeptKey | null, account: string | null): string | null => (kept && account && kept.account === account ? kept.hex : null);

/**
 * The key to go on with once the back office listed the member's admitted keys: its own; an unbound one only
 * if `isAdmitted` (the back office says this member holds it); never another account's. null: make a new one.
 */
export function keptKeyFor(kept: KeptKey | null, account: string | null, isAdmitted: (hex: string) => boolean): string | null {
  if (!kept || !account) return null;
  if (kept.account === account) return kept.hex;
  return kept.account === null && isAdmitted(kept.hex) ? kept.hex : null;
}

/** Sign-out, an ended session, another account: the key and the relay's address leave every storage. */
export function eraseKeys(...stores: (Erase | null | undefined)[]): void {
  for (const s of stores) {
    try {
      s?.removeItem(BUZZ_KEY);
      s?.removeItem(BUZZ_RELAY);
    } catch {
      /* storage refused: nothing was kept there either */
    }
  }
}
