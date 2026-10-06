import { redirect } from "next/navigation";

// Ancienne adresse de la liste des membres : elle est maintenant la page Administration elle-même.
export default function Page() {
  redirect("/administration");
}
