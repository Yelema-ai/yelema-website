"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

interface Profile {
  firstName: string;
  lastName: string;
  jobTitle: string;
  email: string;
}

/** The user's own first name, last name and job title; the back office computes the full name. */
export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProfile(null);
    apiFetch<Profile>("/api/account").then(setProfile, (e: Error) => {
      toast.error(e.message);
      onOpenChange(false);
    });
  }, [open, onOpenChange]);

  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => setProfile((p) => (p ? { ...p, [k]: e.target.value } : p));
  const valid = Boolean(profile?.firstName.trim() && profile.lastName.trim());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !valid || saving) return;
    setSaving(true);
    try {
      await apiFetch("/api/account", {
        method: "PATCH",
        body: JSON.stringify({ firstName: profile.firstName, lastName: profile.lastName, jobTitle: profile.jobTitle }),
      });
      toast.success("Profil enregistré.");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Mon profil</DialogTitle>
        <DialogDescription>{profile?.email ?? "Chargement…"}</DialogDescription>
        {profile && (
          <form onSubmit={save} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-first">Prénom</Label>
                <Input id="profile-first" value={profile.firstName} onChange={set("firstName")} maxLength={100} required autoFocus />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-last">Nom</Label>
                <Input id="profile-last" value={profile.lastName} onChange={set("lastName")} maxLength={100} required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-job">Fonction</Label>
              <Input id="profile-job" value={profile.jobTitle} onChange={set("jobTitle")} maxLength={200} placeholder="Directrice administrative et financière" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={!valid || saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
