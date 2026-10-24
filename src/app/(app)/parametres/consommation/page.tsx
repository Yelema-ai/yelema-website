import { PageBody } from "@/components/app/PageBody";
import { UsageView } from "@/components/integrations/UsageView";

// Administration · Consommation : ce que les outils des experts ont coûté à l'espace, par membre,
// par application et appel par appel, pour ses admins. Tout est lu au back-office.
export default function Page() {
  return (
    <PageBody>
      <UsageView />
    </PageBody>
  );
}
