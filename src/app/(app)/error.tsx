"use client";

import { useEffect } from "react";
import { PageBody } from "@/components/app/PageBody";
import { Button } from "@/components/ui/button";

// A page of the signed-in frame failed to render. The menu stays; the page offers to try again.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageBody>
      <div className="max-w-xl">
        <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Cette page n’a pas pu s’afficher</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          Un incident s’est produit de notre côté. Réessayez dans un instant ; si cela continue, contactez Yelema.
        </p>
        <Button className="mt-5" onClick={reset}>
          Réessayer
        </Button>
      </div>
    </PageBody>
  );
}
