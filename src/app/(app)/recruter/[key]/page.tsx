import { PageBody } from "@/components/app/PageBody";
import { ExpertFiche } from "@/components/experts/ExpertFiche";

// La fiche de poste d'un expert du catalogue (/recruter/{clé}).
export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return (
    <PageBody>
      <ExpertFiche expertKey={key} />
    </PageBody>
  );
}
