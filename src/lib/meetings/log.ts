export function logFailure(what: string, e: unknown): void {
  console.error(`[meetings] ${what}:`, e instanceof Error ? e.message : e);
}
