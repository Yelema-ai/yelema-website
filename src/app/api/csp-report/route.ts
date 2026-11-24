// `POST /api/csp-report` — what the browser reports against the page's policy (lib/csp.ts): one bounded line in the logs.
export async function POST(request: Request) {
  const text = (await request.text().catch(() => "")).slice(0, 4000);
  let r: Record<string, unknown> = {};
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    r = (body["csp-report"] as Record<string, unknown> | undefined) ?? body;
  } catch {
    return new Response(null, { status: 204 });
  }
  const s = (v: unknown, n: number) => String(v ?? "").replace(/[\r\n]+/g, " ").slice(0, n);
  // The blocked address without its query: an exfiltration attempt carries its data there.
  console.warn(`[csp] ${s(r["effective-directive"] ?? r["violated-directive"], 40)} bloque=${s(r["blocked-uri"], 300).split("?")[0]} page=${s(r["document-uri"], 200).split("?")[0]} mode=${s(r.disposition, 10)}`);
  return new Response(null, { status: 204 });
}
