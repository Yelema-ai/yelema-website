import { ApiError, handleError } from "@/lib/http";

// Members are added and removed by the Yelema back-office only (it also deletes their agent).
export async function DELETE() {
  try {
    throw new ApiError(403, "forbidden", "Members are managed by the Yelema back-office");
  } catch (e) {
    return handleError(e);
  }
}
