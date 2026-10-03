// The shared drive: ~/Livrables on the workspace instance. Experts save their work in their own
// folder there (~/Livrables/<Prénom>/), the team uploads company documents at its root. No imports:
// safe in client components (the path guard lives in lib/drive.ts, server-side).
export const DRIVE_ROOT = "~/Livrables";
// The same folder as the files API reports it (absolute; the image's home is /home/node).
export const DRIVE_ABS = "/home/node/Livrables";

// An expert's own folder in the drive.
export function expertFolder(name: string): string {
  return `${DRIVE_ROOT}/${name}`;
}
