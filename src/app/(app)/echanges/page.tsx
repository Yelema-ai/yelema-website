import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Messaging } from "@/components/messaging/Messaging";
import { echangesVisible } from "@/lib/runtime-config";

// Échanges entre membres, sur toute la hauteur comme le chat d'un Expert : la colonne des échanges, le fil à côté.
export default function Page() {
  if (!echangesVisible()) redirect("/");
  return (
    <div className="flex h-full min-h-0 flex-1">
      <Suspense>
        <Messaging />
      </Suspense>
    </div>
  );
}
