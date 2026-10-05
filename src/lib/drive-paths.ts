// The drive: ~/Livrables on the member's instance. Experts save their work in their own folder
// there (~/Livrables/<Expert>/), the member uploads documents at its root. No imports: safe in
// client components (the path guard lives in lib/drive.ts, server-side).
export const DRIVE_ROOT = "~/Livrables";
// The same folder as the files API reports it (absolute; the image's home is /home/node).
export const DRIVE_ABS = "/home/node/Livrables";
// Where chat attachments land, so they show up in the Files tab too.
export const ATTACHMENTS_DIR = `${DRIVE_ROOT}/Pièces jointes`;

export function isDriveRoot(path: string): boolean {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === DRIVE_ROOT || trimmed === DRIVE_ABS;
}
