import { InstancesView } from "@/components/InstancesView";
import { PageBody } from "@/components/app/PageBody";

// Administration · Instances : la liste des instances de l'espace, en lecture, pour ses admins.
export default function Page() {
  return (
    <PageBody>
      <InstancesView />
    </PageBody>
  );
}
