import { PageBody } from "@/components/app/PageBody";
import { OrgChartView } from "@/components/memory/OrgChartView";

// Administration · Organigramme : les unités de l'entreprise, la place de chaque membre, et les
// exceptions. C'est lui qui décide de ce que chaque expert lit dans la mémoire de l'entreprise.
export default function Page() {
  return (
    <PageBody>
      <OrgChartView />
    </PageBody>
  );
}
