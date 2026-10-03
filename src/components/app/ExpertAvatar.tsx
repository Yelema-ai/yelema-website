import { cn } from "@/lib/utils";

export function ExpertAvatar({ expertKey, size = 34, className }: { expertKey: string; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/experts/${expertKey}.jpg`}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-full object-cover object-[50%_20%]", className)}
    />
  );
}

// The client's logo, or its initial on the brand color when the workspace has none.
export function WorkspaceLogo({ name, logoUrl, size = 38 }: { name: string; logoUrl: string | null; size?: number }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-xl object-contain" />;
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-xl bg-brand font-display text-lg font-bold text-on-brand"
    >
      {(name.trim()[0] ?? "Y").toUpperCase()}
    </span>
  );
}
