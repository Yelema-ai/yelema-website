"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronDown, FileText, ListChecks, Loader2, Lock, Mail, Mic, ReceiptText, Send, Sheet, Sparkles, Sun } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { EnterpriseHome } from "@/components/enterprise/EnterpriseHome";
import { DictationBar } from "@/components/chat/ChatComposer";
import { useDictation } from "@/components/chat/useDictation";
import { useVoices } from "@/components/voice/useVoices";
import { CompanyProfileCard } from "@/components/company/CompanyProfileCard";
import { ExpertAvatar } from "@/components/experts/ExpertAvatar";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { useOwnAgentId } from "@/components/conversations/useAllConversations";
import { RecentActivity } from "@/components/home/RecentActivity";
import { ModelMenu } from "@/components/chat/ModelMenu";
import { EffortMenu } from "@/components/chat/EffortMenu";
import { useChatModels } from "@/components/chat/useChatModels";
import { findModel, prettyModelLabel, type ChatSettings } from "@/components/chat/types";
import { rememberSettings, rememberedSettings } from "@/components/chat/rememberedSettings";
import { expertCycle, expertRank, isDjeneba } from "@/lib/expert-cycle";
import { agentTabPath } from "@/lib/expert-tabs";
import type { Expert } from "@/lib/types";
import { cn } from "@/lib/utils";

// Four openers that suit any company, whoever the message goes to. A click writes a whole request
// in the field, with what is left to fill [between brackets], the first one selected (Leslie, 25/10:
// the label alone did not help to ask well).
const SHORTCUTS = [
  {
    label: "Point du matin",
    icon: Sun,
    prompt: "Fais-moi le point du matin : mes rendez-vous du jour, les e-mails importants arrivés depuis hier et ce qui attend une réponse de ma part. Termine par mes 3 priorités de la journée.",
  },
  {
    label: "Préparer une réunion",
    icon: CalendarDays,
    prompt: "Prépare ma réunion avec [qui] du [date] sur [sujet] : le contexte, nos derniers échanges, les points à aborder et les questions à poser.",
  },
  {
    label: "Résumer mes emails",
    icon: Mail,
    prompt: "Résume mes e-mails [d’aujourd’hui / de cette semaine] : ce qui est urgent, ce qui attend ma réponse, et propose une réponse courte pour chacun.",
  },
  {
    label: "Suivre un dossier",
    icon: ListChecks,
    prompt: "Où en est le dossier [nom du dossier] ? Les dernières actions, ce qui bloque, la prochaine étape et qui doit agir.",
  },
] as const;
// Who has the chat d'entreprise only (no Djénéba to read their mail or agenda): openers on the
// files they bring, as in the maquette of Serge's view.
const CHAT_SHORTCUTS = [
  { label: "Analyser un Excel", icon: Sheet, prompt: "Analyse le fichier Excel joint : les chiffres clés, les tendances, ce qui sort de l’ordinaire, puis 3 recommandations." },
  { label: "Résumer un PDF", icon: FileText, prompt: "Résume le PDF joint en 10 lignes : l’essentiel, les chiffres à retenir et les décisions à prendre." },
  { label: "Rédiger un email", icon: Mail, prompt: "Rédige un e-mail à [destinataire] pour [objet], sur un ton [cordial / formel], en 5 lignes maximum." },
  { label: "Vérifier une facture", icon: ReceiptText, prompt: "Vérifie la facture jointe : montants, TVA, dates et coordonnées. Signale ce qui ne va pas et ce qu’il faut demander au fournisseur." },
] as const;

// The field grows with what is written (up to about eight lines), so a whole request stays readable.
function grow(field: HTMLTextAreaElement) {
  field.style.height = "auto";
  field.style.height = `${Math.min(field.scrollHeight, 200)}px`;
}

// Puts a shortcut's request in the field and selects its first [blank], so typing replaces it.
function fillShortcut(field: HTMLTextAreaElement | null, prompt: string, setText: (t: string) => void) {
  setText(prompt);
  requestAnimationFrame(() => {
    if (!field) return;
    grow(field);
    field.focus();
    const start = prompt.indexOf("[");
    const end = start < 0 ? -1 : prompt.indexOf("]", start);
    if (start >= 0 && end > start) field.setSelectionRange(start, end + 1);
    else field.setSelectionRange(prompt.length, prompt.length);
  });
}

