"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsView() {
  const { current } = useWorkspace();

  if (!current) return <p className="text-sm text-muted-foreground">No workspace selected.</p>;

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">{current.name}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ws-name">Workspace name</Label>
        <Input id="ws-name" readOnly value={current.name} />
        {/* Set in the Yelema back-office, which is its single source of truth. */}
        <p className="text-xs text-muted-foreground">Managed by {branding.appName}.</p>
      </div>

      <div className="space-y-2">
        <Label>Workspace ID</Label>
        <div className="flex gap-2">
          <Input readOnly value={current.id} className="font-mono text-xs" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              navigator.clipboard.writeText(current.id);
              toast.success("Copied");
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
