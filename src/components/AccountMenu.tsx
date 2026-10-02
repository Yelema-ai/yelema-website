"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";
import { useSupabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The account control, pinned to the BOTTOM of every sidebar (fleet and per-agent) and merged with
// sign-out. It names the organization but offers no workspace switching or creation: a deployment
// serves one client, whose single workspace belongs to the back-office.
export function AccountMenu() {
  const supabase = useSupabase();
  const { current, userEmail } = useWorkspace();

  const initial = (userEmail.trim()[0] ?? "?").toUpperCase();

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-between px-2 py-2 font-normal">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-medium text-secondary-foreground">
              {initial}
            </span>
            <span className="flex min-w-0 flex-col text-left">
              <span className="truncate text-sm">{userEmail}</span>
              <span className="truncate text-xs text-muted-foreground">
                {current?.name}
              </span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start" side="top">
        <DropdownMenuLabel className="flex items-center gap-2 font-normal">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-medium text-secondary-foreground">
            {initial}
          </span>
          <span className="min-w-0 truncate">{userEmail}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
