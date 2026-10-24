import { PageBody } from "@/components/app/PageBody";
import { AllConversations } from "@/components/conversations/AllConversations";

// Toutes les conversations : celles du chat d'entreprise et de chaque Expert, en une liste.
export default function Page() {
  return (
    <PageBody>
      <AllConversations />
    </PageBody>
  );
}
