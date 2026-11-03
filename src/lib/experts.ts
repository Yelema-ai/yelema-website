// Nom affichable d'un Expert à partir de son identifiant de profil Hermes.
//
// Le control-plane nomme les profils `client__expert` (`toHermesProfileId`), donc la partie
// après le dernier `__` est le nom de l'Expert. Un profil installé autrement n'aura pas ce
// séparateur : on affiche alors l'identifiant entier plutôt que de deviner.
//
// Provisoire, et pas une vérité : le vrai nom, l'avatar et le métier vivent dans le `SOUL.md`
// et la configuration YAML du dossier de profil, qu'on ne lit pas encore.
export function expertDisplayName(profileId: string): string {
  // Yélé, l'aide de chaque espace, n'est pas au catalogue : son nom s'écrit avec ses accents
  // (« Yele » sur sa page et dans ses routines, Leslie 01/11). Mêmes clés que lib/companion.
  if (/^(yele|yele-companion|accompagnement-yele)$/i.test(profileId.slice(profileId.lastIndexOf("__") + 2))) return "Yélé";
  const tail = profileId.includes("__") ? profileId.slice(profileId.lastIndexOf("__") + 2) : profileId;
  const words = tail.replace(/[_-]+/g, " ").trim();
  if (!words) return profileId;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
