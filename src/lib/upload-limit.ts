// The largest file a member can send from the browser, to the drive or as a chat attachment. The
// app's host (Vercel) refuses any request body over 4.5 MB before a route sees it, and answers with
// its own page; a file is checked here first so the member reads why. Kept under the limit to leave
// room for the multipart envelope of a chat attachment. No imports: safe in client components.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const TOO_LARGE = "Ce fichier dépasse 4 Mo, la taille maximale d’un envoi.";

export function tooLarge(file: File): boolean {
  return file.size > MAX_UPLOAD_BYTES;
}
