import { PageBody } from "@/components/app/PageBody";
import { ModelsView } from "@/components/models/ModelsView";
import { VoiceKeysView } from "@/components/integrations/VoiceKeysView";

// Intégrations · Modèles : le compte de modèle sur lequel tournent les experts. Pour un admin,
// celui de toute l'entreprise ou d'un membre ; pour un membre, d'où vient le sien, et sa propre clé
// si son admin l'a permis. Le back-office garde et pose les clés ; l'app n'écrit sur aucune instance.
// En bas, la clé de transcription de la voix (dictée, notes vocales) : l'ancien onglet Voix.
export default function Page() {
  return (
    <PageBody>
      <ModelsView />
      <section id="voix" className="mt-12 max-w-5xl scroll-mt-6 border-t border-line pt-8">
        <VoiceKeysView />
      </section>
    </PageBody>
  );
}
