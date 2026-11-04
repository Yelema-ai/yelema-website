// TEMPORAIRE (diagnostic du 04/11, « i is not a function » au démontage) : repère l'effet React qui a gardé autre chose
// qu'une fonction de nettoyage et l'écrit dans les journaux du serveur. À retirer une fois la cause corrigée.
type Fiber = { child: Fiber | null; sibling: Fiber | null; return: Fiber | null; type: unknown; elementType: unknown; stateNode: unknown; memoizedProps: unknown; updateQueue: { lastEffect?: Effect | null } | null };
type Effect = { next: Effect; inst?: { destroy?: unknown }; destroy?: unknown };

const nameOf = (t: unknown): string => {
  const f = t as { displayName?: string; name?: string; render?: { name?: string }; type?: { name?: string } } | null;
  return (typeof t === "string" ? t : f?.displayName || f?.name || f?.render?.name || f?.type?.name) || "?";
};

function rootFiber(): Fiber | null {
  const el = document.body.querySelector("*");
  for (let n: Element | null = el; n; n = n.nextElementSibling) {
    const key = Object.keys(n).find((k) => k.startsWith("__reactFiber$"));
    if (key) {
      let f = (n as unknown as Record<string, Fiber>)[key] ?? null;
      while (f?.return) f = f.return;
      return f;
    }
  }
  return null;
}

function hostOf(f: Fiber): string {
  for (let c: Fiber | null = f.child; c; c = c.child) {
    if (c.stateNode instanceof Element) return `${c.stateNode.tagName.toLowerCase()}.${String(c.stateNode.className).slice(0, 80)} « ${(c.stateNode.textContent ?? "").slice(0, 60)} »`;
  }
  return "";
}

function scan(report: (line: string) => void): void {
  const stack: Fiber[] = [];
  const root = rootFiber();
  if (root) stack.push(root);
  let seen = 0;
  while (stack.length && seen++ < 30000) {
    const f = stack.pop()!;
    const last = f.updateQueue?.lastEffect;
    if (last) {
      let e = last.next;
      for (let i = 0; i < 50; i++) {
        const d = e.inst ? e.inst.destroy : e.destroy;
        if (d !== undefined && typeof d !== "function") {
          const owners: string[] = [];
          for (let o: Fiber | null = f; o && owners.length < 8; o = o.return) if (typeof o.type === "function" || typeof o.type === "object") owners.push(nameOf(o.type));
          report(`destroy=${typeof d}:${String(d).slice(0, 60)} composant=${nameOf(f.type)} props=${Object.keys((f.memoizedProps as object) ?? {}).join(",").slice(0, 200)} parents=${owners.join("<")} hote=${hostOf(f)}`);
        }
        if (e === last) break;
        e = e.next;
      }
    }
    if (f.sibling) stack.push(f.sibling);
    if (f.child) stack.push(f.child);
  }
}

export function startEffectSentinel(): () => void {
  const sent = new Set<string>();
  const report = (line: string) => {
    if (sent.has(line) || sent.size > 20) return;
    sent.add(line);
    const body = JSON.stringify({ where: "sonde", message: line, stack: "", digest: null, path: window.location.pathname });
    navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }));
  };
  const id = window.setInterval(() => {
    try {
      scan(report);
    } catch {
      /* la sonde ne casse jamais la page */
    }
  }, 1000);
  return () => window.clearInterval(id);
}
