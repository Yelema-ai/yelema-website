import { backoffice } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { mailToken as sessionToken, noStore } from "../../../../mail/_session";

// `POST /api/memory/items/{id}/versions` — a new file for a deposited document (multipart, field
// `file`), relayed as it came: the back office keeps the old file as the previous version, checks the
// right to deposit, the file's real type and its size.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return noStore(json(await backoffice.uploadMemoryVersion(await sessionToken(), (await params).id, await request.formData())));
  } catch (e) {
    return handleError(e);
  }
}
