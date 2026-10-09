"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { MIN_PASSWORD } from "@/config/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePasswordAction } from "./actions";

export function WelcomeForm({
  initialEmail,
  initialName,
}: {
  initialEmail: string;
  initialName: string;
}) {
  const [state, formAction, isPending] = useActionState(updatePasswordAction, null);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <h2 className="font-display text-[30px] font-bold tracking-tight text-ink">Bienvenue !</h2>
        <p className="mt-2 text-[15px] text-ink-2">
          Choisissez votre mot de passe pour <b className="text-ink">{initialEmail}</b>. Vous vous connecterez ensuite avec cette adresse.
        </p>
      </div>

      {state?.error ? (
        <div className="rounded-xl bg-danger-pale p-3 text-sm text-danger">
          {state.error}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">Prénom et nom</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          defaultValue={initialName}
          placeholder="Aïcha Diabaté"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmez le mot de passe</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="animate-spin" /> : null}
        Entrer dans mon espace {!isPending && <ArrowRight />}
      </Button>
    </form>
  );
}
