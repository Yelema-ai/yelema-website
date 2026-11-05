"use client";

import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// The expert header's « … »: what is not used at every message (Leslie, 04/11). `onAction` runs on a
// choice, not on opening the menu: on another tab, a choice brings the chat back first.
export function ExpertMoreMenu({ children, onAction }: { children: ReactNode; onAction?: () => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Plus d’actions" title="Plus d’actions" className="grid size-11 shrink-0 place-items-center rounded-full border bg-card text-ink hover:bg-soft lg:size-10">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[210px] rounded-[14px] p-1.5" onClickCapture={onAction}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
