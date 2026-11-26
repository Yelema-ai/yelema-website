import { parseBatch } from "@/lib/rum";
import { sendRum } from "@/lib/rum-otlp";

// `POST /api/rum` — sampled screen timings from the browser (lib/rum), forwarded to the OTel collector or
// logged. Signed-in members only (the proxy refuses the rest); nothing personal is read or kept.
export async function POST(request: Request) {
  const text = (await request.text().catch(() => "")).slice(0, 16_000);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const records = parseBatch(body);
  if (!records) return new Response(null, { status: 400 });
  await sendRum(records, process.env);
  return new Response(null, { status: 204 });
}
