"use client";

import { MyInstance } from "@/components/MyInstance";
import { PageBody } from "@/components/app/PageBody";
import { ChannelsTab } from "@/components/channels/ChannelsTab";

// Administration · Canaux : les messageries (Telegram, WhatsApp…) par lesquelles la personne
// connectée joint ses experts. L'instance est la sienne, elle peut donc les régler.
export default function Page() {
  return (
    <PageBody>
      <div className="max-w-3xl">
        <MyInstance>{(agent) => <ChannelsTab agentId={agent.agent37_id} agent={agent} canManage />}</MyInstance>
      </div>
    </PageBody>
  );
}
