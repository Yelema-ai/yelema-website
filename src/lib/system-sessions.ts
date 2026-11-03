// Conversations the platform opens with an Expert for its own preparation, not for the member: the day-zero
// check (« Préparation du jour zéro : applique… », skill jour-zero). Its result is the readiness chip and
// banner; as a conversation it is noise in the rail (Leslie, 30/10: « routines inutiles »). No imports: tested.

const SYSTEM_START = /^\s*pr[ée]paration du jour z[ée]ro\b/i;

export function isSystemSession({ title, preview }: { title?: string | null; preview?: string | null }): boolean {
  return SYSTEM_START.test(title ?? "") || SYSTEM_START.test(preview ?? "");
}
