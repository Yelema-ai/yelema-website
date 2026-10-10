import { backoffice } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { billingToken } from "../billing/_admin";
import { usageFilter } from "./_filter";

// `GET /api/composio-usage?from=&to=&member=` — what the workspace's experts spent on tools over a
// period, in all, by member and by application, for its admins. Read from the back office, which
// records and prices every execution; the app holds none of it.
export async function GET(request: Request) {
  try {
    const token = await billingToken();
    const res = json(await backoffice.composioUsage(token, usageFilter(new URL(request.url))));
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    return handleError(e);
  }
}
