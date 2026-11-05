import { AnalyticsDashboard } from "@/components/settings/AnalyticsDashboard";
import { PageBody } from "@/components/app/PageBody";

// Administration · Analytics : vue chiffrée de la production, de l'activité des experts et des jetons IA.
export default function Page() {
  return (
    <PageBody>
      <AnalyticsDashboard />
    </PageBody>
  );
}
