import { BillingView } from "@/components/BillingView";
import { PageBody } from "@/components/app/PageBody";

// Administration · Facturation : le forfait de l'espace, sa prochaine échéance et ses factures,
// pour ses admins. Le paiement se fait sur la page du back-office ; l'app n'en crée aucun.
export default function Page() {
  return (
    <PageBody>
      <BillingView />
    </PageBody>
  );
}
