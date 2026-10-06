import { MembersView } from "@/components/MembersView";
import { PageBody } from "@/components/app/PageBody";

// Administration : la liste des membres de l'espace, en lecture. L'espace lui-même, ses membres et
// leurs instances se gèrent dans le back-office Yelema ; il n'y a pas de page « Espace ». Les
// admins ont en plus l'onglet Instances.
export default function Page() {
  return (
    <PageBody>
      <MembersView />
    </PageBody>
  );
}
