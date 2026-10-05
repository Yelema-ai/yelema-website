"use client";

import { FilesView } from "./FilesView";

// The native Files tab. The shell mounts this against the active agent (agentId, from the URL) and
// keeps it MOUNTED-BUT-HIDDEN across tab switches, so FilesView's current directory (held in
// useFileBrowser state) survives moving between tabs. `initialPath` is where it opens (an expert's own folder in the drive). Writes are gated server-side: the BFF routes
// enforce admin on every mutation, so there is nothing to gate in the UI yet.
export function FilesTab({ agentId, initialPath }: { agentId: string; initialPath?: string }) {
  return <FilesView agentId={agentId} initialPath={initialPath} />;
}
