import { notFound, redirect } from "next/navigation";
import { backofficeAgentRow, requireUser } from "@/lib/auth";
import { authViaBackoffice } from "@/lib/runtime-config";
import { citedFolder, normDrivePath } from "@/lib/drive-links";
import { agentTabPath } from "@/lib/expert-tabs";
import type { AgentRow } from "@/lib/types";

// A deliverable an Expert cites outside the web app (Telegram, WhatsApp, Slack, Teams, e-mail: Leslie, 28/10,
// « dès qu'on clique dessus, on retrouve le livrable »): /livrables/ouvrir?p=Livrables/<Expert>/<chemin>. The
// link names no instance: it opens the signed-in member's own, at the cited folder (a file: its folder), on the
// page of the Expert whose drive folder it is when one matches, else on the instance's own Livrables.
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function OpenDeliverable({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const path = p ? normDrivePath(p.trim()) : "";
  if (!/^~\/Livrables(\/|$)/.test(path) || path.split("/").includes("..")) notFound();
  const folder = citedFolder(path) ?? citedFolder(path.slice(0, path.lastIndexOf("/"))) ?? "~/Livrables";

  let row: Pick<AgentRow, "agent37_id" | "profiles"> | null = null;
  if (authViaBackoffice()) {
    row = await backofficeAgentRow();
  } else {
    const { db, user } = await requireUser();
    const { data } = await db.from("agents").select("agent37_id, profiles").eq("owner_user_id", user.id).maybeSingle();
    row = (data as Pick<AgentRow, "agent37_id" | "profiles"> | null) ?? null;
  }
  if (!row) notFound();

  // The Expert's folder is its first name (« Livrables/Djeneba/… »); its profile is « <client>__<expert> ».
  const owner = fold(folder.split("/")[2] ?? "");
  const profile = owner ? ((row.profiles ?? []).find((pr) => fold(pr.split("__").pop() ?? "") === owner) ?? null) : null;
  // A file opens at once in its preview, over its folder: one click from the message, not two.
  const file = folder !== path && /\.[a-z0-9]{1,6}$/i.test(path.split("/").pop() ?? "") ? `&fichier=${encodeURIComponent(path)}` : "";
  redirect(`${agentTabPath(row.agent37_id, "files", profile)}?dossier=${encodeURIComponent(folder)}${file}`);
}
