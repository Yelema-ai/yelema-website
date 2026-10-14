"use client";

import { MyInstance } from "@/components/MyInstance";
import { PageBody } from "@/components/app/PageBody";
import { ChannelsTab } from "@/components/channels/ChannelsTab";

export default function Page() {
  return (
    <PageBody>
      <div className="max-w-3xl">
        <MyInstance>{(agent) => <ChannelsTab agentId={agent.agent37_id} agent={agent} canManage />}</MyInstance>
      </div>
    </PageBody>
  );
}
