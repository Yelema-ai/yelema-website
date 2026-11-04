"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cleanModel, type ModelChoice } from "@/lib/llm-accounts";
import { choiceLabel, filterModelGroups, type ModelGroup } from "@/lib/model-options";
import { cn } from "@/lib/utils";

type Item = { key: string; choice: ModelChoice | null; label: string; hint?: string; group?: string } | { key: "other"; other: true; label: string };

// Liste déroulante de modèles avec recherche : libellé lisible, identifiant en gris, rangés par
// fournisseur. Clavier : flèches, Entrée, Échap. `customProvider` ouvre « Autre identifiant… ».
export function ModelPicker({ groups, value, onChange, nullLabel, customProvider, placeholder = "Choisir un modèle", disabled, label, className }: {
  groups: readonly ModelGroup[];
  value: ModelChoice | null;
  onChange: (choice: ModelChoice | null) => void;
  /** Une première option qui remet à zéro (« Comme tous les experts »). */
  nullLabel?: string;
  customProvider?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Nom accessible du champ. */
  label: string;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    if (typing) return [];
    const out: Item[] = nullLabel && !query.trim() ? [{ key: "null", choice: null, label: nullLabel }] : [];
    for (const g of filterModelGroups(groups, query)) for (const m of g.models) out.push({ key: `${g.provider}::${m.id}`, choice: { provider: g.provider, model: m.id }, label: m.label, hint: m.id !== m.label ? m.id : undefined, group: g.label });
    const typed = customProvider ? cleanModel(query) : null;
    if (typed && !out.some((i) => "choice" in i && i.choice?.model === typed)) out.push({ key: `typed::${typed}`, choice: { provider: customProvider!, model: typed }, label: `Utiliser « ${typed} »` });
    if (customProvider) out.push({ key: "other", other: true, label: "Autre identifiant…" });
    return out;
  }, [groups, query, nullLabel, customProvider, typing]);

  useEffect(() => setActive(0), [query, typing]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => {
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);

  function close(refocus = true) {
    setOpen(false);
    setQuery("");
    setTyping(false);
    setError(null);
    if (refocus) trigger.current?.focus();
  }

  function pick(item: Item | undefined) {
    if (!item) return;
    if ("other" in item) return (setTyping(true), setQuery(""), search.current?.focus());
    onChange(item.choice);
    close();
  }

  function commitTyped() {
    const typed = cleanModel(query);
    if (!typed || !customProvider) return setError("Identifiant invalide : lettres, chiffres, . _ : / - uniquement.");
    onChange({ provider: customProvider, model: typed });
    close();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") return (e.preventDefault(), close());
    if (e.key === "Enter") return (e.preventDefault(), typing ? commitTyped() : pick(items[active]));
    if (typing) return;
    if (e.key === "ArrowDown") return (e.preventDefault(), setActive((a) => Math.min(a + 1, items.length - 1)));
    if (e.key === "ArrowUp") return (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
  }

  const shown = value ? choiceLabel(groups, value) : (nullLabel ?? placeholder);
  const known = value && groups.some((g) => g.provider === value.provider && g.models.some((m) => m.id === value.model));

  return (
    <div ref={root} data-model-picker className={cn("relative w-full sm:w-72", className)}>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label} : ${shown}`}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => (e.key === "ArrowDown" || e.key === "ArrowUp") && (e.preventDefault(), setOpen(true))}
        className="flex h-9 w-full items-center gap-2 rounded-full border border-line bg-surface px-3 text-left text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
      >
        <span className={cn("min-w-0 flex-1 truncate", !value && "text-ink-3")}>{shown}</span>
        {value && known && <span className="hidden max-w-[40%] truncate font-mono text-[10px] text-ink-3 sm:inline">{value.model}</span>}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 min-w-[16rem] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl sm:left-auto">
          <div className="relative border-b border-line">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
            <input
              ref={search}
              role="combobox"
              aria-expanded
              aria-controls={`${id}-list`}
              aria-activedescendant={!typing && items.length ? `${id}-opt-${active}` : undefined}
              aria-label={typing ? "Identifiant exact du modèle" : `Rechercher : ${label}`}
              value={query}
              onChange={(e) => (setQuery(e.target.value), setError(null))}
              onKeyDown={onKey}
              spellCheck={false}
              autoComplete="off"
              placeholder={typing ? "Identifiant exact, puis Entrée" : "Rechercher (Opus, GPT, Gemini…)"}
              className={cn("h-9 w-full bg-transparent pl-8 pr-3 text-xs text-ink outline-none", typing && "font-mono")}
            />
          </div>
          {error && <p role="alert" className="px-3 py-2 text-[11px] text-ko">{error}</p>}
          {!typing && (
            <ul id={`${id}-list`} role="listbox" aria-label={label} className="max-h-[min(60vh,20rem)] overflow-y-auto py-1">
              {items.map((item, i) => {
                const heading = "group" in item && item.group && (i === 0 || !("group" in items[i - 1]!) || (items[i - 1] as { group?: string }).group !== item.group);
                const selected = "choice" in item && (item.choice ? !!value && item.choice.provider === value.provider && item.choice.model === value.model : !value);
                return (
                  <li key={item.key} role="presentation">
                    {heading && <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-3">{(item as { group: string }).group}</p>}
                    <div
                      id={`${id}-opt-${i}`}
                      role="option"
                      aria-selected={selected}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => pick(item)}
                      onMouseMove={() => setActive(i)}
                      className={cn("flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs", i === active && "bg-soft", "other" in item && "italic text-ink-2")}
                    >
                      <span className="min-w-0 flex-1 truncate text-ink">{item.label}</span>
                      {"hint" in item && item.hint && <span className="max-w-[45%] truncate font-mono text-[10px] text-ink-3">{item.hint}</span>}
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-brand" />}
                    </div>
                  </li>
                );
              })}
              {items.length === 0 && <li className="px-3 py-3 text-center text-xs text-ink-3">Aucun modèle ne correspond.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
