import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Messaging } from "@/components/messaging/Messaging";
import { ECHANGES_VISIBLE } from "@/lib/features";

// Échanges entre membres, sur toute la hauteur comme le chat d'un Expert : la colonne des échanges, le fil à côté.
export default function Page() {
  if (!ECHANGES_VISIBLE) redirect("/");
  return (
    <div className="flex h-full min-h-0 flex-1">
      <Suspense>
        <Messaging />
      </Suspense>
    </div>
  );
}