// The back office says the installation failed: said at once, with the experts concerned when it
// names them. Why it failed is Yelema's to see; nothing technical is shown.
function InstallFailed({ experts, partial }: { experts: string[]; partial: boolean }) {
  const names = new Intl.ListFormat("fr", { type: "conjunction" }).format(experts);
  return (
    <section role="alert" className={cn("max-w-2xl rounded-[22px] border border-ko/30 bg-ko-pale p-5 sm:p-6", partial ? "mt-3" : "mt-4")}>
      <h3 className="font-display text-lg font-bold text-ink">
        {partial ? "Une partie de votre équipe n’a pas pu être installée" : "Votre équipe n’a pas pu être installée"}
      </h3>
      <p className="mt-1 text-sm text-ink-2">
        {experts.length > 0 ? `L’installation de ${names} a échoué. ` : ""}
        Contactez Yelema pour que nous la relancions.
      </p>
    </section>
  );
}

// The installation has run for too long to still be waited for (useExperts gives up after a
// while): most likely it failed, which only Yelema can see and fix.
function InstallStalled() {
  return (
    <section role="status" className="mt-4 max-w-2xl rounded-[22px] border border-line bg-surface p-5 sm:p-6">
      <h3 className="font-display text-lg font-bold text-ink">L’installation prend plus de temps que prévu</h3>
      <p className="mt-1 text-sm text-ink-2">
        Vos Experts ne sont pas encore prêts. Contactez Yelema pour que nous regardions ce qui bloque ; vous pouvez
        aussi recharger cette page plus tard.
      </p>
    </section>
  );
}

// What the home shows while the back office installs the first experts. The list is read again on
// its own (useExperts), so the team replaces this card without a reload.
function Installing() {
  return (
    <section role="status" className="mt-4 max-w-2xl rounded-[22px] border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tint text-brand-ink">
          <Loader2 className="h-5 w-5 animate-spin" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold text-ink">Votre équipe s’installe</h3>
          <p className="mt-1 text-sm text-ink-2">
            Nous préparons vos Experts. Cela prend quelques minutes : ils apparaîtront ici dès qu’ils seront prêts,
            sans que vous ayez à recharger la page.
          </p>
        </div>
      </div>
    </section>
  );
}

// Accueil: greeting, the chat bar (to the chat d'entreprise, or to Djénéba for who has her; sending
// opens that chat with the message on its way), four shortcuts, then the latest deliverables. The
// team itself is in the menu; here only where its installation stands.
// Accueil: greeting, "Demander à mon équipe" (chips pick the expert; sending opens that expert's
// chat with the message on its way), then the team. Everything shown is what is installed for
// this user; the catalogue only dresses it.
const keyOf = (e: Expert) => `${e.agentId}:${e.profileId}`;
const rankOf = expertRank;

// The four openers follow whoever is picked (Leslie, 04/11): Djénéba's day (mail, agenda), an Expert's own
// first requests from the catalogue, and for the chat d'entreprise general ones that belong to no Expert.
function shortcutsFor(to: Expert | null): readonly { label: string; icon: typeof Sun; prompt: string }[] {
  if (to && !isDjeneba(to) && to.suggestions?.length)
    return to.suggestions.slice(0, 4).map((s) => ({ label: s.length > 34 ? `${s.slice(0, 32).trimEnd()}…` : s, icon: Sparkles, prompt: s }));
  return to && isDjeneba(to) ? SHORTCUTS : CHAT_SHORTCUTS;
}

/** A member with the company chat only gets its own home; everyone else the Experts' home. */
export function HomeView() {
  const { current } = useWorkspace();
  return current?.access === "entreprise" ? <EnterpriseHome /> : <ExpertsHome />;
}

