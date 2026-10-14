"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallDialog } from "./CallDialog";
import { useVoices } from "./useVoices";

/** "Appeler" for one expert; absent where voice calls are off (no voice offered). */
export function CallButton({ expert, className }: { expert: { key: string; name: string; photoUrl: string | null }; className?: string }) {
  const voices = useVoices();
  const [open, setOpen] = useState(false);
  if (voices.length === 0) return null;
  return (
    <>
      <Button variant="secondary" size="sm" className={className} onClick={() => setOpen(true)}>
        <Phone />
        Appeler
      </Button>
      <CallDialog open={open} onOpenChange={setOpen} expert={expert} voices={voices} />
    </>
  );
}
