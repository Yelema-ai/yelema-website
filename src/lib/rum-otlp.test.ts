import assert from "node:assert/strict";
import { test } from "node:test";
import { headersOf, otlpBody, sendRum } from "./rum-otlp.ts";
import type { RumRecord } from "./rum.ts";

const r = (render: number | null, api: number): RumRecord => ({ screen: "/livrables", nav: "soft", render, inp: 80, interactions: 1, api });
type M = { name: string; histogram?: { aggregationTemporality: number; dataPoints: { count: string; sum: number; bucketCounts: string[] }[] }; sum?: { dataPoints: { asInt: string }[] } };
const metrics = (b: unknown) => (b as { resourceMetrics: { scopeMetrics: { metrics: M[] }[] }[] }).resourceMetrics[0]!.scopeMetrics[0]!.metrics;

test("a batch becomes delta histograms per screen, timeouts counted apart", () => {
  const m = metrics(otlpBody([r(90, 3), r(450, 12), r(null, 0)], 0, 1000));
  const render = m.find((x) => x.name === "yelema.rum.render")!.histogram!;
  assert.equal(render.aggregationTemporality, 1);
  assert.equal(render.dataPoints[0]!.count, "2");
  assert.equal(render.dataPoints[0]!.sum, 540);
  assert.equal(render.dataPoints[0]!.bucketCounts[4], "1");
  assert.equal(m.find((x) => x.name === "yelema.rum.api_calls")!.histogram!.dataPoints[0]!.count, "3");
  assert.equal(m.find((x) => x.name === "yelema.rum.render_timeouts")!.sum!.dataPoints[0]!.asInt, "1");
});

test("headers in the OTel k=v form", () => {
  assert.deepEqual(headersOf("Authorization=Basic%20abc, x-a = b"), { Authorization: "Basic abc", "x-a": "b" });
  assert.deepEqual(headersOf(undefined), {});
});

test("no endpoint: one log line; endpoint: POST /v1/metrics; failure never throws", async () => {
  const lines: string[] = [];
  const info = console.info;
  console.info = (l: string) => void lines.push(l);
  try {
    assert.equal(await sendRum([r(1, 1)], {}), "log");
  } finally {
    console.info = info;
  }
  assert.match(lines[0] ?? "", /^\[rum\] \[\{"screen":"\/livrables"/);
  let url = "";
  const ok = (async (u: string) => ((url = u), new Response(null, { status: 200 }))) as unknown as typeof fetch;
  assert.equal(await sendRum([r(1, 1)], { RUM_OTLP_ENDPOINT: "https://otel.example/" }, ok), "otlp");
  assert.equal(url, "https://otel.example/v1/metrics");
  const ko = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
  assert.equal(await sendRum([r(1, 1)], { RUM_OTLP_ENDPOINT: "https://otel.example" }, ko), "failed");
});
