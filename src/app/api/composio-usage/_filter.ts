import type { BoUsageFilter } from "@/lib/backoffice";
import { ApiError } from "@/lib/http";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// The period and the member asked for, checked before they go into the back office's URL.
export function usageFilter(url: URL): BoUsageFilter {
  const filter: BoUsageFilter = {};
  for (const key of ["from", "to"] as const) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    if (!DAY.test(value)) throw new ApiError(400, "invalid_request", "Cette période n’est pas valide.");
    filter[key] = value;
  }
  const member = url.searchParams.get("member")?.trim();
  if (member) {
    if (member.length > 254 || !member.includes("@")) throw new ApiError(400, "invalid_request", "Ce membre est introuvable.");
    filter.member = member;
  }
  return filter;
}
