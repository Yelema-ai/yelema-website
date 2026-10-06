import { MembersView } from "@/components/MembersView";
import { PageBody } from "@/components/app/PageBody";

// Administration : la liste des membres de l'espace, en lecture. L'espace lui-même, ses membres et
// leurs instances se gèrent dans le back-office Yelema ; il n'y a ni page « Espace » ni liste
// d'instances ici.
export default function Page() {
  return (
    <PageBody>
      <MembersView />
    </PageBody>
  );
}
