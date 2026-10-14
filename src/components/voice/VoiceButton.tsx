"use client";

import { useEffect, useState } from "react";
import { AudioLines } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { readVoicePrefs, writeVoicePrefs, type VoicePrefs } from "@/lib/voice";
import { useVoices } from "./useVoices";
import { VoiceSettings } from "./VoiceSettings";

/** "Voix" in an expert's menu: the language and voice its calls (and dictation) take. */
export function VoiceButton({ expert, className, compact = false }: { expert: { key: string; name: string }; className?: string; compact?: boolean }) {
  const voices = useVoices();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<VoicePrefs>({ language: "fr", voices: {} });
  useEffect(() => {
    if (open) setPrefs(readVoicePrefs(expert.key));
  }, [open, expert.key]);
  if (voices.length === 0) return null;

  const save = () => {
    writeVoicePrefs(expert.key, prefs);
    toast.success(`Voix de ${expert.name} enregistrée.`);
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" size={compact ? "icon" : "sm"} className={className} onClick={() => setOpen(true)} aria-label={`Voix de ${expert.name}`} title={`Voix de ${expert.name}`}>
        <AudioLines />
        {!compact && "Voix"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Voix de {expert.name}</DialogTitle>
          <DialogDescription>La langue et la voix de {expert.name} quand vous l’appelez ; la dictée de son chat suit la même langue.</DialogDescription>
          <VoiceSettings voices={voices} prefs={prefs} onChange={setPrefs} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={save}>Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
