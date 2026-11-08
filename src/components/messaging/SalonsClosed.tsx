"use client";

import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closedSalons } from "@/lib/salons-closed";

// Salons pas (encore) ouverts pour ce membre : un état calme au centre de la page, jamais un bloc d'erreur rouge.
// Le back-office dit pourquoi ; ce qui n'est qu'un délai se réessaie d'un clic.
export function SalonsClosed({ reason }: { reason: string }) {
  const { title, text, retry } = closedSalons(reason);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-full bg-soft text-ink-3">
          <MessagesSquare className="size-6" strokeWidth={1.8} />
        </span>
        <h1 className="mt-4 text-[17px] font-semibold text-ink">{title}</h1>
        <p className="mt-1.5 text-sm text-ink-3">{text}</p>
        {retry && (
          <Button variant="outline" className="mt-5" onClick={() => window.location.reload()}>
            Réessayer
          </Button>
        )}
      </div>
    </div>
  );
}
