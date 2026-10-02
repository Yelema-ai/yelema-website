import { requireUser } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/http";

// The workspace name is set in the Yelema back-office (it can differ from the client's legal name),
// which stays its single source of truth: the app does not rename it.
export async function PATCH() {
  try {
    await requireUser();
    throw new ApiError(403, "forbidden", "The workspace name is managed by the Yelema back-office");
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE() {
  try {
    await requireUser();
    // One client per deployment: the workspace is created and owned by the Yelema back-office.
    throw new ApiError(403, "forbidden", "Workspaces are managed by the back-office");
  } catch (e) {
    return handleError(e);
  }
}
