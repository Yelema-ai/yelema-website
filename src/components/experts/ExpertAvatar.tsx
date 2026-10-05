import type { Expert } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: { box: "size-7 text-xs", dot: "size-2.5" },
  sm: { box: "size-[34px] text-[13px]", dot: "size-[11px]" },
  md: { box: "size-[48px] text-base", dot: "size-[13px]" },
  lg: { box: "size-[72px] text-2xl", dot: "size-4" },
} as const;

/**
 * Le visage d'un Expert, avec sa pastille d'état.
 *
 * La photo vient du catalogue du back-office (`photoUrl`) ; sans elle, on affiche l'initiale.
 */
export function ExpertAvatar({
  expert,
  size = "sm",
  className,
}: {
  expert: Pick<Expert, "displayName" | "gateway" | "photoUrl">;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={cn("relative shrink-0", className)}>
      {expert.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={expert.photoUrl}
          alt=""
          className={cn(s.box, "rounded-full object-cover object-[50%_20%]")}
        />
      ) : (
        <span
          className={cn(s.box, "grid place-items-center rounded-full bg-tint font-bold text-brand-ink")}
        >
          {expert.displayName.trim()[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      {/* La colonne « Gateway » de `hermes profile list` : le profil peut répondre, ou non. Inconnue
          quand la liste vient de la base (l'instance n'a pas été interrogée) : pas de pastille. */}
      {expert.gateway != null && (
        <span
          className={cn(
            "absolute -right-px -bottom-px rounded-full ring-2 ring-card",
            s.dot,
            expert.gateway === "running" ? "bg-ok" : "bg-[#B8B4C6]"
          )}
        />
      )}
    </span>
  );
}
