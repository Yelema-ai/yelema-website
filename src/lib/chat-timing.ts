// Where the wait of one chat turn goes, measured in the browser. No imports: tested as is.
//
// Four marks after the member presses Envoyer: the app's server answered (`accepted`: the host, the
// back office, a sleeping instance waking), the instance opened the turn (`created`), the first
// sign of the Expert (`first`: a word, a thought or a tool), and the end (`done`). Nothing of what
// was said is kept: times, the model, and how many tools ran.

export interface TurnTiming {
  t0: number;
  accepted?: number;
  created?: number;
  first?: number;
  tools: number;
}

export interface TimingRecord {
  at: string;
  profile: string | null;
  model: string | null;
  acceptedMs: number | null;
  createdMs: number | null;
  firstMs: number | null;
  doneMs: number;
  tools: number;
  outcome: "completed" | "failed";
}

export function startTiming(now: number): TurnTiming {
  return { t0: now, tools: 0 };
}

/** Sets a mark the first time only: a later event of the same kind says nothing new. */
export function mark(t: TurnTiming, which: "accepted" | "created" | "first", now: number): void {
  if (t[which] === undefined) t[which] = now;
}

export function finishTiming(
  t: TurnTiming,
  now: number,
  meta: { at: Date; profile: string | null; model: string | null; outcome: "completed" | "failed" }
): TimingRecord {
  const since = (v: number | undefined) => (v === undefined ? null : Math.round(v - t.t0));
  return {
    at: meta.at.toISOString(),
    profile: meta.profile,
    model: meta.model,
    acceptedMs: since(t.accepted),
    createdMs: since(t.created),
    firstMs: since(t.first),
    doneMs: Math.round(now - t.t0),
    tools: t.tools,
    outcome: meta.outcome,
  };
}

/** The last `max` records, newest last: what the browser keeps to read back. */
export function keepLast<T>(list: T[], item: T, max = 50): T[] {
  return [...list, item].slice(-max);
}

/** A record the server will log: every field of the right type, nothing else. */
export function isTimingRecord(v: unknown): v is TimingRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const ms = (x: unknown) => x === null || (typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 3_600_000);
  const name = (x: unknown) => x === null || (typeof x === "string" && x.length <= 120);
  return (
    typeof r.at === "string" &&
    r.at.length <= 40 &&
    name(r.profile) &&
    name(r.model) &&
    ms(r.acceptedMs) &&
    ms(r.createdMs) &&
    ms(r.firstMs) &&
    ms(r.doneMs) &&
    r.doneMs !== null &&
    typeof r.tools === "number" &&
    Number.isInteger(r.tools) &&
    r.tools >= 0 &&
    r.tools < 10_000 &&
    (r.outcome === "completed" || r.outcome === "failed") &&
    Object.keys(r).length === 9
  );
}
