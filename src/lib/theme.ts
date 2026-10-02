export type Appearance = "clair" | "sombre" | "auto";

export const APPEARANCE_KEY = "yap";

/**
 * Script d'amorçage, injecté dans le <head> : il pose la classe `dark` AVANT le premier
 * rendu, sinon l'écran clignote en clair avant de passer en sombre.
 *
 * Les maquettes stockent le même choix sous la même clé (`yap`), mais appliquent
 * `html[data-mode="nuit"]`. Le kit pilote le sombre par la classe `.dark` — on garde
 * sa convention, que ses composants utilisent déjà.
 */
export const THEME_BOOTSTRAP = `try{
var a=localStorage.getItem("${APPEARANCE_KEY}")||"auto";
if(a==="sombre"||(a==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")
}catch(e){}`;

export function readAppearance(): Appearance {
  try {
    const v = localStorage.getItem(APPEARANCE_KEY);
    if (v === "clair" || v === "sombre" || v === "auto") return v;
  } catch {
    // Stockage indisponible (navigation privée, cookies bloqués) : on retombe sur auto.
  }
  return "auto";
}

export function applyAppearance(a: Appearance) {
  const dark = a === "sombre" || (a === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(APPEARANCE_KEY, a);
  } catch {
    // Le choix ne survivra pas au rechargement, mais la page reste correcte.
  }
}
