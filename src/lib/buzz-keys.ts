import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { bytesToHex, hexToBytes } from "nostr-tools/utils";
import { apiFetch } from "@/lib/api";
import { BUZZ_RELAY, keptKeyFor, ownKey, readKey, writeKey, type KeptKey } from "@/lib/buzz-key-store";
import { deviceAccount, devicePersists } from "@/lib/device-cache-client";

// This browser's messaging key: generated here, kept in this browser only, never sent anywhere —
// only its public half is admitted on the client's relay (`POST /api/buzz/devices`). It rests bound to
// the account that made it (lib/buzz-key-store) and leaves at sign-out; where nothing may rest on the
// device, in the tab's own storage. Lost storage = a new key; the old one ages out with the device.

function vault(): Storage | null {
  try {
    return devicePersists() ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

function kept(): KeptKey | null {
  try {
    const s = vault();
    return s ? readKey(s) : null;
  } catch {
    return null;
  }
}

function fresh(account: string | null): Uint8Array {
  const sk = generateSecretKey();
  keep(sk, account);
  return sk;
}

function keep(secret: Uint8Array, account: string | null): void {
  try {
    const s = vault();
    if (s && account) writeKey(s, bytesToHex(secret), account);
  } catch {
    /* private window: the key lives for this tab only */
  }
}

/** The confirmed account's own key, if this browser holds it: enough to open the relay before the back office answers. */
export function storedKey(): { secret: Uint8Array; pubkey: string } | null {
  const hex = ownKey(kept(), deviceAccount());
  if (!hex) return null;
  const secret = hexToBytes(hex);
  return { secret, pubkey: getPublicKey(secret) };
}

/** The key this browser would sign out with (whoever it is bound to), to have the back office drop it. */
export function heldPubkey(): string | null {
  const k = kept();
  return k ? getPublicKey(hexToBytes(k.hex)) : null;
}

/** The relay address of the last overview (this tab only), so the next visit dials it at once. */
export function rememberedRelay(url?: string): string | null {
  try {
    if (url) sessionStorage.setItem(BUZZ_RELAY, url);
    return sessionStorage.getItem(BUZZ_RELAY);
  } catch {
    return null;
  }
}

const label = (): string => `Navigateur · ${new Date().toLocaleDateString("fr-FR")}`;

/** The browser's key, admitted for this member; a key bound to another account is never reused nor sent. */
export async function deviceKey(admitted: string[]): Promise<{ secret: Uint8Array; pubkey: string }> {
  const account = deviceAccount();
  const hex = keptKeyFor(kept(), account, (h) => admitted.includes(getPublicKey(hexToBytes(h))));
  let secret = hex ? hexToBytes(hex) : fresh(account);
  let pubkey = getPublicKey(secret);
  if (hex) keep(secret, account);
  if (admitted.includes(pubkey)) return { secret, pubkey };
  try {
    await apiFetch("/api/buzz/devices", { method: "POST", body: JSON.stringify({ pubkey, label: label() }) });
  } catch {
    secret = fresh(account);
    pubkey = getPublicKey(secret);
    await apiFetch("/api/buzz/devices", { method: "POST", body: JSON.stringify({ pubkey, label: label() }) });
  }
  return { secret, pubkey };
}
