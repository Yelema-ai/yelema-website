"use client";

import { Suspense } from "react";
import { Messaging } from "@/components/messaging/Messaging";

// Échanges entre membres, sur toute la hauteur comme le chat d'un Expert : la colonne des échanges, le fil à côté.
export default function Page() {
  return (
    <div className="flex h-full min-h-0 flex-1">
      <Suspense>
        <Messaging />
      </Suspense>
    </div>
  );
}
