"use client";

import { MyInstance } from "@/components/MyInstance";
import { PageBody } from "@/components/app/PageBody";
import { McpView } from "@/components/integrations/McpView";

export default function Page() {
  return (
    <PageBody>
      <div className="max-w-5xl">
        <MyInstance>{(agent) => <McpView agentId={agent.agent37_id} />}</MyInstance>
      </div>
    </PageBody>
  );
}
