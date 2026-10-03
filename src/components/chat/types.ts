// Shared client-side types for the chats (experts and business chat).

export type ToolStatus = "running" | "completed" | "error";

export interface ToolEvent {
  tool: string;
  status: ToolStatus;
  label?: string;
  durationMs?: number;
}

// A file that rode along with a user turn, shown as a chip in the sent message bubble.
// `path` is the instance path passed to the turn's `files`; `name` is the original filename.
export interface MessageAttachment {
  name: string;
  path: string;
  isImage: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  tools?: ToolEvent[];
  attachments?: MessageAttachment[];
}

let counter = 0;
// Monotonic-ish client id for optimistic messages / pending files.
export function uid(prefix = "c"): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

// One conversation in the Chat tab's thread rail. The Agent37 Agents API (GET /v1/sessions) is
// the source of truth for the list + ordering; the sessions route resolves `title` as the
// server-side title (when set, e.g. via rename) or the session's first-message preview.
export interface ChatSession {
  session_id: string;
  title: string | null;
  // Epoch ms of the last activity, for the rail's Aujourd'hui / Hier / … groups.
  last_active: number;
}
