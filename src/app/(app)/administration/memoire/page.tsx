import { redirect } from "next/navigation";

// La mémoire vit désormais dans l'onglet Entreprise.
export default function Page() {
  redirect("/administration/entreprise");
}
