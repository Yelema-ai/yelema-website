"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD } from "@/config/auth";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Where every access link lands (and the back office's): the person is signed in already and
// chooses their name and password, then enters the app.
export default function WelcomePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) return window.location.assign("/login");
        setEmail(data.user.email ?? "");
        setName((data.user.user_metadata?.name as string | undefined) ?? "");
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return toast.error(`Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`);
    if (password !== confirm) return toast.error("Les deux mots de passe ne correspondent pas.");
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password, data: { name: name.trim() } });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    window.location.assign("/accueil");
  }

  return (
    <AuthFrame>
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <h2 className="font-display text-[30px] font-bold tracking-tight text-ink">Bienvenue !</h2>
          <p className="mt-2 text-[15px] text-ink-2">
            Choisissez votre mot de passe{email ? <> pour <b className="text-ink">{email}</b></> : null}. Vous vous connecterez
            ensuite avec cette adresse.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Prénom et nom</Label>
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aïcha Diabaté" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmez le mot de passe</Label>
          <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={loading || email === null}>
          {loading ? <Loader2 className="animate-spin" /> : null}
          Entrer dans mon espace {!loading && <ArrowRight />}
        </Button>
      </form>
    </AuthFrame>
  );
}
