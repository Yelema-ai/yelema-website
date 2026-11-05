import { AllDeliverables } from "@/components/files/AllDeliverables";
import { initialDrives } from "@/lib/first-screen-server";

// Tous les livrables, ouverts par « Voir tous » sous les derniers livrables de l'accueil (pas au menu).
// Not awaited: the page goes out at once and the server's reading streams in behind it.
export default function Page() {
  return <AllDeliverables initial={initialDrives()} />;
}
