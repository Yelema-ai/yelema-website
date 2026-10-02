// Règles de mot de passe, partagées par la création de compte et la réinitialisation
// pour que la validation et l'attribut natif `minLength` ne puissent pas diverger.
// Portées des maquettes (`app.js`, liste `.mdrl`).
export const MIN_PASSWORD = 8;

export const PASSWORD_RULES = [
  { key: "len", label: "8 caractères au moins", test: (v: string) => v.length >= MIN_PASSWORD },
  { key: "maj", label: "Une majuscule", test: (v: string) => /[A-Z]/.test(v) },
  { key: "num", label: "Un chiffre", test: (v: string) => /\d/.test(v) },
] as const;

/** Nombre de règles satisfaites — alimente la jauge de robustesse. */
export function passwordScore(value: string): number {
  return PASSWORD_RULES.filter((r) => r.test(value)).length;
}

export function passwordIsValid(value: string): boolean {
  return passwordScore(value) === PASSWORD_RULES.length;
}
