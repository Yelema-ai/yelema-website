"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Send } from "lucide-react";
import { EXPERTS, getExpert } from "@/config/experts";
import { cn } from "@/lib/utils";
import { firstName, useApp } from "@/components/app/AppProvider";
import { ExpertAvatar } from "@/components/app/ExpertAvatar";

const DEFAULT_EXPERT = "djeneba";

function today(): string {
  const s = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// One expert's card: full-body portrait (the looping video on hover), name, title, tagline, "Écrire".
function ExpertCard({ expertKey }: { expertKey: string }) {
  const e = getExpert(expertKey)!;
  return (
    <div className="group flex flex-col overflow-hidden rounded-[24px] border border-line bg-surface transition-shadow hover:shadow-[0_20px_40px_-26px_rgba(23,17,43,.45)]">
      <Link href={`/experts/${e.key}`} className="relative block aspect-[4/5] overflow-hidden bg-[#8D68FA]/30">
        <video
          muted
          loop
          playsInline
          preload="none"
          poster={`/experts/pied/${e.key}.jpg`}
          className="h-full w-full object-cover object-top"
          onMouseEnter={(ev) => {
            if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) void ev.currentTarget.play().catch(() => {});
          }}
          onMouseLeave={(ev) => ev.currentTarget.pause()}
        >
          <source src={`/experts/vid/${e.key}.mp4`} type="video/mp4" />
        </video>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-[22px] font-bold tracking-tight text-ink">{e.name}</h3>
        <p className="text-sm text-ink-3">{e.title}</p>
        <p className="mt-3 line-clamp-2 flex-1 text-sm text-ink-2">{e.tagline}</p>
        <Link
          href={`/experts/${e.key}`}
          className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line text-[15px] font-semibold text-ink hover:bg-soft"
        >
          <MessageCircle className="h-4 w-4" /> Écrire
        </Link>
      </div>
    </div>
  );
}

// Accueil: greeting, "Demander à mon équipe" (Djénéba by default, chips switch the expert; sending
// opens that expert's chat with the message on its way), then the team.
export function HomeView() {
  const router = useRouter();
  const { user } = useApp();
  const [to, setTo] = useState(DEFAULT_EXPERT);
  const [text, setText] = useState("");
  const expert = getExpert(to)!;
  const hello = firstName(user.name) || user.email.split("@")[0];

  function send(message: string) {
    const m = message.trim();
    if (!m) return;
    router.push(`/experts/${to}?q=${encodeURIComponent(m)}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(text);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-6 sm:px-8">
      <p className="text-[15px] text-ink-3">{today()}</p>
      <h1 className="mt-1 font-display text-[34px] font-bold tracking-tight text-ink sm:text-[38px]">Bonjour {hello}</h1>

      <section className="mt-5 rounded-[22px] border border-line bg-surface p-4 shadow-[0_8px_30px_rgb(48_22_103_/_0.05)]">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-sm text-ink-3">À</span>
          {EXPERTS.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => setTo(e.key)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-full border pl-1 pr-3 text-[13px] font-semibold transition-colors",
                to === e.key ? "border-brand/40 bg-tint text-brand" : "border-line bg-surface text-ink-2 hover:bg-soft"
              )}
            >
              <ExpertAvatar expertKey={e.key} size={28} />
              {e.key === DEFAULT_EXPERT ? `${e.name}, qui répartit` : e.name}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder={`Que voulez-vous confier à ${expert.name} ?`}
          className="mt-3 w-full resize-none bg-transparent px-1 text-[16px] text-ink placeholder:text-ink-3 focus:outline-none"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => send(text)}
            disabled={!text.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-on-brand hover:opacity-90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" /> Envoyer
          </button>
        </div>
      </section>

      <div className="mt-3 flex flex-wrap gap-2">
        {expert.suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => send(s)}
            className="rounded-full border border-dashed border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-2 hover:border-brand/30 hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>

      <h2 className="mt-10 font-display text-[22px] font-bold tracking-tight text-ink">Mon équipe ({EXPERTS.length})</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {EXPERTS.map((e) => (
          <ExpertCard key={e.key} expertKey={e.key} />
        ))}
      </div>
    </div>
  );
}
