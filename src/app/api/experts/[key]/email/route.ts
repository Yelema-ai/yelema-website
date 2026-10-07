import { requireUser } from "@/lib/auth";
import { handleError, json, readJson, ApiError } from "@/lib/http";
import { getOrCreateExpertInbox, listExpertMessages, sendExpertEmail, isAgentMailConfigured } from "@/lib/agentmail";
import { getExpert } from "@/config/experts";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    await requireUser();
    const { key } = await params;
    const expert = getExpert(key);
    if (!expert) {
      throw new ApiError(404, "expert_not_found", "Expert introuvable");
    }

    if (!isAgentMailConfigured()) {
      return json({
        configured: false,
        inbox: null,
        messages: [],
      });
    }

    const inbox = await getOrCreateExpertInbox(key);
    const messages = await listExpertMessages(inbox.inboxId, 15);

    return json({
      configured: true,
      inbox,
      messages,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    await requireUser();
    const { key } = await params;
    const expert = getExpert(key);
    if (!expert) {
      throw new ApiError(404, "expert_not_found", "Expert introuvable");
    }

    const body = await readJson<{
      to: string;
      subject: string;
      text?: string;
      html?: string;
      cc?: string[];
      bcc?: string[];
      attachments?: Array<{ filename: string; content: string; contentType?: string }>;
    }>(request);

    const inbox = await getOrCreateExpertInbox(key);
    const result = await sendExpertEmail(inbox.inboxId, body);

    return json({
      success: true,
      messageId: result.messageId || (result as any).id,
      threadId: result.threadId || (result as any).thread_id,
    });
  } catch (e) {
    return handleError(e);
  }
}
