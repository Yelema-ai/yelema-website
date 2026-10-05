import { ApiError } from "@/lib/http";
import { DRIVE_ABS, DRIVE_ROOT } from "@/lib/drive-paths";

export { ATTACHMENTS_DIR, DRIVE_ABS, DRIVE_ROOT, isDriveRoot } from "@/lib/drive-paths";

// The files API has no sandbox: it can read anything on the instance, including ~/.hermes and
// ~/.yelema (keys, tokens). Every files route accepts only paths inside the drive; an empty path
// means the drive's root.
export function assertInDrive(raw: string | null | undefined): string {
  const path = (raw ?? "").trim();
  if (!path) return DRIVE_ROOT;
  const parts = path.split("/");
  if (parts.includes("..") || parts.includes(".")) throw new ApiError(400, "invalid_path", "Chemin invalide");
  const inside = (root: string) => path === root || path.startsWith(`${root}/`);
  if (!inside(DRIVE_ROOT) && !inside(DRIVE_ABS)) throw new ApiError(403, "forbidden_path", "Ce dossier n’est pas accessible");
  return path;
}
