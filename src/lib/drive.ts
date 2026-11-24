import { ApiError } from "@/lib/http";
import { DRIVE_ROOT, drivePathFault } from "@/lib/drive-paths";

export { ATTACHMENTS_DIR, DRIVE_ABS, DRIVE_ROOT, isDriveRoot } from "@/lib/drive-paths";

// The files API has no sandbox: it can read anything on the instance, including ~/.hermes and
// ~/.yelema (keys, tokens). Every files route accepts only paths inside the drive; an empty path
// means the drive's root.
export function assertInDrive(raw: string | null | undefined): string {
  const path = (raw ?? "").trim();
  if (!path) return DRIVE_ROOT;
  const fault = drivePathFault(path);
  if (fault === "invalid") throw new ApiError(400, "invalid_path", "Chemin invalide");
  if (fault) throw new ApiError(403, "forbidden_path", "Ce dossier n’est pas accessible");
  return path;
}
