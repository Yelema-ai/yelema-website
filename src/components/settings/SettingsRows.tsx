import { cn } from "@/lib/utils";

// Les réglages comme ChatGPT : une carte, une ligne par réglage, le libellé à gauche et la commande
// à droite (dessous sur téléphone).
export function SettingsCard({ children }: { children: React.ReactNode }) {
  return <div className="max-w-3xl divide-y divide-line rounded-[22px] border border-line bg-surface">{children}</div>;
}

// `inline` keeps a small control (a switch) beside its label on a phone too.
export function SettingsRow({ label, hint, inline, children }: { label: string; hint?: string; inline?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex gap-3 px-5 py-4", inline ? "items-center justify-between" : "flex-col sm:flex-row sm:items-center sm:justify-between")}>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
