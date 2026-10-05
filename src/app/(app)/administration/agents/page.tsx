import { AgentsView } from "@/components/AgentsView";
import { PageBody } from "@/components/app/PageBody";

// Les instances de l'organisation : celle de chaque membre, avec son état. Un admin y ouvre
// l'espace d'un membre ; un membre n'y voit que la sienne.
export default function Page() {
  return (
    <PageBody>
      <AgentsView />
    </PageBody>
  );
}
