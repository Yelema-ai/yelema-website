import { PageBody } from "@/components/app/PageBody";
import { CompanyProfileView } from "@/components/company/CompanyProfileView";

// Administration · Entreprise : la mémoire de l'entreprise pour chacun ; le logo et la présentation en
// plus pour l'administrateur. Rien n'est obligatoire ; ce qui manque est rappelé sur son accueil.
export default function Page() {
  return (
    <PageBody>
      <CompanyProfileView />
    </PageBody>
  );
}
