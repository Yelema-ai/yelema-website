// A change shown before the server agrees (principle 3): `apply` at once, `run` the request, and on a
// refusal `rollback` then `refused` with the reason, so a refusal is always seen. True when it went through.
export async function optimistic({ apply, run, rollback, refused }: { apply: () => void; run: () => Promise<unknown>; rollback: () => void; refused: (message: string) => void }): Promise<boolean> {
  apply();
  try {
    await run();
    return true;
  } catch (e) {
    rollback();
    refused(e instanceof Error && e.message ? e.message : "Le serveur a refusé la modification.");
    return false;
  }
}
