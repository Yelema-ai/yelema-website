"use client";

import { useEffect } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCall } from "./CallProvider";
import { useVoices } from "./useVoices";
import { preloadFace } from "./face";

/** "Appeler" for one expert; absent where voice calls are off (no voice offered). */
export function CallButton({
  expert,
  className,
  label = "Appeler",
  iconOnly = false,
  primary = false,
}: {
  expert: { key: string; name: string; photoUrl: string | null };
  className?: string;
  label?: string;
  /** A round icon, for a phone's header: the label goes to the screen reader. */
  iconOnly?: boolean;
  /** The page's main action (an empty « Appels »): the brand button, larger. */
  primary?: boolean;
}) {
  const voices = useVoices();
  const { call } = useCall();
  const shown = voices.length > 0;
  // The face is loaded as soon as the button shows, so the call opens on it.
  useEffect(() => {
    if (shown) preloadFace(expert.photoUrl);
  }, [shown, expert.photoUrl]);
  if (!shown) return null;
  return (
    <>
      <Button
        variant={primary ? "default" : "secondary"}
        size={iconOnly ? "icon" : primary ? "lg" : "sm"}
        className={className}
        onClick={() => call(expert, voices)}
        onPointerEnter={() => preloadFace(expert.photoUrl)}
        onFocus={() => preloadFace(expert.photoUrl)}
        aria-label={iconOnly ? `${label} ${expert.name}` : undefined}
        title={iconOnly ? `${label} ${expert.name}` : undefined}
      >
        <Phone />
        {!iconOnly && label}
      </Button>
    </>
  );
}
