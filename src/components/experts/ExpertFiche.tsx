"use client";

import Link from "next/link";
import { FileText, MapPin, MessageCircle, Play, Sparkles, type LucideIcon } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { ExpertImage } from "@/components/experts/ExpertImage";
import { useCatalogue, useCatalogueExpert } from "@/components/experts/useCatalogue";
import { Button } from "@/components/ui/button";
import { agentTabPath } from "@/lib/expert-tabs";
import { cn } from "@/lib/utils";

// Colors of the numbered skill badges, cycling brand / coral / blue like the mockup.
const NUMBER_COLORS = ["bg-soft-2 text-brand-ink", "bg-coral-pale text-coral-ink", "bg-tint text-brand-ink"];

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mt-3.5">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {sub && <p className="text-[13.5px] text-ink-3">{sub}</p>}
    </div>
  );
}

function Box({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-tile border border-line bg-surface p-4">
      <h3 className="mb-2.5 flex items-center gap-2 text-base font-semibold text-ink">
        <Icon className="h-[18px] w-[18px] shrink-0 text-brand-ink" />
        {title}
      </h3>
      {children}
    </section>
  );
}

// The read-only sheet ("Fiche de poste") of one expert, written by Yelema in the back office.
// Sized by its own width (container queries), so it fits whatever column the page gives it. A
// section whose content the back office has not filled is simply left out.
export function ExpertFiche({ expertKey }: { expertKey: string }) {
  const { current } = useWorkspace();
  const expert = useCatalogueExpert(expertKey);
  const { catalogue } = useCatalogue(current?.id);

  if (expert === null) return <p className="text-sm text-ink-3">Chargement…</p>;
  if (expert === false) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-2xl font-semibold text-ink">Fiche indisponible</h1>
        <p className="mt-2 text-sm text-ink-2">Cette fiche n’existe pas, ou le catalogue n’est pas joignable pour le moment.</p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link href="/recruter">Voir tous les experts</Link>
        </Button>
      </div>
    );
  }

  const mine = catalogue.experts.find((e) => e.key === expert.key)?.installed[0] ?? null;
  const pitch = expert.salesDescription ?? expert.description;
  const skills = expert.skills.length > 0 ? expert.skills : expert.competencies.map((name) => ({ name, summary: null }));
  const image = expert.avatarUrl ?? expert.portraitUrl;
  const counts = [
    { n: skills.length, one: "compétence", many: "compétences" },
    { n: expert.deliverables.length, one: "livrable", many: "livrables" },
  ].filter((c) => c.n > 0);

  return (
    <div className="@container flex w-full max-w-[1100px] flex-col gap-3.5">
      <header className="flex items-center gap-6 rounded-card border border-line bg-surface p-6 @xl:p-7">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-brand-ink">Fiche de poste</p>
          <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em] text-ink @xl:text-[28px]">
            {expert.name}
            {expert.role ? `, ${expert.role}` : ""}
          </h1>
          {pitch && <p className="mt-2.5 max-w-[760px] text-[17px] leading-[1.55] text-ink">{pitch}</p>}
          {expert.tagline && <p className="mt-2 text-sm text-ink-3">{expert.tagline}</p>}
          {counts.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-2">
              {counts.map((c) => (
                <span key={c.one} className="rounded-full bg-soft-2 px-3 py-1.5 text-[13px] text-ink-2">
                  <b className="tabular-nums text-brand-ink">{c.n}</b> {c.n > 1 ? c.many : c.one}
                </span>
              ))}
            </div>
          )}
        </div>
        {image && (
          <ExpertImage src={image} size={180} className="hidden h-[180px] w-[180px] shrink-0 rounded-tile bg-[#B79BD8] object-cover object-top @2xl:block" />
        )}
      </header>

      {expert.useCase && (
        <div className="flex flex-col items-start gap-2 rounded-[18px] bg-tint px-5 py-4 @xl:flex-row @xl:gap-3.5">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[12.5px] font-semibold text-on-brand">
            <Play className="h-3 w-3 fill-current" />
            En action
          </span>
          <p className="text-[15px] leading-[1.55] text-ink">{expert.useCase}</p>
        </div>
      )}

      {expert.video.url && (
        <video
          controls
          preload="none"
          poster={expert.video.posterUrl ?? undefined}
          src={expert.video.url}
          className="aspect-video w-full rounded-card border border-line bg-black"
        />
      )}

      {skills.length > 0 && (
        <>
          <SectionTitle title="Ses compétences" sub="Des savoir-faire déjà construits dans l’atelier Yelema" />
          <div className="grid gap-2.5 @xl:grid-cols-2 @3xl:grid-cols-3">
            {skills.map((s, i) => (
              <div key={s.name} className="flex gap-3 rounded-2xl border border-line bg-surface p-3.5">
                <span
                  className={cn(
                    "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] text-[13px] font-extrabold tabular-nums",
                    NUMBER_COLORS[i % NUMBER_COLORS.length]
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <b className="block text-[14.5px] text-ink">{s.name}</b>
                  {s.summary && <span className="mt-0.5 block text-[13px] leading-[1.45] text-ink-3">{s.summary}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {expert.deliverables.length > 0 && (
        <>
          <SectionTitle title="Ses livrables" sub="Prêts à relire, envoyés seulement après votre accord" />
          <div className="grid gap-2.5 @2xl:grid-cols-2">
            {expert.deliverables.map((d) => (
              <div key={d.label} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
                {d.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.thumbnailUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-[10px] object-cover" />
                ) : (
                  <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-soft-2 text-ink-2">
                    <FileText className="h-4 w-4" />
                  </span>
                )}
                <b className="min-w-0 text-[14.5px] text-ink">{d.label}</b>
              </div>
            ))}
          </div>
        </>
      )}

      {(expert.valueAdd || expert.whyRelevant) && (
        <div className="mt-3.5 grid gap-3.5 @3xl:grid-cols-2">
          {expert.valueAdd && (
            <Box icon={Sparkles} title="Ce que vous y gagnez">
              <p className="text-sm leading-relaxed text-ink">{expert.valueAdd}</p>
            </Box>
          )}
          {expert.whyRelevant && (
            <Box icon={MapPin} title="Sa maîtrise du terrain">
              <p className="text-sm leading-relaxed text-ink">{expert.whyRelevant}</p>
            </Box>
          )}
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-3 rounded-card border-2 border-brand bg-surface p-[22px]">
        {mine ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{expert.name} est dans votre équipe</p>
              <p className="text-[13px] text-ink-3">Posez-lui une question ou confiez-lui une tâche dans sa discussion.</p>
            </div>
            <Button asChild className="rounded-full">
              <Link href={agentTabPath(mine.agentId, "chat", mine.profileId)}>
                <MessageCircle />
                Écrire à {expert.name}
              </Link>
            </Button>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{expert.name} n’est pas encore dans votre équipe</p>
            <p className="text-[13px] text-ink-3">Contactez Yelema ou l’administrateur de votre espace pour l’ajouter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
