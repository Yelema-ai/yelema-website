// How long a shared dashboard link lasts, chosen by its owner. No imports: read by the browser too.
export const SHARE_EXPIRIES = ["7", "30", "90", "none"] as const;
export type ShareExpiry = (typeof SHARE_EXPIRIES)[number];
export const DEFAULT_SHARE_EXPIRY: ShareExpiry = "30";
const DAY_MS = 86_400_000;

export const shareExpiryOf = (raw: unknown): ShareExpiry => SHARE_EXPIRIES.find((x) => x === raw) ?? DEFAULT_SHARE_EXPIRY;

/** The end of a link issued at `nowMs` for `choice`; null for « sans fin ». */
export const shareEndOf = (choice: ShareExpiry, nowMs: number): number | null => (choice === "none" ? null : nowMs + Number(choice) * DAY_MS);
