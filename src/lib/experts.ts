// Nom affichable d'un Expert à partir de son identifiant de profil Hermes.
//
// Le control-plane nomme les profils `client__expert` (`toHermesProfileId`), donc la partie
// après le dernier `__` est le nom de l'Expert. Un profil installé autrement n'aura pas ce
// séparateur : on affiche alors l'identifiant entier plutôt que de deviner.
//
// Provisoire, et pas une vérité : le vrai nom, l'avatar et le métier vivent dans le `SOUL.md`
// et la configuration YAML du dossier de profil, qu'on ne lit pas encore.
export function expertDisplayName(profileId: string): string {
  const tail = profileId.includes("__") ? profileId.slice(profileId.lastIndexOf("__") + 2) : profileId;
  const words = tail.replace(/[_-]+/g, " ").trim();
  if (!words) return profileId;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