function ExpertsHome() {
  const router = useRouter();
  const { current, userEmail, userFirstName } = useWorkspace();
  const { experts, loading, unreadable, installing, stalled, failed, failedExperts } = useExpertsContext();
  // The chat d'entreprise is the member's own instance with no Expert chosen; who has Djénéba may
  // write to her instead.
  const ownAgentId = useOwnAgentId();
  // Who gets the message: the chat d'entreprise, or any Expert of the team (Myriel, Leslie 30/10),
  // Djénéba first, then by cycle in the offer's order.
  const team = [...experts].sort((a, b) => rankOf(a) - rankOf(b));
  const [picked, setPicked] = useState<string>("entreprise");
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const to = team.find((e) => keyOf(e) === picked) ?? null;
  const shortcuts = shortcutsFor(to);

  // The model and effort of whoever gets the message, as they were last chosen (any screen).
  const { groups, defaultModel, loading: modelsLoading } = useChatModels(to?.agentId ?? ownAgentId ?? "", to?.profileId ?? null);
  const [settings, setSettings] = useState<ChatSettings>({ model: null, provider: null, reasoningEffort: null });
  useEffect(() => {
    if (modelsLoading) return;
    const r = rememberedSettings();
    const known = findModel(groups, r.model, r.provider);
    setSettings({ model: known ? r.model : null, provider: known ? r.provider : null, reasoningEffort: r.reasoningEffort });
  }, [modelsLoading, groups]);
  const choose = (next: ChatSettings) => {
    setSettings(next);
    rememberSettings(next);
  };
  const defaultLabel = useMemo(() => {
    const def = findModel(groups, defaultModel);
    return def ? prettyModelLabel(def.label) : modelsLoading ? "Chargement…" : "Par défaut";
  }, [groups, defaultModel, modelsLoading]);
  const hello = userFirstName || userEmail.split("@")[0];

  // The microphone of the chat, here too: what is said lands in the field, sent with Envoyer.
  const canDictate = useVoices().length > 0;
  const dictation = useDictation({
    expert: to?.catalogueKey ?? null,
    onText: (said) => setText((prev) => (prev.trim() ? `${prev.trim()} ${said}` : said)),
    onError: (message) => toast.error(message),
  });

  function send(message: string) {
    const m = message.trim();
    if (!m) return;
    const path = to ? agentTabPath(to.agentId, "chat", to.profileId) : ownAgentId ? agentTabPath(ownAgentId, "chat") : null;
    if (path) router.push(`${path}?q=${encodeURIComponent(m)}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(text);
    }
  }

  const company = current?.name ?? "votre entreprise";
  const hasText = text.trim().length > 0;

  return (
    <div className="relative min-h-full shrink-0 overflow-hidden">
      {/* La fleur Yelema en filigrane, à la couleur de l'entreprise, penchée et coupée en bas à gauche. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 size-[320px] -rotate-[18deg] bg-brand opacity-[0.05] max-sm:hidden"
        style={{ mask: "url(/fleur.svg) center / contain no-repeat", WebkitMask: "url(/fleur.svg) center / contain no-repeat" }}
      />
    <div className="relative mx-auto w-full max-w-[880px] px-4 pb-24 pt-10 sm:px-8 sm:pt-16">
      <h1 className="text-center font-display text-[34px] font-bold tracking-tight text-ink sm:text-[44px]">Bonjour {hello}</h1>
      <CompanyProfileCard />

      {ownAgentId && (
        <>
          <section className="mt-7 rounded-[22px] border border-line bg-surface p-4 shadow-[0_8px_30px_rgb(48_22_103_/_0.06)]">
            <textarea
              ref={field}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                grow(e.target);
              }}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder={to ? `Que voulez-vous confier à ${to.displayName} ?` : "Que puis-je faire pour vous ?"}
              className="w-full resize-none bg-transparent px-1 text-[16px] text-ink placeholder:text-ink-3 focus:outline-none"
            />
            {dictation.state !== "idle" ? (
              <DictationBar dictation={dictation} />
            ) : (
              <div className="flex items-center gap-2">
                {/* Who gets the message: the chat d'entreprise, or an Expert with its cycle. */}
                {team.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={cn("inline-flex h-9 min-w-0 items-center gap-2 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink hover:bg-soft", to ? "pl-1 pr-2.5" : "px-3")}>
                        {to ? <ExpertAvatar expert={{ ...to, gateway: null }} size="xs" /> : <Lock className="size-3.5 shrink-0" />}
                        <span className="truncate">{to ? to.displayName : "Chat d’entreprise"}</span>
                        <ChevronDown className="size-4 shrink-0 text-ink-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-[60vh] w-72 overflow-y-auto">
                      <DropdownMenuItem onSelect={() => setPicked("entreprise")} className="gap-2.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-tint text-brand-ink">
                          <Lock className="size-3.5" />
                        </span>
                        <span className="flex-1">Chat d’entreprise</span>
                        {!to && <Check className="size-4 text-brand-ink" />}
                      </DropdownMenuItem>
                      {team.map((e) => (
                        <DropdownMenuItem key={keyOf(e)} onSelect={() => setPicked(keyOf(e))} className="gap-2.5">
                          <ExpertAvatar expert={{ ...e, gateway: null }} size="xs" />
                          <span className="min-w-0 flex-1 truncate">{e.displayName}</span>
                          <span className="text-xs text-ink-3">{expertCycle(e)?.name}</span>
                          {to && keyOf(to) === keyOf(e) && <Check className="size-4 text-brand-ink" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-1 text-[13px] text-ink-3">
                    <Lock className="size-3.5" /> Votre IA privée. Rien ne sort de {company}.
                  </span>
                )}
                {groups.length > 0 && (
                  <span className="max-sm:hidden">
                    <ModelMenu
                      groups={groups}
                      model={settings.model}
                      defaultModel={defaultModel}
                      defaultLabel={defaultLabel}
                      onChange={(model, provider) => choose({ ...settings, model, provider })}
                    />
                  </span>
                )}
                <span className="max-sm:hidden">
                  <EffortMenu value={settings.reasoningEffort} onChange={(reasoningEffort) => choose({ ...settings, reasoningEffort })} />
                </span>
                {/* One button: the microphone while the field is empty, Envoyer once something is typed. */}
                {canDictate && !hasText ? (
                  <button
                    type="button"
                    onClick={() => void dictation.start()}
                    aria-label="Dicter un message"
                    title="Dicter un message"
                    className="ml-auto grid size-11 place-items-center rounded-full bg-brand text-on-brand transition-opacity hover:opacity-90"
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => send(text)}
                    disabled={!hasText}
                    className="ml-auto inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-[15px] font-semibold text-on-brand hover:opacity-90 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" /> Envoyer
                  </button>
                )}
              </div>
            )}
          </section>

          <div className="mt-3 flex flex-wrap justify-center gap-2 [scrollbar-width:none] max-sm:-mx-4 max-sm:flex-nowrap max-sm:justify-start max-sm:overflow-x-auto max-sm:px-4 [&::-webkit-scrollbar]:hidden">
            {shortcuts.map(({ label, icon: Icon, prompt }) => (
              <button
                key={label}
                type="button"
                onClick={() => fillShortcut(field.current, prompt, setText)}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink-2 hover:bg-soft hover:text-ink"
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-sm text-ink-3 max-sm:hidden">Plus vous donnez de contexte, meilleure sera la réponse.</p>
        </>
      )}

      {installing && experts.length > 0 && (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-ink-3">
          {stalled ? (
            "D’autres experts devaient arriver et tardent. Contactez Yelema s’ils n’apparaissent pas."
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> D’autres experts sont en cours d’installation.
            </>
          )}
        </p>
      )}
      {failed && <InstallFailed experts={failedExperts} partial={experts.length > 0} />}
      {failed && experts.length === 0 ? null : installing && experts.length === 0 ? (
        stalled ? (
          <InstallStalled />
        ) : (
          <Installing />
        )
      ) : loading && experts.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">Chargement de votre équipe…</p>
      ) : experts.length === 0 && (unreadable > 0 || !ownAgentId) ? (
        // With nothing unreadable, a member who has their chat d'entreprise is not waiting for anyone.
        <p className="mt-4 max-w-xl text-sm text-ink-2">
          {unreadable > 0
            ? "Votre équipe n’est pas joignable pour le moment. Réessayez dans un instant."
            : "Votre équipe s’installe. Vos Experts apparaîtront ici dès qu’ils seront prêts."}
        </p>
      ) : null}
      {ownAgentId && <RecentActivity agentId={ownAgentId} />}
    </div>
    </div>
  );
}
