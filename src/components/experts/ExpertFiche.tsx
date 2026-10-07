"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Check,
  Mail,
  Copy,
  FileCheck,
  FileText,
  Inbox,
  Lock,
  MapPin,
  MessageCircle,
  Play,
  Plug,
  Repeat,
  ShieldCheck,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { getExpert } from "@/config/experts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Colors of the numbered skill badges, cycling brand / coral / blue like the mockup.
const NUMBER_COLORS = ["bg-soft-2 text-brand", "bg-coral-pale text-coral-ink", "bg-[#E3E8FB] text-[#2E4EC4]"];

function plural(n: number, one: string, many: string) {
  return n > 1 ? many : one;
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mt-3.5">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <p className="text-[13.5px] text-ink-3">{sub}</p>
    </div>
  );
}

function Box({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[20px] border border-line bg-surface p-4", className)}>
      <h3 className="mb-2.5 flex items-center gap-2 text-base font-semibold text-ink">
        <Icon className="h-[18px] w-[18px] shrink-0 text-brand" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function IconList({ items, icon: Icon, iconClass }: { items: string[]; icon: LucideIcon; iconClass: string }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-[14.5px] leading-[1.45] text-ink">
          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// The read-only job sheet ("Fiche de poste") of one expert. Sized by its own width (container
// queries), so it fits whatever column the page gives it.

function ExpertEmailCard({ expertKey, expertName }: { expertKey: string; expertName: string }) {
  const [copied, setCopied] = useState(false);
  const email = `${expertKey}@agentmail.to`;

  const copy = () => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-[20px] border border-line bg-surface p-5 mt-3.5">
      <div className="flex items-center gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tint text-brand">
          <Mail className="h-5 w-5" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink text-[15px]">Adresse e-mail directe</span>
            <span className="inline-flex items-center rounded-full bg-ok-pale px-2 py-0.5 text-xs font-medium text-ok">
              Actif via AgentMail
            </span>
          </div>
          <p className="text-sm font-mono text-ink-2 mt-0.5">{email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Button variant="outline" size="sm" onClick={copy} className="rounded-full flex-1 sm:flex-none">
          {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copié !" : "Copier"}
        </Button>
        <Button asChild size="sm" variant="secondary" className="rounded-full flex-1 sm:flex-none">
          <a href={`mailto:${email}`}>
            Écrire par e-mail
          </a>
        </Button>
      </div>
    </div>
  );
}

export function ExpertFiche({ expertKey }: { expertKey: string }) {
  const expert = getExpert(expertKey);
  if (!expert) return null;
  const { name, pronoun } = expert;
  const counts = [
    { n: expert.skills.length, one: "compétence", many: "compétences" },
    { n: expert.deliverables.length, one: "livrable", many: "livrables" },
    { n: expert.routines.length, one: "routine", many: "routines" },
    { n: expert.tools.length, one: "outil", many: "outils" },
  ];

  return (
    <div className="@container flex w-full max-w-[1100px] flex-col gap-3.5">
      <header className="flex items-center gap-6 rounded-[24px] border border-line bg-surface p-6 @xl:p-7">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-brand">Fiche de poste</p>
          <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em] text-ink @xl:text-[28px]">
            {name}, {expert.role}
          </h1>
          <p className="mt-2.5 max-w-[760px] text-[17px] leading-[1.55] text-ink">{expert.pitch}</p>
          <p className="mt-2 text-sm text-ink-3">{expert.tagline}</p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {counts.map((c) => (
              <span key={c.one} className="rounded-full bg-soft-2 px-3 py-1.5 text-[13px] text-ink-2">
                <b className="text-brand tabular-nums">{c.n}</b> {plural(c.n, c.one, c.many)}
              </span>
            ))}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/experts/${expert.key}.jpg`}
          alt=""
          className="hidden h-[180px] w-[180px] shrink-0 rounded-[20px] bg-[#B79BD8] object-cover @2xl:block"
        />
      </header>

      <div className="flex flex-col items-start gap-2 rounded-[18px] bg-tint px-5 py-4 @xl:flex-row @xl:gap-3.5">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[12.5px] font-semibold text-on-brand">
          <Play className="h-3 w-3 fill-current" />
          En action
        </span>
        <p className="text-[15px] leading-[1.55] text-ink">{expert.inAction}</p>
      </div>

      <ExpertEmailCard expertKey={expert.key} expertName={name} />

      <SectionTitle title="Ses compétences" sub="Des savoir-faire déjà construits dans l’atelier Yelema" />
      <div className="grid gap-2.5 @xl:grid-cols-2 @3xl:grid-cols-3">
        {expert.skills.map((s, i) => (
          <div key={s.title} className="flex gap-3 rounded-2xl border border-line bg-surface p-3.5">
            <span
              className={cn(
                "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] text-[13px] font-extrabold tabular-nums",
                NUMBER_COLORS[i % NUMBER_COLORS.length]
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <b className="block text-[14.5px] text-ink">{s.title}</b>
              <span className="mt-0.5 block text-[13px] leading-[1.45] text-ink-3">{s.description}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3.5 @3xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Box icon={Sun} title="Au quotidien">
          <IconList items={expert.daily} icon={Check} iconClass="text-ok" />
        </Box>
        <Box icon={ShieldCheck} title="Soumis à votre accord">
          <IconList items={expert.approvals} icon={Lock} iconClass="text-coral-ink" />
          <p className="mt-2.5 text-xs text-ink-3">{name} demande votre validation avant chacune de ces actions.</p>
        </Box>
      </div>

      <SectionTitle
        title={`Ce qu’${pronoun} fait sans qu’on le demande`}
        sub={`Ses rendez-vous, tenus ${pronoun === "elle" ? "seule" : "seul"}, sans relance`}
      />
      <ul className="flex flex-col gap-2">
        {expert.routines.map((r) => (
          <li
            key={r.title}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint text-brand">
              <Repeat className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <b className="block text-sm text-ink">{r.title}</b>
              <span className="block text-[12.5px] text-ink-3">{r.cadence}</span>
            </div>
          </li>
        ))}
      </ul>

      <SectionTitle title="Ses livrables" sub="Prêts à relire, envoyés seulement après votre accord" />
      <div className="grid gap-2.5 @2xl:grid-cols-2">
        {expert.deliverables.map((d) => (
          <div key={d.title} className="flex gap-3 rounded-2xl border border-line bg-surface p-3.5">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-soft-2 text-ink-2">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <b className="block text-[14.5px] text-ink">{d.title}</b>
              <span className="mt-0.5 block text-[13px] leading-[1.45] text-ink-3">{d.description}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3.5 grid gap-3.5 @3xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Box icon={Inbox} title={`Ce dont ${pronoun} a besoin`}>
          <IconList items={expert.needs} icon={FileCheck} iconClass="text-ok" />
        </Box>
        <Box icon={Plug} title="Ses outils">
          <div className="flex flex-wrap gap-2">
            {expert.tools.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1.5 text-[13.5px] font-medium text-ink"
              >
                {t}
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-ink-3">Vous autorisez, vous révoquez quand vous voulez.</p>
        </Box>
      </div>

      <Box icon={MapPin} title="Sa maîtrise du terrain">
        <p className="max-w-[820px] text-sm leading-relaxed text-ink">{expert.terrain}</p>
      </Box>

      <div className="mt-3.5 flex flex-wrap items-center gap-3 rounded-[24px] border-2 border-brand bg-surface p-[22px]">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{name} est déjà dans votre équipe</p>
          <p className="text-[13px] text-ink-3">Posez-lui une question ou confiez-lui une tâche dans sa discussion.</p>
        </div>
        <Button asChild className="rounded-full">
          <Link href={`/experts/${expert.key}`}>
            <MessageCircle />
            Écrire à {name}
          </Link>
        </Button>
      </div>
    </div>
  );
}
