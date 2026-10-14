"use client";

import { MyInstance } from "@/components/MyInstance";
import { PageBody } from "@/components/app/PageBody";
import { ConnectorsView } from "@/components/integrations/ConnectorsView";

export default function Page() {
  return (
    <PageBody>
      <div className="max-w-5xl">
        <MyInstance>{(agent) => <ConnectorsView agentId={agent.agent37_id} />}</MyInstance>
      </div>
    </PageBody>
  );
}
