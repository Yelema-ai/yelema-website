"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyAppearance, readAppearance, type Appearance } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Appearance; label: string; icon: typeof Sun }[] = [
  { value: "clair", label: "Clair", icon: Sun },
  { value: "sombre", label: "Sombre", icon: Moon },
  { value: "auto", label: "Automatique", icon: Monitor },
];

export function ThemeMenu() {
  const [appearance, setAppearance] = useState<Appearance>("auto");

  useEffect(() => setAppearance(readAppearance()), []);

  // En mode automatique, suivre les changements de préférence du système.
  useEffect(() => {
    if (appearance !== "auto") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [appearance]);

  function choose(a: Appearance) {
    setAppearance(a);
    applyAppearance(a);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Apparence"
        title="Apparence"
        className="grid size-10 place-items-center rounded-full border bg-card text-ink-2 hover:text-ink"
      >
        <Sun className="size-[18px] dark:hidden" />
        <Moon className="hidden size-[18px] dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          return (
            <DropdownMenuItem
              key={o.value}
              onClick={() => choose(o.value)}
              className={cn(
                "gap-2.5 rounded-[10px] px-2.5 py-2 text-sm",
                appearance === o.value && "bg-soft font-semibold text-ink"
              )}
            >
              <Icon className="size-4" />
              {o.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
