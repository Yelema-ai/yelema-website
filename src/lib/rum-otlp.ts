// RUM records → OTLP/HTTP JSON delta metrics for the collector (`RUM_OTLP_ENDPOINT`), or one log line
// `[rum] {...}` per batch when no endpoint is set. Imports nothing, so it is tested as is.

import type { RumRecord } from "./rum.ts";

type Env = Record<string, string | undefined>;

export const MS_BOUNDS = [5, 10, 25, 50, 100, 200, 300, 500, 750, 1000, 2000, 5000, 10000];
export const CALL_BOUNDS = [0, 1, 2, 3, 5, 8, 12, 20, 30, 50];

type Hist = { attrs: Record<string, string>; bounds: number[]; counts: number[]; count: number; sum: number };

const kv = (attrs: Record<string, string>) => Object.entries(attrs).map(([key, v]) => ({ key, value: { stringValue: v } }));
const nano = (ms: number) => `${String(Math.round(ms))}000000`;

function add(map: Map<string, Hist>, name: string, attrs: Record<string, string>, bounds: number[], v: number): void {
  const key = `${name}|${JSON.stringify(attrs)}`;
  let h = map.get(key);
  if (!h) map.set(key, (h = { attrs, bounds, counts: new Array<number>(bounds.length + 1).fill(0), count: 0, sum: 0 }));
  const i = bounds.findIndex((b) => v <= b);
  h.counts[i < 0 ? bounds.length : i] += 1;
  h.count += 1;
  h.sum += v;
}

/** One OTLP body for a batch: delta histograms, so each beacon adds to the collector's totals. */
export function otlpBody(records: RumRecord[], startMs: number, endMs: number): unknown {
  const hists = new Map<string, Hist>();
  const timeouts = new Map<string, number>();
  for (const r of records) {
    const attrs = { screen: r.screen, nav: r.nav };
    if (r.render === null) timeouts.set(JSON.stringify(attrs), (timeouts.get(JSON.stringify(attrs)) ?? 0) + 1);
    else add(hists, "yelema.rum.render", attrs, MS_BOUNDS, r.render);
    if (r.inp !== null) add(hists, "yelema.rum.interaction", { screen: r.screen }, MS_BOUNDS, r.inp);
    add(hists, "yelema.rum.api_calls", { screen: r.screen }, CALL_BOUNDS, r.api);
  }
  const byName = new Map<string, Hist[]>();
  for (const [key, h] of hists) {
    const name = key.split("|")[0] ?? "";
    byName.set(name, [...(byName.get(name) ?? []), h]);
  }
  const time = { startTimeUnixNano: nano(startMs), timeUnixNano: nano(endMs) };
  const metrics: unknown[] = [...byName].map(([name, hs]) => ({
    name,
    unit: name === "yelema.rum.api_calls" ? "1" : "ms",
    histogram: { aggregationTemporality: 1, dataPoints: hs.map((h) => ({ attributes: kv(h.attrs), ...time, count: String(h.count), sum: h.sum, bucketCounts: h.counts.map(String), explicitBounds: h.bounds })) },
  }));
  if (timeouts.size) {
    const dataPoints = [...timeouts].map(([a, n]) => ({ attributes: kv(JSON.parse(a) as Record<string, string>), ...time, asInt: String(n) }));
    metrics.push({ name: "yelema.rum.render_timeouts", unit: "1", sum: { aggregationTemporality: 1, isMonotonic: true, dataPoints } });
  }
  const resource = { attributes: kv({ "service.name": "yelema-site", "service.namespace": "yelema" }) };
  return { resourceMetrics: [{ resource, scopeMetrics: [{ scope: { name: "yelema.rum" }, metrics }] }] };
}

/** `RUM_OTLP_HEADERS` in the OTel form `k=v,k2=v2` (e.g. an Authorization for the collector's door). */
export function headersOf(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (raw ?? "").split(",")) {
    const i = pair.indexOf("=");
    if (i > 0) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  }
  return out;
}

/** Forwards a batch; never throws: a lost batch is only a lost sample. */
export async function sendRum(records: RumRecord[], env: Env, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<"otlp" | "log" | "failed"> {
  const endpoint = env.RUM_OTLP_ENDPOINT?.trim().replace(/\/+$/, "");
  if (!endpoint) {
    console.info(`[rum] ${JSON.stringify(records)}`);
    return "log";
  }
  try {
    const res = await fetchImpl(`${endpoint}/v1/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headersOf(env.RUM_OTLP_HEADERS) },
      body: JSON.stringify(otlpBody(records, now - 1_000, now)),
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok ? "otlp" : "failed";
  } catch {
    return "failed";
  }
}
