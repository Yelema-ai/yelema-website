// Un nom lu sur l'instance (fichier, routine, compétence, modèle, compte) dans une ligne de réponse d'outil : ni saut
// de ligne, ni bloc de code, ni bord de tableau pour le faire passer pour un texte de Yélé, et court.
export function inline(raw: unknown, max = 120): string {
  const s = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/`/g, "'")
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
