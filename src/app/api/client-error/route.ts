// `POST /api/client-error` — a screen's render error, written to the server logs (one line, bounded).
export async function POST(request: Request) {
  const text = (await request.text().catch(() => "")).slice(0, 6000);
  let e: Record<string, unknown> = {};
  try {
    e = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 204 });
  }
  const s = (v: unknown, n: number) => String(v ?? "").replace(/[\r\n]+/g, " ⏎ ").slice(0, n);
  console.error(`[client-error] ${s(e.where, 40)} ${s(e.path, 200)} :: ${s(e.message, 500)} :: ${s(e.stack, 4000)} :: digest=${s(e.digest, 40)}`);
  return new Response(null, { status: 204 });
}
