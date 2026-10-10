import { backoffice } from "@/lib/backoffice";
import { ApiError, handleError, json } from "@/lib/http";
import { billingToken } from "../../billing/_admin";
import { usageFilter } from "../_filter";

// `GET /api/composio-usage/calls?from=&to=&member=&page=` — the tool executions themselves, newest
// first, 100 a page, for the workspace's admins. Read from the back office.
export async function GET(request: Request) {
  try {
    const token = await billingToken();
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new ApiError(400, "invalid_request", "Cette page n’existe pas.");
    const res = json(await backoffice.composioUsageCalls(token, usageFilter(url), page));
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    return handleError(e);
  }
}
