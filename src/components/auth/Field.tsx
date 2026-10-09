"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A field of the signed-out screens: label above, then a box with the measures of `ui/input`
 * (44px, the same radius and focus ring). Kept apart from it because the box also holds what
 * sits beside the input (the eye button).
 */
export function Field({
  label,
  invalid,
  className,
  children,
  ...props
}: React.ComponentProps<"input"> & {
  label: string;
  invalid?: boolean;
  /** Rendu à droite dans la boîte (bouton œil, par exemple). */
  children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-2 text-[13px] font-semibold leading-none text-ink-2">
      <span>{label}</span>
      <span
        className={cn(
          "flex h-11 items-center gap-1.5 rounded-xl border border-line bg-surface pr-1 pl-4 transition-colors",
          "focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/15",
          invalid && "border-ko ring-2 ring-ko/15",
          className
        )}
      >
        <input
          id={id}
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-normal text-ink outline-none placeholder:text-ink-3"
          {...props}
        />
        {children}
      </span>
    </label>
  );
}

/** Champ de mot de passe avec bascule d'affichage. */
export function PasswordField({
  label,
  invalid,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { label: string; invalid?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} invalid={invalid} type={shown ? "text" : "password"} {...props}>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        className="grid size-9 shrink-0 place-items-center rounded-[10px] text-ink-3 hover:text-ink"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </Field>
  );
}
