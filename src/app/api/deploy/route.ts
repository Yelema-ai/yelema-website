import { deployStatus } from "@/lib/deploy-server";

// What an open page asks to tell the member about an update. Secret-free, behind the session like any page.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await deployStatus(), { headers: { "Cache-Control": "no-store" } });
}
