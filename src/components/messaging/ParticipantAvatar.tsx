import { shortName, type BuzzEntry } from "@/lib/buzz";
import { cn } from "@/lib/utils";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";

// Le visage d'un participant : le portrait d'un Expert, la photo de profil d'une personne ; l'initiale sans l'un ni l'autre.
export function ParticipantAvatar({ entry, name, size = "xs", className }: { entry: BuzzEntry | null; name: string; size?: "xxs" | "xs" | "sm"; className?: string }) {
  if (entry?.type === "expert") return <ExpertAvatar expert={{ displayName: shortName(entry.nom), gateway: null, photoUrl: entry.photo ?? null }} size={size} className={className} />;
  const box = size === "xxs" ? "size-6 text-[10px]" : size === "sm" ? "size-[34px] text-[13px]" : "size-7 text-xs";
  return (
    <span className={cn(box, "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-soft-2 font-bold text-ink-2", className)} aria-hidden>
      {name.trim()[0]?.toUpperCase() ?? "?"}
      {/* L'initiale reste dessous : elle se voit si la photo ne se charge pas. */}
      {entry?.photo && <img src={entry.photo} alt="" loading="lazy" className="absolute inset-0 size-full rounded-full object-cover" onError={(e) => e.currentTarget.remove()} />}
    </span>
  );
}
