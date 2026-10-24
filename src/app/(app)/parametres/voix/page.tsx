import { PageBody } from "@/components/app/PageBody";
import { ExpertVoices } from "@/components/voice/ExpertVoices";

// Paramètres · Voix : la voix de chaque Expert quand je l'appelle, un choix à moi (la clé de
// transcription de l'entreprise reste dans Intégrations · Voix).
export default function Page() {
  return (
    <PageBody>
      <div className="max-w-5xl">
        <ExpertVoices />
      </div>
    </PageBody>
  );
}
