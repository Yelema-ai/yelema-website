"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type PickerOption = { value: string; label: string };
export type PickerGroup = { label?: string; options: PickerOption[] };

/** A choice in a list of our own (never the browser's native one, which a phone dresses its own way). */
export function Picker({
  value,
  onChange,
  groups,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  groups: PickerGroup[];
  placeholder: string;
  label: string;
  className?: string;
}) {
  const current = groups.flatMap((g) => g.options).find((o) => o.value === value);
  const shown = groups.filter((g) => g.options.length > 0);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label} : ${current?.label ?? placeholder}`}
          className={cn(
            "inline-flex h-11 min-w-0 max-w-full items-center justify-between gap-2 rounded-full border border-line bg-surface px-3.5 text-left text-[14px] text-ink hover:bg-soft focus-visible:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15 sm:h-9 sm:text-[13px]",
            !current && "text-ink-3",
            className
          )}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-ink-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(22rem,60dvh)] min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
        {shown.map((g, i) => (
          <DropdownMenuGroup key={g.label ?? i}>
            {i > 0 && <DropdownMenuSeparator />}
            {g.label && <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wide text-ink-3">{g.label}</DropdownMenuLabel>}
            {g.options.map((o) => (
              <DropdownMenuItem key={o.value} onSelect={() => onChange(o.value)}>
                {o.value === value ? <Check className="size-4 text-brand" /> : <span className="size-4" />} {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
