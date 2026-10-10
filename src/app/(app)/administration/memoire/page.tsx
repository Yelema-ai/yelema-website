import { PageBody } from "@/components/app/PageBody";
import { MemoryView } from "@/components/memory/MemoryView";

// Administration · Mémoire : ce que les experts savent de l'entreprise. Chacun y voit les dépôts de
// ses compartiments ; l'administrateur et les responsables d'unité y déposent notes et documents.
export default function Page() {
  return (
    <PageBody>
      <MemoryView />
    </PageBody>
  );
}
