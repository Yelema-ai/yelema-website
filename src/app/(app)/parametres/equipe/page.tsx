import { Suspense } from "react";
import { TeamView } from "@/components/team/TeamView";

// Paramètres > Équipe. `?ajouter=1` (the top bar's "Inviter un collègue") opens the add dialog.
export default function TeamPage() {
  return (
    <Suspense>
      <TeamView />
    </Suspense>
  );
}
