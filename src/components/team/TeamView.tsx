import Link from "next/link";
import { MessagesSquare, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ECHANGES_VISIBLE } from "@/lib/features";

export interface TeamMemberView {
  name: string | null;
  email: string;
  you: boolean;
  experts: { key: string; name: string; role: string | null; avatarUrl: string | null }[];
}

const initials = (s: string): string => s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

export function TeamView({ name, members }: { name: string; members: TeamMemberView[] }) {
  return (
    <div className="space-y-5">
      <header className="flex flex-col items-start justify-between gap-4 rounded-[22px] border border-line bg-surface p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-tint text-brand">
            <UsersRound className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{name}</h1>
            <p className="mt-1 max-w-xl text-sm text-ink-3">
              {members.length} membre{members.length > 1 ? "s" : ""}. Chacun a ses propres Experts : rien de ce que vous leur confiez n’est visible des autres.
            </p>
          </div>
        </div>
        {ECHANGES_VISIBLE && (
          <Button asChild>
            <Link href="/echanges">
              <MessagesSquare />
              Écrire à l’équipe
            </Link>
          </Button>
        )}
      </header>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {members.map((m) => (
          <li key={m.email} className="rounded-[18px] border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft-2 text-sm font-semibold text-ink-2">{initials(m.name ?? m.email)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {m.name ?? m.email}
                  {m.you && <span className="ml-2 rounded-full bg-tint px-2 py-0.5 text-[11px] font-semibold text-brand">Vous</span>}
                </p>
                {m.name && <p className="truncate text-xs text-ink-3">{m.email}</p>}
              </div>
            </div>
            {m.experts.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {m.experts.map((e) => (
                  <li key={e.key} className="flex items-center gap-1.5 rounded-full border border-line bg-soft/40 py-1 pl-1 pr-2.5 text-xs text-ink-2" title={e.role ?? undefined}>
                    {e.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-tint text-[10px] font-semibold text-brand">{e.name[0]}</span>
                    )}
                    <span className="font-semibold text-ink">{e.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-ink-3">Aucun Expert ouvert pour l’instant.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
