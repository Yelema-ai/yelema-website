"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarClock, Check, FileText, Loader2, MessageCircle, ShieldCheck, Target, UserPlus, Zap } from "lucide-react";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { apiFetch } from "@/lib/api";
import { ExpertImage } from "@/components/experts/ExpertImage";
import { useCatalogue, useCatalogueExpert } from "@/components/experts/useCatalogue";
import { Button } from "@/components/ui/button";
import { agentTabPath } from "@/lib/expert-tabs";
import { cn } from "@/lib/utils";
import type { ExpertSheet } from "@/lib/types";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-card border border-line bg-surface p-5 @xl:p-6", className)}>
      <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

// The read-only sheet ("Fiche de poste") of one expert, written by Yelema in the back office.
// Sized by its own width (container queries), so it fits whatever column the page gives it. A
// section whose content the back office has not filled is simply left out.
export function ExpertFiche({ expertKey }: { expertKey: string }) {
  const { current } = useWorkspace();
  // Asking for an expert goes to the back office: offered only where the app signs in through it.
  const canRequest = usePublicConfig().authVia === "backoffice";
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const expert = useCatalogueExpert(expertKey);

  async function request() {
    setRequesting(true);
    try {
      await apiFetch(`/api/catalogue/${encodeURIComponent(expertKey)}/request`, { method: "POST" });
      setRequested(true);
      toast.success("Votre demande est transmise à Yelema.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRequesting(false);
    }
  }
  const { catalogue } = useCatalogue(current?.id);

  if (expert === null) return <p className="text-sm text-ink-3">Chargement…</p>;
  if (expert === false) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-2xl font-semibold text-ink">Fiche indisponible</h1>
        <p className="mt-2 text-sm text-ink-2">Cette fiche n’existe pas, ou le catalogue n’est pas joignable pour le moment.</p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link href="/recruter">Voir tous les Experts</Link>
        </Button>
      </div>
    );
  }

  const mine = catalogue.experts.find((e) => e.key === expert.key)?.installed[0] ?? null;
  const pitch = expert.salesDescription ?? expert.description;
  const skills = expert.skills.length > 0 ? expert.skills : expert.competencies.map((name) => ({ name, summary: null }));
  // The full-length portrait, as on the site; the head-and-shoulders one when there is none.
  const image = expert.portraitUrl ?? expert.avatarUrl;
  // The job sheet the catalogue serves (the site's words); without one, the catalogue's own fields.
  const site = expert.sheet;
  const tagline = site?.tagline ?? expert.tagline;
  const lead = site?.mission ?? pitch;
  const useCase = site?.inAction ?? expert.useCase;
  const does = expert.pronoun === "elle" ? "Ce qu’elle fait" : expert.pronoun === "il" ? "Ce qu’il fait" : `Ce que fait ${expert.name}`;

  return (
    <div className="@container flex w-full max-w-[1100px] flex-col gap-4">
      <header className="flex flex-col overflow-hidden rounded-card border border-line bg-surface @2xl:grid @2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col justify-center p-6 @xl:p-8">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-brand-ink">{site?.label ?? "Fiche de poste"}</p>
          <h1 className="mt-2 font-display text-[30px] font-bold leading-tight tracking-[-0.02em] text-ink @xl:text-[38px]">{expert.name}</h1>
          {expert.role && <p className="mt-1 text-[17px] font-semibold text-brand-ink">{expert.role}</p>}
          {site?.intro && <p className="mt-1 text-[13.5px] text-ink-3">{site.intro}</p>}
          {tagline && <p className="mt-4 max-w-[560px] font-display text-xl leading-snug text-ink @xl:text-[22px]">{tagline}</p>}
          {lead && <p className="mt-3 max-w-[620px] text-[15px] leading-[1.6] text-ink-2">{lead}</p>}
        </div>
        {image && (
          <div className="relative order-first aspect-[4/5] bg-[linear-gradient(160deg,#C5C4FF_0%,#8D68FA_100%)] @2xl:order-none @2xl:aspect-auto @2xl:min-h-[380px]">
            <ExpertImage src={image} sizes="(min-width: 48rem) 300px, 100vw" priority className="object-cover object-top" />
          </div>
        )}
      </header>

      {useCase && (
        <div className="flex flex-col items-start gap-2 rounded-[18px] bg-tint px-5 py-4 @xl:flex-row @xl:gap-3.5">
          {/* Une étiquette, pas un bouton : sans vidéo, un triangle de lecture promettait une lecture qui n'existe pas. */}
          <span className="inline-flex shrink-0 items-center gap-1.5 pt-px text-[12.5px] font-semibold uppercase tracking-[0.06em] text-brand-ink">
            <Zap className="h-3.5 w-3.5 fill-current" />
            Exemple
          </span>
          <p className="text-[15px] leading-[1.55] text-ink">{useCase}</p>
        </div>
      )}

      {/* Pas de vidéo sur la fiche de poste, même si le catalogue en sert une : la vidéo de survol reste sur les cartes de la galerie. */}

      {site ? (
        <SiteSections sheet={site} pronoun={site.pronoun ?? expert.pronoun} name={expert.name} />
      ) : (
        <>
      {skills.length > 0 && (
        <Section title={does}>
          <ul className="grid gap-x-8 gap-y-3.5 @2xl:grid-cols-2">
            {skills.map((s) => (
              <li key={s.name} className="flex gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-tint text-brand-ink">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <b className="block text-[15px] font-semibold leading-snug text-ink">{s.name}</b>
                  {s.summary && <span className="mt-0.5 block text-[13.5px] leading-[1.5] text-ink-2">{s.summary}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {expert.deliverables.length > 0 && (
        <Section title="Exemples de livrables">
          <ul className="grid gap-2.5 @xl:grid-cols-2 @3xl:grid-cols-3">
            {expert.deliverables.map((d) => (
              <li key={d.label} className="flex items-center gap-3 rounded-2xl bg-soft p-3">
                {d.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.thumbnailUrl} alt="" loading="lazy" className="size-11 shrink-0 rounded-[10px] object-cover" />
                ) : (
                  <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-surface text-brand-ink">
                    <FileText className="size-[18px]" />
                  </span>
                )}
                <span className="min-w-0 text-[14px] font-medium leading-snug text-ink">{d.label}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

        </>
      )}

      <div className="flex flex-col items-stretch gap-4 rounded-card border-2 border-brand bg-surface p-5 @xl:flex-row @xl:items-center @xl:p-6">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{mine ? `${expert.name} est dans votre équipe` : `${expert.name} n’est pas encore dans votre équipe`}</p>
          <p className="mt-0.5 text-[13.5px] text-ink-3">
            {mine
              ? "Posez-lui une question ou confiez-lui une tâche."
              : !canRequest
                ? "Contactez Yelema ou l’administrateur de votre espace pour l’ajouter."
                : requested
                  ? "Votre demande est transmise à Yelema, qui revient vers vous."
                  : "Yelema reçoit votre demande et revient vers vous. Rien n’est installé ni facturé sans votre accord."}
          </p>
        </div>
        {mine ? (
          <Button asChild size="lg" className="h-11 rounded-full px-6">
            <Link href={agentTabPath(mine.agentId, "chat", mine.profileId)}>
              <MessageCircle />
              Écrire à {expert.name}
            </Link>
          </Button>
        ) : (
          canRequest && (
            <Button size="lg" className="h-11 rounded-full px-6" onClick={request} disabled={requesting || requested}>
              {requesting ? <Loader2 className="animate-spin" /> : requested ? <Check /> : <UserPlus />}
              {requested ? "Demande envoyée" : `Demander ${expert.name}`}
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-[14.5px] leading-snug text-ink">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-tint text-brand-ink">
            <Check className="size-3" strokeWidth={3} />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((c) => (
        <li key={c} className="rounded-full border border-line bg-soft px-3 py-1 text-[13px] font-medium text-ink-2">
          {c}
        </li>
      ))}
    </ul>
  );
}

// The job sheet, section by section, in the site's words; a section the sheet leaves empty is not shown.
function SiteSections({ sheet, pronoun, name }: { sheet: ExpertSheet; pronoun: "il" | "elle" | null; name: string }) {
  const p = pronoun;
  const does = (what: string) => (p ? `Ce qu’${p} fait ${what}` : `Ce que fait ${name} ${what}`);
  return (
    <>
      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {sheet.daily.length > 0 && (
          <Section title={does("au quotidien")}>
            <Bullets items={sheet.daily} />
          </Section>
        )}
        {sheet.skills.length > 0 && (
          <Section title="Ses compétences">
            <ul className="grid gap-x-6 gap-y-3 @xl:grid-cols-2">
              {sheet.skills.map((s) => (
                <li key={s.name} className="min-w-0">
                  <b className="block text-[14.5px] font-semibold leading-snug text-ink">{s.name}</b>
                  {s.summary && <span className="mt-0.5 block text-[13px] leading-[1.5] text-ink-2">{s.summary}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {sheet.deliverables.length > 0 && (
        <Section title="Ses livrables">
          <p className="-mt-2 mb-3.5 text-[13.5px] text-ink-3">Prêts à relire, envoyés seulement après votre accord.</p>
          <ul className="grid gap-2.5 @xl:grid-cols-2 @3xl:grid-cols-3">
            {sheet.deliverables.map((d) => (
              <li key={d.label} className="flex gap-3 rounded-2xl bg-soft p-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface text-brand-ink">
                  <FileText className="size-4" />
                </span>
                <span className="min-w-0">
                  <b className="block text-[14px] font-semibold leading-snug text-ink">{d.label}</b>
                  {d.summary && <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-ink-2">{d.summary}</span>}
                </span>
              </li>
            ))}
          </ul>
          {sheet.templates.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[13px] font-semibold text-ink-2">Et ses modèles prêts, adaptés à votre maison</p>
              <Chips items={sheet.templates} />
            </div>
          )}
        </Section>
      )}

      {sheet.routines.length > 0 && (
        <Section title={does("sans qu’on le demande")}>
          <ul className="divide-y divide-line">
            {sheet.routines.map((r) => (
              <li key={r.label} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-4">
                <span className="flex items-center gap-2.5 text-[14.5px] text-ink">
                  <CalendarClock className="size-4 shrink-0 text-brand-ink" />
                  {r.label}
                </span>
                {r.when && <span className="shrink-0 pl-[26px] text-[12.5px] font-semibold text-ink-3 @xl:pl-0">{r.when}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-4 @3xl:grid-cols-2">
        {sheet.approval.length > 0 && (
          <Section title="Soumis à votre accord">
            <ul className="flex flex-col gap-2.5">
              {sheet.approval.map((t) => (
                <li key={t} className="flex gap-2.5 text-[14.5px] text-ink">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-coral-ink" />
                  {t}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {sheet.needs.length > 0 && (
          <Section title={p ? `Ce dont ${p} a besoin` : `Ce dont ${name} a besoin`}>
            <ul className="flex flex-col gap-2.5">
              {sheet.needs.map((t) => (
                <li key={t} className="flex gap-2.5 text-[14.5px] text-ink">
                  <Target className="mt-0.5 size-4 shrink-0 text-brand-ink" />
                  {t}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </>
  );
}
