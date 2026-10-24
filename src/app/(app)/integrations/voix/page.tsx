import { PageBody } from "@/components/app/PageBody";
import { VoiceKeysView } from "@/components/integrations/VoiceKeysView";

// Intégrations · Voix : la clé de transcription du client pour la dictée et les notes vocales. La
// voix de chaque Expert en appel est un choix de chacun : Paramètres · Voix.
export default function Page() {
  return (
    <PageBody>
      <div className="max-w-5xl space-y-8">
        <h2 className="sr-only">Voix</h2>
        <VoiceKeysView />
      </div>
    </PageBody>
  );
}
