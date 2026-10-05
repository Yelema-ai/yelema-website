import { PageBody } from "@/components/app/PageBody";
import { ExpertGallery } from "@/components/experts/ExpertGallery";

// Recruter : tous les experts que Yelema propose, ceux de l'utilisateur marqués.
export default function Page() {
  return (
    <PageBody>
      <ExpertGallery />
    </PageBody>
  );
}
