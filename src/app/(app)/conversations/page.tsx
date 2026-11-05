import { PageBody } from "@/components/app/PageBody";
import { AllConversations } from "@/components/conversations/AllConversations";
import { initialConversations } from "@/lib/first-screen-server";

// Toutes les conversations : celles du chat d'entreprise et de chaque Expert, en une liste, lue avec la page.
// Not awaited: the page goes out at once and the server's reading streams in behind it.
export default function Page() {
  return (
    <PageBody>
      <AllConversations initial={initialConversations()} />
    </PageBody>
  );
}
