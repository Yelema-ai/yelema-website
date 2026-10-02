"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Champ des écrans d'authentification. Porté des maquettes (.mdf / .mdi) :
 * libellé au-dessus, boîte de 50 px, rayon 14, anneau de focus à la couleur de marque.
 * Distinct de `ui/input` à dessein — les écrans d'authentification ont leur propre
 * gabarit dans la charte.
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
    <label htmlFor={id} className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-ink-2">
      <span>{label}</span>
      <span
        className={cn(
          "flex h-[50px] items-center gap-1.5 rounded-[14px] border bg-card pr-1.5 pl-3.5 transition-shadow",
          "focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--soft-2)]",
          invalid && "border-ko shadow-[0_0_0_3px_rgba(180,35,24,0.14)]",
          className
        )}
      >
        <input
          id={id}
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-3"
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
        className="grid size-[38px] shrink-0 place-items-center rounded-[10px] text-ink-3 hover:text-ink-2"
      >
        {shown ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </Field>
  );
}
