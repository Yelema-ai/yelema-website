"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isDriveClutter } from "@/lib/drive-order";
import { deliveryNotices, isMemberUpload, type DeliveryNotice } from "@/lib/drive-paths";
import { driveTree, onDriveChanged } from "@/lib/drive-store";
import { agentTabPath } from "@/lib/expert-tabs";
import { readNotifyPrefs, saveNotifyPrefs } from "@/lib/notify-prefs";
import { useOwnAgentId } from "@/components/conversations/useAllConversations";
import { usePoll } from "@/components/usePoll";
import { systemNotify } from "./system-notify";

// A file of the drive (three levels deep) the page has not seen yet is a new deliverable, announced
// like a reply (toast, system notification when the tab is hidden) unless switched off in Paramètres.
// The drive is read when something may have written there: a turn or a routine that ended, the tab
// shown again, and otherwise every 10 minutes while visible (a deliverable made from Telegram).
// The first reading is the baseline: nothing already there is announced.
const SAFETY_MS = 10 * 60_000;
// The expert writes its files as the turn ends: give it a moment.
const AFTER_EVENT_MS = 4_000;
// Back on the tab after this long away: one look.
const RETURN_MS = 2 * 60_000;
const TOAST_ID = "livrables";

export function DeliverableWatcher() {
  const agentId = useOwnAgentId();
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);
  const hiddenAt = useRef<number | null>(null);
  // What the pop-up on screen already announces: a new delivery joins it instead of piling up.
  const shown = useRef<DeliveryNotice[]>([]);

  const check = useCallback(
    async (maxAgeMs: number) => {
      if (!agentId) return;
      const tree = await driveTree(agentId, maxAgeMs).catch(() => null);
      // A folder that failed to list would read as files gone, then as new ones on the next pass.
      if (!tree || !tree.complete) return;
      // What the member brought is no deliverable of an Expert: never announced (Leslie, 30/10).
      const files = tree.entries.filter((e) => e.type === "file" && !e.hidden && !isDriveClutter(e) && !isMemberUpload(e.path));
      const before = seen.current;
      seen.current = new Set(files.map((f) => f.path));
      if (!before || !readNotifyPrefs().deliverable) return;
      // Never a pile (Leslie, 30/10: « trop de pop-ups »): ONE pop-up for everything delivered while it
      // shows, replaced as more comes, swiped away or closed at once, with « Ne plus afficher ».
      const fresh = deliveryNotices(files.filter((f) => !before.has(f.path)));
      if (!fresh.length) return;
      shown.current = [...shown.current.filter((n) => !fresh.some((f) => f.id === n.id)), ...fresh];
      const all = shown.current;
      const one = all.length === 1 ? all[0] : null;
      const count = all.reduce((n, d) => n + d.docs.length, 0);
      const title = one ? one.title : `${count} nouveaux livrables`;
      const text = all.map((n) => `${n.expert ? `${n.expert} : ` : ""}${n.docs.join(", ")}`).join("\n");
      // Several deliveries: one line per Expert, its name in bold, three at most (Leslie, 30/10 : « ça
      // doit rester clair, lisible et joli »).
      const description = one ? (
        one.description
      ) : (
        <ul className="mt-1 space-y-1">
          {all.slice(0, 3).map((n) => (
            <li key={n.id} className="line-clamp-2">
              {n.expert && <span className="font-semibold text-ink">{n.expert} </span>}
              {n.docs.join(", ")}
            </li>
          ))}
          {all.length > 3 && <li className="text-ink-3">et {all.length - 3} autres Experts</li>}
        </ul>
      );
      const open = () =>
        router.push(one ? `${agentTabPath(agentId, "files")}?dossier=${encodeURIComponent(one.folder)}` : "/livrables");
      const reset = () => {
        shown.current = [];
      };
      const stop = () => {
        void saveNotifyPrefs({ ...readNotifyPrefs(), deliverable: false });
        toast("Plus de pop-up pour les livrables", { description: "Ils restent dans la cloche. À réactiver dans Paramètres, Notifications.", duration: 5000 });
      };
      toast(title, {
        id: TOAST_ID,
        // Text on the whole width, the two buttons under it (globals.css): readable on a phone.
        className: "toast-stack",
        description,
        action: { label: "Ouvrir", onClick: open },
        cancel: { label: "Ne plus afficher", onClick: stop },
        // Secondary to « Ouvrir »: a quiet text button.
        cancelButtonStyle: { background: "transparent", color: "var(--ink-3)", border: "none", boxShadow: "none" },
        duration: 8000,
        onDismiss: reset,
        onAutoClose: reset,
      });
      if (document.hidden) systemNotify(title, text, TOAST_ID, open);
    },
    [agentId, router]
  );

  useEffect(() => {
    seen.current = null;
  }, [agentId]);

  // Mount, the tab shown again, and the safety net; never while hidden.
  usePoll(() => check(60_000), { everyMs: SAFETY_MS, enabled: Boolean(agentId) });

  useEffect(() => {
    if (!agentId) return;
    let timer: number | undefined;
    // Heard while hidden: looked at once the tab shows again.
    let pending = false;
    const off = onDriveChanged(agentId, () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.hidden) pending = true;
        else void check(0);
      }, AFTER_EVENT_MS);
    });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      if (pending || (hiddenAt.current !== null && Date.now() - hiddenAt.current >= RETURN_MS)) void check(0);
      pending = false;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      off();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [agentId, check]);

  return null;
}
