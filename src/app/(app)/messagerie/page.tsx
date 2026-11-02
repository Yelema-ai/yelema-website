"use client";

import { PageBody } from "@/components/app/PageBody";
import { Messaging } from "@/components/messaging/Messaging";

// Messagerie entre membres : salons des équipes et conversations directes avec les personnes et leurs experts.
export default function Page() {
  return (
    <PageBody>
      <div className="max-w-6xl">
        <Messaging />
      </div>
    </PageBody>
  );
}
