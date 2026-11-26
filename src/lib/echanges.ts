/** Échanges (messagerie entre membres) n'apparaît que si le projet Vercel pose `ECHANGES=on` (la pilote, pour l'instant). */
export const echangesOn = (value: string | undefined): boolean => value?.trim().toLowerCase() === "on";
