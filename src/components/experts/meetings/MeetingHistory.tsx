"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { isUpcoming, type MeetingPage, type MeetingView } from "@/lib/meetings/view";
import { Button } from "@/components/ui/button";
import { MeetingRows, type RowActions } from "./MeetingList";

const SEARCH_DELAY_MS = 300;

const isHeld = (m: MeetingView): boolean => !isUpcoming(m.status);

interface Found {
  query: string;
  items: MeetingView[];
  next: string | null;
}

function MoreButton({ label, onMore }: { label: string; onMore: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      className="mx-auto rounded-full"
      onClick={async () => {
        setBusy(true);
        try {
          await onMore();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy && <Loader2 className="animate-spin" />} {label}
    </Button>
  );
}

export function MeetingHistory({
  expertName,
  items,
  hasMore,
  more,
  search,
  ...actions
}: {
  items: MeetingView[];
  hasMore: boolean;
  more: () => Promise<void>;
  search: (before: string | null, query: string | null) => Promise<MeetingPage>;
} & RowActions & { expertName: string }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wanted = query.trim();

  useEffect(() => {
    if (!wanted) {
      setFound(null);
      setError(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      search(null, wanted)
        .then((page) => live && setFound({ query: wanted, ...page }))
        .catch((e: Error) => live && setError(e.message));
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [wanted, search]);

  const searchMore = async () => {
    if (!found?.next) return;
    const page = await search(found.next, found.query);
    setFound((current) => (current?.query === found.query ? { ...current, items: [...current.items, ...page.items], next: page.next } : current));
  };

  const searching = wanted !== "";
  const shown = (searching ? (found?.query === wanted ? found.items : null) : items)?.filter(isHeld) ?? null;

  return (
    <section aria-label="Vos réunions et comptes rendus" className="flex flex-col gap-3">
      <h2 className="text-[16px] font-bold text-ink">Vos réunions et comptes rendus</h2>
      <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-brand">
        <Search className="size-4 shrink-0 text-ink-3" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          placeholder="Rechercher une réunion"
          aria-label="Rechercher une réunion"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" aria-label="Effacer" onClick={() => setQuery("")} className="grid size-6 place-items-center rounded-md text-ink-3 hover:text-ink">
            <X className="size-4" />
          </button>
        )}
      </label>

      {error && <p className="text-sm text-ko">{error}</p>}
      {!shown && !error && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-ink-3">
          <Loader2 className="size-4 animate-spin" /> Recherche…
        </p>
      )}
      {shown && !shown.length && <p className="py-6 text-center text-[13px] text-ink-3">{searching ? "Aucune réunion trouvée." : `Les réunions de ${expertName} et leurs comptes rendus apparaîtront ici.`}</p>}
      {shown && shown.length > 0 && <MeetingRows items={shown} {...actions} />}
      {searching
        ? found?.query === wanted && found.next && <MoreButton label="Chercher plus loin" onMore={searchMore} />
        : hasMore && <MoreButton label="Voir plus" onMore={more} />}
    </section>
  );
}
